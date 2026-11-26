-- ============================================================================
-- ZercAuto Gest PWA — Row Level Security (RLS) & RBAC Policies
-- ============================================================================
-- Execute este script após supabase/schema.sql no Supabase SQL Editor.
-- Usa funções SECURITY DEFINER não-recursivas para evitar ciclos ao ler profiles.
-- ============================================================================

-- 1. Ativar RLS em TODAS as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_settings ENABLE ROW LEVEL SECURITY;

-- 2. Funções auxiliares não-recursivas (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.active = true
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.get_user_role() IN ('admin', 'chefe_oficina', 'rececao', 'mecanico'),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

REVOKE ALL ON FUNCTION public.is_active_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_staff() TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Policies: PROFILES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_policy ON public.profiles;
CREATE POLICY profiles_select_policy ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.get_user_role() IN ('admin', 'chefe_oficina')
    OR (public.is_active_staff() AND active = true AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS profiles_insert_policy ON public.profiles;
CREATE POLICY profiles_insert_policy ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('admin', 'chefe_oficina'));

DROP POLICY IF EXISTS profiles_update_policy ON public.profiles;
CREATE POLICY profiles_update_policy ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina'))
  WITH CHECK (public.get_user_role() IN ('admin', 'chefe_oficina'));

DROP POLICY IF EXISTS profiles_delete_policy ON public.profiles;
CREATE POLICY profiles_delete_policy ON public.profiles
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina'));

-- ----------------------------------------------------------------------------
-- 4. Policies: WORKSHOP SETTINGS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS workshop_settings_select_policy ON public.workshop_settings;
CREATE POLICY workshop_settings_select_policy ON public.workshop_settings
  FOR SELECT TO authenticated
  USING (public.is_active_staff());

DROP POLICY IF EXISTS workshop_settings_insert_policy ON public.workshop_settings;
CREATE POLICY workshop_settings_insert_policy ON public.workshop_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('admin', 'chefe_oficina'));

DROP POLICY IF EXISTS workshop_settings_update_policy ON public.workshop_settings;
CREATE POLICY workshop_settings_update_policy ON public.workshop_settings
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina'))
  WITH CHECK (public.get_user_role() IN ('admin', 'chefe_oficina'));

DROP POLICY IF EXISTS workshop_settings_delete_policy ON public.workshop_settings;
CREATE POLICY workshop_settings_delete_policy ON public.workshop_settings
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina'));

-- ----------------------------------------------------------------------------
-- 5. Policies: CLIENTS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS clients_select_policy ON public.clients;
CREATE POLICY clients_select_policy ON public.clients
  FOR SELECT TO authenticated
  USING (public.is_active_staff());

DROP POLICY IF EXISTS clients_insert_policy ON public.clients;
CREATE POLICY clients_insert_policy ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('admin', 'chefe_oficina', 'rececao'));

