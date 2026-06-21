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
