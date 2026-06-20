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

  update public.credit_accounts ca
  set balance = ca.balance + p_credits
  where ca.user_key = p_user_key
  returning true, ca.balance into credited, balance;

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