DROP POLICY IF EXISTS clients_update_policy ON public.clients;
CREATE POLICY clients_update_policy ON public.clients
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina', 'rececao'))
  WITH CHECK (
    public.get_user_role() IN ('admin', 'chefe_oficina')
    OR (public.get_user_role() = 'rececao' AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS clients_delete_policy ON public.clients;
CREATE POLICY clients_delete_policy ON public.clients
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina'));

-- ----------------------------------------------------------------------------
-- 6. Policies: VEHICLES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS vehicles_select_policy ON public.vehicles;
CREATE POLICY vehicles_select_policy ON public.vehicles
  FOR SELECT TO authenticated
  USING (public.is_active_staff());

DROP POLICY IF EXISTS vehicles_insert_policy ON public.vehicles;
CREATE POLICY vehicles_insert_policy ON public.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('admin', 'chefe_oficina', 'rececao'));

DROP POLICY IF EXISTS vehicles_update_policy ON public.vehicles;
CREATE POLICY vehicles_update_policy ON public.vehicles
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina', 'rececao'))
  WITH CHECK (
    public.get_user_role() IN ('admin', 'chefe_oficina')
    OR (public.get_user_role() = 'rececao' AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS vehicles_delete_policy ON public.vehicles;
CREATE POLICY vehicles_delete_policy ON public.vehicles
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina'));

-- ----------------------------------------------------------------------------
-- 7. Policies: SUPPLIERS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS suppliers_select_policy ON public.suppliers;
CREATE POLICY suppliers_select_policy ON public.suppliers
  FOR SELECT TO authenticated
  USING (public.is_active_staff());

DROP POLICY IF EXISTS suppliers_insert_policy ON public.suppliers;
CREATE POLICY suppliers_insert_policy ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('admin', 'chefe_oficina'));

DROP POLICY IF EXISTS suppliers_update_policy ON public.suppliers;
CREATE POLICY suppliers_update_policy ON public.suppliers
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina'))
  WITH CHECK (public.get_user_role() IN ('admin', 'chefe_oficina'));

DROP POLICY IF EXISTS suppliers_delete_policy ON public.suppliers;
CREATE POLICY suppliers_delete_policy ON public.suppliers
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina'));

-- ----------------------------------------------------------------------------
-- 8. Policies: INVENTORY ITEMS & STOCK MOVEMENTS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS inventory_items_select_policy ON public.inventory_items;
CREATE POLICY inventory_items_select_policy ON public.inventory_items
  FOR SELECT TO authenticated
  USING (public.is_active_staff());

DROP POLICY IF EXISTS inventory_items_insert_policy ON public.inventory_items;
CREATE POLICY inventory_items_insert_policy ON public.inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('admin', 'chefe_oficina'));

DROP POLICY IF EXISTS inventory_items_update_policy ON public.inventory_items;
CREATE POLICY inventory_items_update_policy ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina', 'rececao'))
  WITH CHECK (
    public.get_user_role() IN ('admin', 'chefe_oficina')
    OR (public.get_user_role() = 'rececao' AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS inventory_items_delete_policy ON public.inventory_items;
CREATE POLICY inventory_items_delete_policy ON public.inventory_items
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina'));

DROP POLICY IF EXISTS stock_movements_select_policy ON public.stock_movements;
CREATE POLICY stock_movements_select_policy ON public.stock_movements
  FOR SELECT TO authenticated
  USING (public.is_active_staff());

DROP POLICY IF EXISTS stock_movements_insert_policy ON public.stock_movements;
CREATE POLICY stock_movements_insert_policy ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('admin', 'chefe_oficina', 'rececao', 'mecanico'));

DROP POLICY IF EXISTS stock_movements_update_policy ON public.stock_movements;
CREATE POLICY stock_movements_update_policy ON public.stock_movements
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina'))
  WITH CHECK (public.get_user_role() IN ('admin', 'chefe_oficina'));

DROP POLICY IF EXISTS stock_movements_delete_policy ON public.stock_movements;
CREATE POLICY stock_movements_delete_policy ON public.stock_movements
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina'));

-- ----------------------------------------------------------------------------
-- 9. Policies: WORK ORDERS & WORK ORDER ITEMS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS work_orders_select_policy ON public.work_orders;
CREATE POLICY work_orders_select_policy ON public.work_orders
  FOR SELECT TO authenticated
  USING (public.is_active_staff());

DROP POLICY IF EXISTS work_orders_insert_policy ON public.work_orders;
CREATE POLICY work_orders_insert_policy ON public.work_orders
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('admin', 'chefe_oficina', 'rececao'));

DROP POLICY IF EXISTS work_orders_update_policy ON public.work_orders;
CREATE POLICY work_orders_update_policy ON public.work_orders
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'chefe_oficina', 'rececao')
    OR (public.get_user_role() = 'mecanico' AND deleted_at IS NULL)
  )
  WITH CHECK (
    public.get_user_role() IN ('admin', 'chefe_oficina')
    OR (public.get_user_role() IN ('rececao', 'mecanico') AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS work_orders_delete_policy ON public.work_orders;
CREATE POLICY work_orders_delete_policy ON public.work_orders
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina'));

DROP POLICY IF EXISTS work_order_items_select_policy ON public.work_order_items;
CREATE POLICY work_order_items_select_policy ON public.work_order_items
  FOR SELECT TO authenticated
  USING (public.is_active_staff());

DROP POLICY IF EXISTS work_order_items_insert_policy ON public.work_order_items;
CREATE POLICY work_order_items_insert_policy ON public.work_order_items
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('admin', 'chefe_oficina', 'rececao', 'mecanico'));

DROP POLICY IF EXISTS work_order_items_update_policy ON public.work_order_items;
CREATE POLICY work_order_items_update_policy ON public.work_order_items
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'chefe_oficina', 'rececao')
    OR (public.get_user_role() = 'mecanico' AND deleted_at IS NULL)
  )
  WITH CHECK (
    public.get_user_role() IN ('admin', 'chefe_oficina')
    OR (public.get_user_role() IN ('rececao', 'mecanico') AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS work_order_items_delete_policy ON public.work_order_items;
CREATE POLICY work_order_items_delete_policy ON public.work_order_items
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina'));

-- ----------------------------------------------------------------------------
-- 10. Policies: PAYMENTS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS payments_select_policy ON public.payments;
CREATE POLICY payments_select_policy ON public.payments
  FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina', 'rececao'));

DROP POLICY IF EXISTS payments_insert_policy ON public.payments;
CREATE POLICY payments_insert_policy ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('admin', 'chefe_oficina', 'rececao'));

DROP POLICY IF EXISTS payments_update_policy ON public.payments;
CREATE POLICY payments_update_policy ON public.payments
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina', 'rececao'))
  WITH CHECK (
    public.get_user_role() IN ('admin', 'chefe_oficina')
    OR (public.get_user_role() = 'rececao' AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS payments_delete_policy ON public.payments;
CREATE POLICY payments_delete_policy ON public.payments
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('admin', 'chefe_oficina'));

-- ----------------------------------------------------------------------------
-- 11. Views Seguras para Ocultar Preço de Custo / Margem a Perfis Operacionais
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.inventory_items_safe
WITH (security_invoker = true) AS
SELECT
  id,
  sku,
  name,
  category,
  supplier_id,
  stock_qty,
  min_stock_alert,
  CASE
    WHEN public.get_user_role() IN ('admin', 'chefe_oficina') THEN cost_price_aoa
    ELSE NULL
  END AS cost_price_aoa,
  sell_price_aoa,
  unit,
  created_at,
  updated_at,
  deleted_at,
  sync_version
FROM public.inventory_items;

CREATE OR REPLACE VIEW public.work_order_items_safe
WITH (security_invoker = true) AS
SELECT
  id,
  work_order_id,
  item_type,
  inventory_item_id,
  sku,
  technician_name,
  description,
  quantity,
  unit,
  CASE
    WHEN public.get_user_role() IN ('admin', 'chefe_oficina') THEN unit_cost_aoa
    ELSE NULL
  END AS unit_cost_aoa,
  unit_price_aoa,
  total_price_aoa,
  created_at,
  updated_at,
  deleted_at,
  sync_version
FROM public.work_order_items;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT SELECT ON public.inventory_items_safe TO authenticated;
GRANT SELECT ON public.work_order_items_safe TO authenticated;
