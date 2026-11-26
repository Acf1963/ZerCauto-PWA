Act as a Senior PostgreSQL & Supabase Database Architect. Generate the complete, production-ready database setup and synchronization layer for the **ZercAuto Gest** offline-first workshop management PWA (Angola market, currency AOA / Kz).

Inspect the existing Dexie (IndexedDB) schema and TypeScript models in this project so that every PostgreSQL table, column name, data type, enum, and relationship matches the local frontend models 1:1.

Deliver the following 4 complete scripts/files:

### 1. `supabase/schema.sql` (Tables, Constraints & Triggers)
- Enable required extensions (`uuid-ossp`, `pgcrypto`).
- Create all core tables using `UUID` primary keys (`default gen_random_uuid()`):
  - `profiles` (linked to `auth.users(id)` on delete cascade, role: `'admin' | 'chefe_oficina' | 'rececao' | 'mecanico'`, full_name, phone, active)
  - `clients` (name, nif, phone, email, address, client_type: `'particular' | 'empresa'`, notes)
  - `vehicles` (client_id FK, license_plate unique, brand, model, year, vin, fuel_type, current_mileage)
  - `suppliers` (name, nif, phone, email, category, payment_terms)
  - `inventory_items` (sku unique, name, category, supplier_id FK, stock_qty, min_stock_alert, cost_price_aoa, sell_price_aoa, unit)
  - `work_orders` (order_number unique e.g. `FO-2026-0001`, client_id FK, vehicle_id FK, assigned_mechanic_id FK, status: `'aberto' | 'diagnostico' | 'orcamento' | 'em_execucao' | 'concluido' | 'entregue' | 'cancelado'`, complaint_description, diagnosis_notes, entry_mileage, parts_total_aoa, labor_total_aoa, discount_aoa, tax_aoa, grand_total_aoa, payment_status: `'pendente' | 'parcial' | 'link_online' | 'liquidado'`)
  - `work_order_items` (work_order_id FK on delete cascade, item_type: `'peca' | 'mao_obra' | 'servico_externo'`, inventory_item_id FK nullable, description, quantity, unit_cost_aoa, unit_price_aoa, total_price_aoa)
  - `payments` (work_order_id FK, amount_aoa, method: `'multicaixa' | 'transferencia' | 'numerario' | 'link_online'`, reference_code, payment_date, recorded_by FK)
  - `workshop_settings` (single-row config: company_name, nif, address, phone, email, logo_url, default_currency `'AOA'`, vat_rate, invoice_footer)
- **Offline-First Sync Metadata (Mandatory on EVERY table):**
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `deleted_at TIMESTAMPTZ NULL` (soft-delete support so offline clients can sync deletions)
  - `sync_version INTEGER NOT NULL DEFAULT 1`
- Create a reusable PostgreSQL trigger function `handle_updated_at()` that automatically updates `updated_at = now()` and increments `sync_version` on every `UPDATE`. Attach it to all tables.
- Create a trigger `on_auth_user_created` that automatically inserts a row into `public.profiles` whenever a new user signs up in `auth.users`.
- Add indexes on foreign keys, `updated_at`, `order_number`, `license_plate`, and `sku` for fast delta sync queries.

### 2. `supabase/rls_policies.sql` (Row Level Security)
- Enable RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) on all tables.
- Create helper SQL function `public.get_user_role()` returning the current authenticated user's role from `profiles`.
- Define clear, non-recursive RLS policies:
  - Authenticated active staff can read operational records (`clients`, `vehicles`, `work_orders`, `work_order_items`, `inventory_items`, `suppliers`).
  - Only `'admin'` and `'chefe_oficina'` can delete/soft-delete records, manage `profiles`, edit `workshop_settings`, or view sensitive cost/margin fields if restricted.
  - `'rececao'`, `'chefe_oficina'`, and `'admin'` can insert/update `clients`, `vehicles`, `work_orders`, and `payments`.

### 3. `supabase/seed.sql` (Realistic Angolan Workshop Seed Data)
- Provide an idempotent seed script (`ON CONFLICT DO NOTHING`) with realistic Angolan sample data in AOA (Kz):
  - Default `workshop_settings` for **ZercAuto** (Luanda, Angola).
  - 4 sample clients (including individuals and corporate fleet clients like *Transportes Atlântico Lda*, *Construtora Norte SA*).
  - 5 vehicles with Angolan license plate format (`LD-00-00-AA`).
  - 8 auto-parts inventory items (filters, brake pads, synthetic oil 5W-30, spark plugs, timing belts) with realistic AOA cost and retail prices.
  - 3 sample work orders (`FO-2026-0140` to `FO-2026-0142`) with line items and payments matching the UI states (`Pendente`, `Link Online`, `Liquidado`).

### 4. `src/lib/syncEngine.ts` (Two-Way Dexie <-> Supabase Sync Engine)
- Provide clean TypeScript code implementing bidirectional delta synchronization between IndexedDB (Dexie) and Supabase:
  - **Push:** Query local Dexie records with `_syncStatus === 'pending'` and upsert them to Supabase (handling soft deletes via `deleted_at`).
  - **Pull:** Fetch records from Supabase where `updated_at > lastSyncedAt` and merge into Dexie using Last-Write-Wins (`updated_at`) conflict resolution.
  - Include connection status detection (`navigator.onLine` + Supabase health check) and a manual `syncNow()` trigger.

Output each file inside its own clearly labeled Markdown code block so I can paste the SQL directly into the Supabase SQL Editor and save `syncEngine.ts` in the project.