-- freenotes: one synced workspace per user (JSON snapshot, versioned) and per-user assistant settings.
-- Applied to the hosted project via the Supabase MCP; kept here so self-hosters can run it with `supabase db push`.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'default',
  snapshot jsonb not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  profile text not null default '',
  provider text not null default 'default',
  model text,
  base_url text,
  api_key_ciphertext text,
  api_key_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;
alter table public.user_settings enable row level security;

create policy "workspaces: owner full access"
  on public.workspaces for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "user_settings: owner full access"
  on public.user_settings for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
