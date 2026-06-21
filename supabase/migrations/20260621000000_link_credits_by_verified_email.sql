create extension if not exists pgcrypto with schema extensions;

update public.credit_accounts
set email_hash = encode(extensions.digest(lower(trim(email)), 'sha256'), 'hex')
where email is not null
  and trim(email) <> ''
  and email_hash is null;

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
