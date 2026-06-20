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
