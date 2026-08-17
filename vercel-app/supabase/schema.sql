create extension if not exists pgcrypto;

create table if not exists public.menu_prices (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  menu text not null,
  channel text not null default '매장',
  store_name text not null default '전국 공통',
  price integer not null check (price > 0 and price <= 1000000),
  checked_at date not null,
  source_url text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_prices_unique_observation
    unique (brand, menu, channel, store_name)
);

create index if not exists menu_prices_menu_lookup
  on public.menu_prices (brand, menu, checked_at desc);

alter table public.menu_prices enable row level security;
revoke all on table public.menu_prices from anon, authenticated;
