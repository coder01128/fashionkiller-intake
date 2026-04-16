-- ============================================================
-- FashionKiller Intake — Database Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. Profiles (linked to Supabase auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  display_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. Products
-- ============================================================
create table public.products (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- Basics
  name text default '',
  code text default '',
  keywords text default '',
  description text default '',
  short_description text default '',
  category text default '',
  tags text default '',

  -- Arrays stored as JSONB
  sizes jsonb default '[]'::jsonb,
  colours jsonb default '[]'::jsonb,

  -- Stock
  stock_by_size jsonb default '{}'::jsonb,

  -- Pricing
  cost_price numeric(12,2),
  shipping_per_unit numeric(12,2),
  duty_multiplier numeric(6,3) default 1.34,
  retail_price numeric(12,2),
  sale_price numeric(12,2),
  currency text default 'ZAR',

  -- Inventory
  weight_grams integer,

  -- Supplier
  supplier_name text default '',
  supplier_url text default '',

  -- Specs (flexible key-value)
  specs jsonb default '{}'::jsonb,
  sizing_chart_data jsonb default '[]'::jsonb,
  care_instructions text default '',
  model_info text default '',

  -- Pipeline status
  slot1_status text default 'empty',
  slot2_status text default 'empty',
  slot3_status text default 'empty',
  manual_review_done boolean default false,

  -- Image references (array of storage paths)
  slot1_image_paths jsonb default '[]'::jsonb,
  slot2_image_paths jsonb default '[]'::jsonb,
  slot3_image_paths jsonb default '[]'::jsonb,
  gallery_image_paths jsonb default '[]'::jsonb,
  primary_image_path text,
  sizing_chart_image_path text,

  -- Ordering
  sort_order integer default 0,

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-update updated_at
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_updated_at
  before update on public.products
  for each row execute function public.update_updated_at();

-- Index for fast user lookups
create index idx_products_user_id on public.products(user_id);
create index idx_products_code on public.products(user_id, code);

-- ============================================================
-- 3. User Settings
-- ============================================================
create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  currency text default 'ZAR',
  default_duty_multiplier numeric(6,3) default 1.34,
  target_margin_pct integer default 60,
  sidebar_width integer default 280,
  api_key_encrypted text,  -- encrypted Anthropic key (encrypt client-side before storing)
  updated_at timestamptz default now()
);

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.update_updated_at();

-- ============================================================
-- 4. Row Level Security — users can only see/edit their own data
-- ============================================================
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.user_settings enable row level security;

-- Profiles: users see only their own
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Products: full CRUD on own products only
create policy "Users read own products"
  on public.products for select
  using (auth.uid() = user_id);

create policy "Users insert own products"
  on public.products for insert
  with check (auth.uid() = user_id);

create policy "Users update own products"
  on public.products for update
  using (auth.uid() = user_id);

create policy "Users delete own products"
  on public.products for delete
  using (auth.uid() = user_id);

-- Settings: own settings only
create policy "Users read own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "Users upsert own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

create policy "Users update own settings"
  on public.user_settings for update
  using (auth.uid() = user_id);

-- ============================================================
-- 5. Storage bucket for product images
-- ============================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', false);

-- Users can manage their own folder (path: {user_id}/*)
create policy "Users upload own images"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users read own images"
  on storage.objects for select
  using (bucket_id = 'product-images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users delete own images"
  on storage.objects for delete
  using (bucket_id = 'product-images' and auth.uid()::text = (storage.foldername(name))[1]);
