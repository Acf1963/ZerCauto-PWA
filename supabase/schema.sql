-- ============================================================================
-- ZercAuto Gest PWA — PostgreSQL / Supabase Schema (Angola · AOA / Kz)
-- ============================================================================
-- Execute este script primeiro no Supabase SQL Editor.
-- Compatível 1:1 com o modelo local Dexie (IndexedDB) e src/lib/syncEngine.ts.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- Função de Trigger Reutilizável: Atualiza updated_at e incrementa sync_version
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.sync_version = COALESCE(OLD.sync_version, 0) + 1;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. PROFILES (Vinculado a auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'rececao'
    CHECK (role IN ('admin', 'chefe_oficina', 'rececao', 'mecanico')),
  permissions TEXT[] NOT NULL DEFAULT ARRAY['work_orders']::TEXT[],
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  sync_version INTEGER NOT NULL DEFAULT 1
);

-- Trigger automático: cria perfil em public.profiles ao registar utilizador em auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'role', ''), 'rececao');
  IF v_role NOT IN ('admin', 'chefe_oficina', 'rececao', 'mecanico') THEN
    v_role := 'rececao';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, phone, role, active)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
      split_part(COALESCE(NEW.email, 'utilizador@zercauto.ao'), '@', 1)
    ),
    NEW.email,
    NEW.raw_user_meta_data ->> 'phone',
    v_role,
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. CLIENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  nif TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  client_type TEXT NOT NULL DEFAULT 'particular'
    CHECK (client_type IN ('particular', 'empresa')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  sync_version INTEGER NOT NULL DEFAULT 1
);

-- ----------------------------------------------------------------------------
-- 3. VEHICLES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  license_plate TEXT NOT NULL UNIQUE,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER CHECK (year IS NULL OR (year >= 1950 AND year <= 2100)),
  vin TEXT,
  fuel_type TEXT,
  current_mileage INTEGER NOT NULL DEFAULT 0 CHECK (current_mileage >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  sync_version INTEGER NOT NULL DEFAULT 1
);

-- ----------------------------------------------------------------------------
-- 4. SUPPLIERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  nif TEXT,
  phone TEXT,
  email TEXT,
  category TEXT,
  payment_terms TEXT,
  delivery_eta TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  sync_version INTEGER NOT NULL DEFAULT 1
);

-- ----------------------------------------------------------------------------
-- 5. INVENTORY ITEMS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  stock_qty NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  min_stock_alert NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (min_stock_alert >= 0),
  cost_price_aoa NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cost_price_aoa >= 0),
  sell_price_aoa NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (sell_price_aoa >= 0),
  unit TEXT NOT NULL DEFAULT 'un',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  sync_version INTEGER NOT NULL DEFAULT 1
);

-- ----------------------------------------------------------------------------
-- 6. STOCK MOVEMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  item_name TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada', 'saida')),
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'un',
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  sync_version INTEGER NOT NULL DEFAULT 1
);

-- ----------------------------------------------------------------------------
-- 7. WORK ORDERS (Folhas de Obra)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  assigned_mechanic_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'diagnostico', 'orcamento', 'em_execucao', 'concluido', 'entregue', 'cancelado')),
  complaint_description TEXT,
  diagnosis_notes TEXT,
  entry_mileage INTEGER NOT NULL DEFAULT 0 CHECK (entry_mileage >= 0),
  parts_total_aoa NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (parts_total_aoa >= 0),
  labor_total_aoa NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (labor_total_aoa >= 0),
  discount_aoa NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_aoa >= 0),
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 14.00 CHECK (vat_rate >= 0),
  tax_aoa NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_aoa >= 0),
  grand_total_aoa NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (grand_total_aoa >= 0),
  payment_status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (payment_status IN ('pendente', 'parcial', 'link_online', 'liquidado')),
  payment_method TEXT,
  payment_link TEXT,
  period_key TEXT,
  opened_at TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  sync_version INTEGER NOT NULL DEFAULT 1
);

-- ----------------------------------------------------------------------------
-- 8. WORK ORDER ITEMS (Peças, Mão de Obra e Serviços Externos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('peca', 'mao_obra', 'servico_externo')),
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  sku TEXT,
  technician_name TEXT,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit TEXT DEFAULT 'un',
  unit_cost_aoa NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost_aoa >= 0),
  unit_price_aoa NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price_aoa >= 0),
  total_price_aoa NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_price_aoa >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  sync_version INTEGER NOT NULL DEFAULT 1
);

