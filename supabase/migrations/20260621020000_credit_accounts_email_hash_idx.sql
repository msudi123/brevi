create index if not exists credit_accounts_email_hash_idx
  on public.credit_accounts (email_hash)
  where email_hash is not null;
