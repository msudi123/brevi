create table if not exists public.users (
  user_key text primary key,
  install_id text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_usage (
  user_key text not null references public.users(user_key) on delete cascade,
  usage_date date not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_key, usage_date)
);

create table if not exists public.summary_events (
  id bigint generated always as identity primary key,
  user_key text not null,
  article_url_hash text not null,
  status text not null check (status in ('success', 'limit', 'error', 'no_reliable_free_coverage')),
  source_url text,
  match_confidence text check (match_confidence in ('high', 'medium', 'low')),
  source_quality text check (source_quality in ('high', 'medium', 'low')),
  model text,
  error_category text,
  created_at timestamptz not null default now()
);

alter table public.summary_events
  add column if not exists match_confidence text check (match_confidence in ('high', 'medium', 'low'));

alter table public.summary_events
  add column if not exists source_quality text check (source_quality in ('high', 'medium', 'low'));

alter table public.summary_events
  drop constraint if exists summary_events_status_check;

alter table public.summary_events
  add constraint summary_events_status_check
  check (status in ('success', 'limit', 'error', 'no_reliable_free_coverage'));

create index if not exists summary_events_user_key_created_at_idx
  on public.summary_events (user_key, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists daily_usage_set_updated_at on public.daily_usage;
create trigger daily_usage_set_updated_at
before update on public.daily_usage
for each row execute function public.set_updated_at();

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

create extension if not exists pgcrypto with schema extensions;

update public.credit_accounts
set email_hash = encode(extensions.digest(lower(trim(email)), 'sha256'), 'hex')
where email is not null
  and trim(email) <> ''
  and email_hash is null;

create index if not exists credit_accounts_email_hash_idx
  on public.credit_accounts (email_hash)
  where email_hash is not null;

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
  v_email_hash text := case
    when p_email is null or trim(p_email) = '' then null
    else encode(extensions.digest(lower(trim(p_email)), 'sha256'), 'hex')
  end;
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

  insert into public.credit_accounts (user_key, install_id, email, email_hash, balance)
  values (p_user_key, p_install_id, p_email, v_email_hash, 0)
  on conflict (user_key) do update
    set install_id = coalesce(excluded.install_id, public.credit_accounts.install_id),
        email = coalesce(excluded.email, public.credit_accounts.email),
        email_hash = coalesce(excluded.email_hash, public.credit_accounts.email_hash);

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

  update public.credit_accounts ca
  set balance = ca.balance + p_credits
  where ca.user_key = p_user_key
  returning true, ca.balance into credited, balance;

  return next;
end;
$$;

create or replace function public.merge_credit_accounts_by_email(
  p_target_user_key text,
  p_email_hash text
)
returns table(merged_accounts integer, merged_balance integer, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_keys text[];
  v_merged_balance integer := 0;
begin
  if p_target_user_key is null or trim(p_target_user_key) = '' then
    raise exception 'target user key is required';
  end if;

  if p_email_hash is null or trim(p_email_hash) = '' then
    return query
      select 0, 0, coalesce(ca.balance, 0)
      from public.credit_accounts ca
      where ca.user_key = p_target_user_key;
    return;
  end if;

  select coalesce(array_agg(ca.user_key), '{}'::text[]), coalesce(sum(ca.balance), 0)
  into v_source_keys, v_merged_balance
  from public.credit_accounts ca
  where ca.email_hash = p_email_hash
    and ca.user_key <> p_target_user_key;

  insert into public.credit_accounts (user_key, email_hash, balance)
  values (p_target_user_key, p_email_hash, 0)
  on conflict (user_key) do update
    set email_hash = coalesce(public.credit_accounts.email_hash, excluded.email_hash);

  if coalesce(array_length(v_source_keys, 1), 0) > 0 then
    update public.credit_ledger
    set user_key = p_target_user_key
    where user_key = any(v_source_keys);

    update public.lemon_orders
    set user_key = p_target_user_key
    where user_key = any(v_source_keys);

    update public.credit_accounts
    set balance = balance + v_merged_balance
    where user_key = p_target_user_key;

    delete from public.credit_accounts
    where user_key = any(v_source_keys);
  end if;

  return query
    select
      coalesce(array_length(v_source_keys, 1), 0),
      v_merged_balance,
      ca.balance
    from public.credit_accounts ca
    where ca.user_key = p_target_user_key;
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

  update public.credit_accounts ca
  set balance = ca.balance - p_amount
  where ca.user_key = p_user_key
    and ca.balance >= p_amount
  returning true, ca.balance into spent, balance;

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

  select least(ca.balance, greatest(p_credits, 0))
  into v_amount
  from public.credit_accounts ca
  where ca.user_key = p_user_key;

  if coalesce(v_amount, 0) > 0 then
    update public.credit_accounts ca
    set balance = ca.balance - v_amount
    where ca.user_key = p_user_key
    returning ca.balance into balance;

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

  update public.lemon_orders lo
  set refunded = true
  where lo.lemon_order_id = p_lemon_order_id;

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