-- ----------------------------------------------------------------------------
-- 9. PAYMENTS (Pagamentos e Liquidações)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE RESTRICT,
  amount_aoa NUMERIC(14,2) NOT NULL CHECK (amount_aoa > 0),
  method TEXT NOT NULL CHECK (method IN ('multicaixa', 'transferencia', 'numerario', 'link_online')),
  status TEXT NOT NULL DEFAULT 'liquidado'
    CHECK (status IN ('pendente', 'parcial', 'link_online', 'liquidado')),
  reference_code TEXT,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_key TEXT,
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  sync_version INTEGER NOT NULL DEFAULT 1
);

-- ----------------------------------------------------------------------------
-- 10. WORKSHOP SETTINGS (Configuração Única da Oficina)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'ZercAuto Oficina Central',
  nif TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  fo_prefix TEXT NOT NULL DEFAULT 'FO-2026',
  default_currency TEXT NOT NULL DEFAULT 'AOA' CHECK (default_currency IN ('AOA', 'EUR')),
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 14.00 CHECK (vat_rate >= 0),
  hourly_rate_aoa NUMERIC(14,2) NOT NULL DEFAULT 12000.00 CHECK (hourly_rate_aoa >= 0),
  invoice_footer TEXT,
  auto_sync BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  sync_version INTEGER NOT NULL DEFAULT 1
);

-- ----------------------------------------------------------------------------
-- Triggers de Sincronização (updated_at + sync_version) em TODAS as tabelas
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_clients_updated_at ON public.clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_stock_movements_updated_at ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_updated_at
  BEFORE UPDATE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_work_orders_updated_at ON public.work_orders;
CREATE TRIGGER trg_work_orders_updated_at
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_work_order_items_updated_at ON public.work_order_items;
CREATE TRIGGER trg_work_order_items_updated_at
  BEFORE UPDATE ON public.work_order_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_workshop_settings_updated_at ON public.workshop_settings;
CREATE TRIGGER trg_workshop_settings_updated_at
  BEFORE UPDATE ON public.workshop_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- Índices para Chaves Estrangeiras, Pesquisa e Delta Sync (updated_at)
-- ----------------------------------------------------------------------------
-- Delta sync indexes
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON public.profiles (updated_at);
CREATE INDEX IF NOT EXISTS idx_clients_updated_at ON public.clients (updated_at);
CREATE INDEX IF NOT EXISTS idx_vehicles_updated_at ON public.vehicles (updated_at);
CREATE INDEX IF NOT EXISTS idx_suppliers_updated_at ON public.suppliers (updated_at);
CREATE INDEX IF NOT EXISTS idx_inventory_items_updated_at ON public.inventory_items (updated_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_updated_at ON public.stock_movements (updated_at);
CREATE INDEX IF NOT EXISTS idx_work_orders_updated_at ON public.work_orders (updated_at);
CREATE INDEX IF NOT EXISTS idx_work_order_items_updated_at ON public.work_order_items (updated_at);
CREATE INDEX IF NOT EXISTS idx_payments_updated_at ON public.payments (updated_at);
CREATE INDEX IF NOT EXISTS idx_workshop_settings_updated_at ON public.workshop_settings (updated_at);

-- Foreign key & lookup indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_client_id ON public.vehicles (client_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_license_plate ON public.vehicles (license_plate);

CREATE INDEX IF NOT EXISTS idx_inventory_items_supplier_id ON public.inventory_items (supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON public.inventory_items (sku);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item_id ON public.stock_movements (inventory_item_id);

CREATE INDEX IF NOT EXISTS idx_work_orders_order_number ON public.work_orders (order_number);
CREATE INDEX IF NOT EXISTS idx_work_orders_client_id ON public.work_orders (client_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_vehicle_id ON public.work_orders (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_mechanic_id ON public.work_orders (assigned_mechanic_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON public.work_orders (status);

CREATE INDEX IF NOT EXISTS idx_work_order_items_wo_id ON public.work_order_items (work_order_id);
CREATE INDEX IF NOT EXISTS idx_work_order_items_inv_id ON public.work_order_items (inventory_item_id);

CREATE INDEX IF NOT EXISTS idx_payments_work_order_id ON public.payments (work_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_recorded_by ON public.payments (recorded_by);
