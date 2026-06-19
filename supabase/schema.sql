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
  status text not null check (status in ('success', 'limit', 'error')),
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
