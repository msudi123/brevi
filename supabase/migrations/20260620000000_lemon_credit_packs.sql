create table if not exists public.credit_accounts (
  user_key text primary key,
  install_id text,
  email text,
  email_hash text,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id bigint generated always as identity primary key,
  user_key text not null references public.credit_accounts(user_key) on delete cascade,
  entry_type text not null check (entry_type in ('purchase', 'debit', 'refund', 'admin_adjustment')),
  amount integer not null check (amount <> 0),
  reason text,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.lemon_orders (
  lemon_order_id text primary key,
  user_key text not null references public.credit_accounts(user_key) on delete cascade,
  variant_id text not null,
  pack text not null,
  credits integer not null check (credits > 0),
  refunded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lemon_webhook_events (
  event_id text primary key,
  event_name text not null,
  lemon_order_id text,
  processed_at timestamptz not null default now()
);

create table if not exists public.rate_limit_buckets (
  key text not null,
  route text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (key, route)
);

create index if not exists credit_ledger_user_key_created_at_idx
  on public.credit_ledger (user_key, created_at desc);

create index if not exists lemon_orders_user_key_created_at_idx
  on public.lemon_orders (user_key, created_at desc);

drop trigger if exists credit_accounts_set_updated_at on public.credit_accounts;
create trigger credit_accounts_set_updated_at
before update on public.credit_accounts
for each row execute function public.set_updated_at();

drop trigger if exists lemon_orders_set_updated_at on public.lemon_orders;
create trigger lemon_orders_set_updated_at
before update on public.lemon_orders
for each row execute function public.set_updated_at();

create or replace function public.grant_purchased_credits(
  p_user_key text,
  p_install_id text,
  p_email text,
  p_lemon_order_id text,
  p_lemon_event_id text,
  p_variant_id text,
  p_pack text,
  p_credits integer
)
returns table(credited boolean, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id text := coalesce(nullif(p_lemon_event_id, ''), 'order_created:' || p_lemon_order_id);
  v_inserted_order_count integer := 0;
begin
  if p_credits <= 0 then
    raise exception 'credits must be positive';
  end if;

  insert into public.lemon_webhook_events (event_id, event_name, lemon_order_id)
  values (v_event_id, 'order_created', p_lemon_order_id)
  on conflict (event_id) do nothing;

  if not found then
    return query
      select false, ca.balance
      from public.credit_accounts ca
      where ca.user_key = p_user_key;
    return;
  end if;

  insert into public.credit_accounts (user_key, install_id, email, balance)
  values (p_user_key, p_install_id, p_email, 0)
  on conflict (user_key) do update
    set install_id = coalesce(excluded.install_id, public.credit_accounts.install_id),
        email = coalesce(excluded.email, public.credit_accounts.email);

  insert into public.lemon_orders (lemon_order_id, user_key, variant_id, pack, credits)
  values (p_lemon_order_id, p_user_key, p_variant_id, p_pack, p_credits)
  on conflict (lemon_order_id) do nothing;

  get diagnostics v_inserted_order_count = row_count;
  if v_inserted_order_count = 0 then
    return query
      select false, ca.balance
      from public.credit_accounts ca
      where ca.user_key = p_user_key;
    return;
  end if;

  insert into public.credit_ledger (user_key, entry_type, amount, reason, reference_id, metadata)
  values (
    p_user_key,
    'purchase',
    p_credits,
    'lemon_squeezy_order_created',
    p_lemon_order_id,
    jsonb_build_object('variant_id', p_variant_id, 'pack', p_pack, 'event_id', v_event_id)
  );

  update public.credit_accounts
  set balance = balance + p_credits
  where user_key = p_user_key
  returning true, public.credit_accounts.balance into credited, balance;

  return next;
end;
$$;

create or replace function public.spend_paid_credit(
  p_user_key text,
  p_amount integer default 1,
  p_reason text default 'summary',
  p_reference_id text default null
)
returns table(spent boolean, balance integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  update public.credit_accounts
  set balance = balance - p_amount
  where user_key = p_user_key
    and balance >= p_amount
  returning true, public.credit_accounts.balance into spent, balance;

  if not found then
    return query
      select false, coalesce(ca.balance, 0)
      from public.credit_accounts ca
      where ca.user_key = p_user_key;
    return;
  end if;

  insert into public.credit_ledger (user_key, entry_type, amount, reason, reference_id)
  values (p_user_key, 'debit', -p_amount, p_reason, p_reference_id);

  return next;
end;
$$;

create or replace function public.refund_purchased_credits(
  p_user_key text,
  p_lemon_order_id text,
  p_lemon_event_id text,
  p_credits integer
)
returns table(refunded boolean, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id text := coalesce(nullif(p_lemon_event_id, ''), 'order_refunded:' || p_lemon_order_id);
  v_amount integer;
begin
  insert into public.lemon_webhook_events (event_id, event_name, lemon_order_id)
  values (v_event_id, 'order_refunded', p_lemon_order_id)
  on conflict (event_id) do nothing;

  if not found then
    return query
      select false, ca.balance
      from public.credit_accounts ca
      where ca.user_key = p_user_key;
    return;
  end if;

  select least(balance, greatest(p_credits, 0))
  into v_amount
  from public.credit_accounts
  where user_key = p_user_key;

  if coalesce(v_amount, 0) > 0 then
    update public.credit_accounts
    set balance = balance - v_amount
    where user_key = p_user_key
    returning public.credit_accounts.balance into balance;

    insert into public.credit_ledger (user_key, entry_type, amount, reason, reference_id, metadata)
    values (
      p_user_key,
      'refund',
      -v_amount,
      'lemon_squeezy_order_refunded',
      p_lemon_order_id,
      jsonb_build_object('event_id', v_event_id)
    );
  else
    select ca.balance into balance
    from public.credit_accounts ca
    where ca.user_key = p_user_key;
  end if;

  update public.lemon_orders
  set refunded = true
  where lemon_order_id = p_lemon_order_id;

  refunded := true;
  return next;
end;
$$;

create or replace function public.check_rate_limit(
  p_key text,
  p_route text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, count integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'invalid rate limit';
  end if;

  insert into public.rate_limit_buckets (key, route, window_start, count)
  values (p_key, p_route, v_window_start, 1)
  on conflict (key, route) do update
    set window_start = case
          when public.rate_limit_buckets.window_start < excluded.window_start then excluded.window_start
          else public.rate_limit_buckets.window_start
        end,
        count = case
          when public.rate_limit_buckets.window_start < excluded.window_start then 1
          else public.rate_limit_buckets.count + 1
        end,
        updated_at = now()
  returning public.rate_limit_buckets.count,
            public.rate_limit_buckets.window_start + make_interval(secs => p_window_seconds)
  into count, reset_at;

  allowed := count <= p_limit;
  return next;
end;
$$;
