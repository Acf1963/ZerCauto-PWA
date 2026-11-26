-- ZercAuto Gest — Esquema PostgreSQL + RLS para Supabase (Cloud Sync)
-- Execute no SQL Editor do Supabase para ativar sincronização bidirecional.

create table if not exists public.clients (
  id text primary key,
  name text not null,
  nif text not null,
  phone text not null,
  email text default '',
  address text default '',
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.vehicles (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  plate text not null unique,
  brand text not null,
  model text not null,
  year integer not null,
  vin text default '',
  mileage integer not null default 0,
  updated_at timestamptz default now()
);

create table if not exists public.suppliers (
  id text primary key,
  name text not null,
  phone text not null,
  delivery_eta text not null,
  specialty text not null,
  email text default '',
  updated_at timestamptz default now()
);

create table if not exists public.stock_items (
  id text primary key,
  sku text not null unique,
  name text not null,
  category text not null,
  supplier_id text references public.suppliers(id) on delete set null,
  supplier_name text not null,
  unit text not null default 'un',
  cost_price numeric not null default 0,
  sale_price numeric not null default 0,
  quantity numeric not null default 0,
  min_quantity numeric not null default 1,
  updated_at timestamptz default now()
);

create table if not exists public.stock_movements (
  id text primary key,
  stock_item_id text not null references public.stock_items(id) on delete cascade,
  sku text not null,
  item_name text not null,
  type text not null check (type in ('entrada', 'saida')),
  quantity numeric not null,
  unit text not null,
  reference text not null,
  created_at timestamptz default now()
);

create table if not exists public.work_orders (
  id text primary key,
  code text not null unique,
  client_id text not null references public.clients(id),
  client_name text not null,
  vehicle_id text not null references public.vehicles(id),
  vehicle_plate text not null,
  vehicle_label text not null,
  mileage integer not null,
  status text not null,
  diagnosis text not null,
  parts jsonb not null default '[]'::jsonb,
  labor jsonb not null default '[]'::jsonb,
  iva_rate numeric not null default 14,
  subtotal numeric not null default 0,
  iva_amount numeric not null default 0,
  total numeric not null default 0,
  cmv_total numeric not null default 0,
  payment_status text not null default 'Pendente',
  payment_method text,
  payment_link text,
  period_key text not null,
  opened_at text not null,
  updated_at timestamptz default now()
);

create table if not exists public.payment_records (
  id text primary key,
  work_order_id text not null references public.work_orders(id) on delete cascade,
  work_order_code text not null,
  client_name text not null,
  amount numeric not null,
  method text not null,
  status text not null,
  reference text default '',
  period_key text not null,
  paid_at text not null,
  updated_at timestamptz default now()
);

create table if not exists public.workshop_users (
  id text primary key,
  name text not null,
  email text not null unique,
  role text not null,
  session_state text not null,
  permissions jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  updated_at timestamptz default now()
);

create table if not exists public.workshop_settings (
  id text primary key,
  workshop_name text not null,
  nif text not null,
  phone text not null,
  address text not null,
  fo_prefix text not null default 'FO-2026',
  currency text not null default 'AOA',
  iva_rate numeric not null default 14,
  hourly_rate numeric not null default 12000,
  auto_sync boolean not null default true,
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table public.clients enable row level security;
alter table public.vehicles enable row level security;
alter table public.suppliers enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.work_orders enable row level security;
alter table public.payment_records enable row level security;
alter table public.workshop_users enable row level security;
alter table public.workshop_settings enable row level security;

-- Authenticated workshop staff policies
create policy "Authenticated access clients" on public.clients for all to authenticated using (true) with check (true);
create policy "Authenticated access vehicles" on public.vehicles for all to authenticated using (true) with check (true);
create policy "Authenticated access suppliers" on public.suppliers for all to authenticated using (true) with check (true);
create policy "Authenticated access stock_items" on public.stock_items for all to authenticated using (true) with check (true);
create policy "Authenticated access stock_movements" on public.stock_movements for all to authenticated using (true) with check (true);
create policy "Authenticated access work_orders" on public.work_orders for all to authenticated using (true) with check (true);
create policy "Authenticated access payment_records" on public.payment_records for all to authenticated using (true) with check (true);
create policy "Authenticated access workshop_users" on public.workshop_users for all to authenticated using (true) with check (true);
create policy "Authenticated access workshop_settings" on public.workshop_settings for all to authenticated using (true) with check (true);
