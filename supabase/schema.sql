-- MicroManus schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE throughout.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  avatar_url text,
  provider text,
  is_unlocked boolean not null default false,
  credits integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- coupons
-- ---------------------------------------------------------------------------
create table if not exists public.coupons (
  code text primary key,
  active boolean not null default true,
  max_uses integer,          -- null = unlimited
  used_count integer not null default 0
);

insert into public.coupons (code, active, max_uses, used_count)
values ('SID_DRDROID', true, null, 0)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  stripe_session_id text unique not null,
  amount_usd numeric(10, 2) not null,
  status text not null default 'pending', -- pending | completed | failed
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- provider_keys  (one row per user per provider)
-- ---------------------------------------------------------------------------
create table if not exists public.provider_keys (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'kimi')),
  encrypted_api_key text not null,   -- AES-256-GCM ciphertext, base64 (iv:tag:ciphertext)
  key_last4 text not null,           -- last 4 chars of the plaintext key, for masked display
  base_url text,
  default_model text not null,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- ---------------------------------------------------------------------------
-- chat_threads
-- ---------------------------------------------------------------------------
create table if not exists public.chat_threads (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content text not null default '',
  tool_calls_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_thread_id_idx on public.chat_messages(thread_id, created_at);

-- ---------------------------------------------------------------------------
-- usage_events
-- ---------------------------------------------------------------------------
create table if not exists public.usage_events (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  message_id uuid references public.chat_messages(id) on delete set null,
  model text not null,
  provider text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_thread_id_idx on public.usage_events(thread_id);

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  message_id uuid references public.chat_messages(id) on delete set null,
  title text not null,
  storage_url text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.payments enable row level security;
alter table public.provider_keys enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.usage_events enable row level security;
alter table public.reports enable row level security;
alter table public.coupons enable row level security;

-- users: a user can read/update only their own row
create policy "users select own" on public.users for select using (auth.uid() = id);
create policy "users update own" on public.users for update using (auth.uid() = id);

-- payments: read own rows; the checkout route (running with the user's own session) may
-- insert a "pending" row for itself, but only the service-role webhook may update status.
create policy "payments select own" on public.payments for select using (auth.uid() = user_id);
create policy "payments insert own" on public.payments for insert with check (auth.uid() = user_id);

-- provider_keys: full CRUD on own rows (server route uses the user's session, not service role)
create policy "provider_keys all own" on public.provider_keys for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- chat_threads: full CRUD on own rows
create policy "chat_threads all own" on public.chat_threads for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- chat_messages: access via parent thread ownership
create policy "chat_messages all via thread" on public.chat_messages for all
  using (exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()));

-- usage_events: access via parent thread ownership
create policy "usage_events all via thread" on public.usage_events for all
  using (exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()));

-- reports: access via parent thread ownership
create policy "reports all via thread" on public.reports for all
  using (exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()));

-- coupons: readable by any authenticated user (needed to validate codes client/server side),
-- no client writes — used_count increments happen via a SECURITY DEFINER function below.
create policy "coupons select all" on public.coupons for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Trigger: auto-create a public.users row when a new auth.users row appears
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, avatar_url, provider)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.raw_app_meta_data ->> 'provider', 'unknown')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Function: redeem a coupon atomically (unlock + grant credits, bump used_count)
-- Called from the server route with the user's session (SECURITY DEFINER lets it
-- also touch the coupons table, which regular users can only SELECT).
-- ---------------------------------------------------------------------------
create or replace function public.redeem_coupon(p_user_id uuid, p_code text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_active boolean;
  v_max integer;
  v_used integer;
begin
  select active, max_uses, used_count into v_active, v_max, v_used
  from public.coupons where code = p_code for update;

  if not found or not v_active then
    return false;
  end if;

  if v_max is not null and v_used >= v_max then
    return false;
  end if;

  update public.coupons set used_count = used_count + 1 where code = p_code;

  update public.users
  set is_unlocked = true, credits = credits + 5
  where id = p_user_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage bucket for generated PDF reports (private; served via signed URLs)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

create policy "reports storage: owner read"
  on storage.objects for select
  using (bucket_id = 'reports' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "reports storage: owner write"
  on storage.objects for insert
  with check (bucket_id = 'reports' and auth.uid()::text = (storage.foldername(name))[1]);
