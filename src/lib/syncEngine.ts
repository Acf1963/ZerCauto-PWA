import {db} from '../db/dexie';
import type {
  Client,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus,
  StockItem,
  StockMovement,
  Supplier,
  UserRole,
  Vehicle,
  WorkOrder,
  WorkOrderLabor,
  WorkOrderPart,
  WorkOrderStatus,
  WorkshopSettings,
  WorkshopUser,
} from '../types/database';
import {isSupabaseConfigured, supabase} from './supabase';

export interface SyncResult {
  syncedCount: number;
  pushedCount: number;
  pulledCount: number;
  remainingCount: number;
  mode: 'cloud' | 'local';
  healthOk: boolean;
  timestamp: string;
  error?: string;
}

const LAST_SYNC_META_KEY = 'lastSyncedAt';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

// ----------------------------------------------------------------------------
// Enum Mappers (PT-PT UI Labels <-> PostgreSQL Canonical Enums)
// ----------------------------------------------------------------------------
const WO_STATUS_TO_SQL: Record<WorkOrderStatus, string> = {
  Aberta: 'aberto',
  'Em Diagnóstico': 'diagnostico',
  'Aguarda Peças': 'orcamento',
  'Em Execução': 'em_execucao',
  Concluída: 'concluido',
  'Pronta para Faturar': 'concluido',
  Faturada: 'entregue',
};

const SQL_TO_WO_STATUS: Record<string, WorkOrderStatus> = {
  aberto: 'Aberta',
  diagnostico: 'Em Diagnóstico',
  orcamento: 'Aguarda Peças',
  em_execucao: 'Em Execução',
  concluido: 'Pronta para Faturar',
  entregue: 'Faturada',
  cancelado: 'Concluída',
};

const PAY_STATUS_TO_SQL: Record<PaymentStatus, string> = {
  Pendente: 'pendente',
  Parcial: 'parcial',
  'Link Online': 'link_online',
  Liquidado: 'liquidado',
};

const SQL_TO_PAY_STATUS: Record<string, PaymentStatus> = {
  pendente: 'Pendente',
  parcial: 'Parcial',
  link_online: 'Link Online',
  liquidado: 'Liquidado',
};

const PAY_METHOD_TO_SQL: Record<PaymentMethod, string> = {
  'TPA / Multicaixa': 'multicaixa',
  'Transferência Bancária': 'transferencia',
  Numerário: 'numerario',
  'Pagamento Online (Link / Ref.)': 'link_online',
};

const SQL_TO_PAY_METHOD: Record<string, PaymentMethod> = {
  multicaixa: 'TPA / Multicaixa',
  transferencia: 'Transferência Bancária',
  numerario: 'Numerário',
  link_online: 'Pagamento Online (Link / Ref.)',
};

const SQL_TO_USER_ROLE: Record<string, UserRole> = {
  admin: 'Administrador',
  chefe_oficina: 'Chefe de Oficina',
  rececao: 'Receção & Faturação',
  mecanico: 'Mecânico Sénior',
};

function toDisplayDate(isoOrDisplay?: string | null): string {
  if (!isoOrDisplay) return new Date().toLocaleDateString('pt-PT');
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(isoOrDisplay)) return isoOrDisplay;
  const parsed = new Date(isoOrDisplay);
  if (Number.isNaN(parsed.getTime())) return isoOrDisplay;
  return parsed.toLocaleDateString('pt-PT');
}

function toIsoTimestamp(displayOrIso?: string | null): string {
  if (!displayOrIso) return new Date().toISOString();
  const dm = displayOrIso.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dm) {
    return new Date(`${dm[3]}-${dm[2]}-${dm[1]}T12:00:00.000Z`).toISOString();
  }
  const parsed = new Date(displayOrIso);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

// ----------------------------------------------------------------------------
// Connection Health & Sync Cursor Persistence
// ----------------------------------------------------------------------------
export async function checkSupabaseHealth(timeoutMs = 4500): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  if (!isSupabaseConfigured || !supabase) {
    return false;
  }

  try {
    const queryPromise = supabase.from('workshop_settings').select('id').limit(1);
    const timeoutPromise = new Promise<{error: Error}>((resolve) =>
      setTimeout(() => resolve({error: new Error('Supabase health check timeout')}), timeoutMs)
    );
    const result = await Promise.race([queryPromise, timeoutPromise]);
    if ('error' in result && result.error) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function getLastSyncedAt(): Promise<string> {
  const row = await db.syncMeta.get(LAST_SYNC_META_KEY);
  return row?.value ?? '1970-01-01T00:00:00.000Z';
}

export async function setLastSyncedAt(isoTimestamp: string): Promise<void> {
  await db.syncMeta.put({key: LAST_SYNC_META_KEY, value: isoTimestamp});
}

// ----------------------------------------------------------------------------
// Push Phase: Local Pending Changes (Dexie -> Supabase)
// ----------------------------------------------------------------------------
async function pushTableRows<T extends {id: string; updatedAt: string; deletedAt?: string | null; syncVersion?: number; _syncStatus?: string}>(
  localRows: T[],
  remoteTable: string,
  mapToSql: (row: T) => Record<string, unknown>,
  markLocalSynced: (id: string) => Promise<void>,
  markLocalError: (id: string, msg: string) => Promise<void>
): Promise<number> {
  if (!supabase) return 0;
  let pushed = 0;

  for (const row of localRows) {
    if (!isUuid(row.id)) continue;
    try {
      const payload = mapToSql(row);
      const {error} = await supabase.from(remoteTable).upsert(payload, {onConflict: 'id'});
      if (error) throw error;

      await markLocalSynced(row.id);
      await db.syncQueue.where('recordId').equals(row.id).delete();
      pushed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar registo para Supabase';
      await markLocalError(row.id, msg);
    }
  }
  return pushed;
}

async function pushPendingChanges(): Promise<{pushedCount: number; errors: string[]}> {
  if (!supabase) return {pushedCount: 0, errors: []};
  let pushedCount = 0;
  const errors: string[] = [];

  // 1. Workshop Settings
  const pendingSettings = await db.workshopSettings
    .filter((r) => r._syncStatus === 'pending')
    .toArray();
  pushedCount += await pushTableRows(
    pendingSettings,
    'workshop_settings',
    (s) => ({
      id: s.id,
      company_name: s.workshopName,
      nif: s.nif,
      address: s.address,
      phone: s.phone,
      email: s.email ?? null,
      logo_url: s.logoUrl ?? null,
      fo_prefix: s.foPrefix,
      default_currency: s.currency,
      vat_rate: s.ivaRate,
      hourly_rate_aoa: s.hourlyRate,
      invoice_footer: s.invoiceFooter ?? null,
      auto_sync: s.autoSync,
      updated_at: s.updatedAt,
      deleted_at: s.deletedAt ?? null,
    }),
    async (id) => {
      await db.workshopSettings.update(id, {_syncStatus: 'synced'});
    },
    async (id, msg) => {
      errors.push(`workshop_settings(${id}): ${msg}`);
      await db.workshopSettings.update(id, {_syncStatus: 'error'});
    }
  );

  // 2. Suppliers
  const pendingSuppliers = await db.suppliers
    .filter((r) => r._syncStatus === 'pending')
    .toArray();
  pushedCount += await pushTableRows(
    pendingSuppliers,
    'suppliers',
    (s) => ({
      id: s.id,
      name: s.name,
      nif: s.nif ?? null,
      phone: s.phone,
      email: s.email,
      category: s.specialty,
      payment_terms: s.paymentTerms ?? null,
      delivery_eta: s.deliveryEta,
      updated_at: s.updatedAt,
      deleted_at: s.deletedAt ?? null,
    }),
    async (id) => {
      await db.suppliers.update(id, {_syncStatus: 'synced'});
    },
    async (id, msg) => {
      errors.push(`suppliers(${id}): ${msg}`);
      await db.suppliers.update(id, {_syncStatus: 'error'});
    }
  );

  // 3. Clients
  const pendingClients = await db.clients
    .filter((r) => r._syncStatus === 'pending')
    .toArray();
  pushedCount += await pushTableRows(
    pendingClients,
    'clients',
    (c) => ({
      id: c.id,
      name: c.name,
      nif: c.nif,
      phone: c.phone,
      email: c.email,
      address: c.address,
      client_type: c.clientType ?? (c.nif?.startsWith('500') ? 'empresa' : 'particular'),
      notes: c.notes,
      created_at: toIsoTimestamp(c.createdAt),
      updated_at: c.updatedAt,
      deleted_at: c.deletedAt ?? null,
    }),
    async (id) => {
      await db.clients.update(id, {_syncStatus: 'synced'});
    },
    async (id, msg) => {
      errors.push(`clients(${id}): ${msg}`);
      await db.clients.update(id, {_syncStatus: 'error'});
    }
  );

  // 4. Vehicles
  const pendingVehicles = await db.vehicles
    .filter((r) => r._syncStatus === 'pending')
    .toArray();
  pushedCount += await pushTableRows(
    pendingVehicles,
    'vehicles',
    (v) => ({
      id: v.id,
      client_id: v.clientId,
      license_plate: v.plate,
      brand: v.brand,
      model: v.model,
      year: v.year,
      vin: v.vin,
      fuel_type: v.fuelType ?? 'Diesel',
      current_mileage: v.mileage,
      updated_at: v.updatedAt,
      deleted_at: v.deletedAt ?? null,
    }),
    async (id) => {
      await db.vehicles.update(id, {_syncStatus: 'synced'});
    },
    async (id, msg) => {
      errors.push(`vehicles(${id}): ${msg}`);
      await db.vehicles.update(id, {_syncStatus: 'error'});
    }
  );

  // 5. Inventory Items
  const pendingStock = await db.stockItems
    .filter((r) => r._syncStatus === 'pending')
    .toArray();
  pushedCount += await pushTableRows(
    pendingStock,
    'inventory_items',
    (item) => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      supplier_id: isUuid(item.supplierId) ? item.supplierId : null,
      stock_qty: item.quantity,
      min_stock_alert: item.minQuantity,
      cost_price_aoa: item.costPrice,
      sell_price_aoa: item.salePrice,
      unit: item.unit,
      updated_at: item.updatedAt,
      deleted_at: item.deletedAt ?? null,
    }),
    async (id) => {
      await db.stockItems.update(id, {_syncStatus: 'synced'});
    },
    async (id, msg) => {
      errors.push(`inventory_items(${id}): ${msg}`);
      await db.stockItems.update(id, {_syncStatus: 'error'});
    }
  );

  // 6. Stock Movements
  const pendingMovements = await db.stockMovements
    .filter((r) => r._syncStatus === 'pending')
    .toArray();
  pushedCount += await pushTableRows(
    pendingMovements,
    'stock_movements',
    (m) => ({
      id: m.id,
      inventory_item_id: m.stockItemId,
      sku: m.sku,
      item_name: m.itemName,
      movement_type: m.type,
      quantity: m.quantity,
      unit: m.unit,
      reference: m.reference,
      created_at: toIsoTimestamp(m.createdAt),
      updated_at: m.updatedAt,
      deleted_at: m.deletedAt ?? null,
    }),
    async (id) => {
      await db.stockMovements.update(id, {_syncStatus: 'synced'});
    },
    async (id, msg) => {
      errors.push(`stock_movements(${id}): ${msg}`);
      await db.stockMovements.update(id, {_syncStatus: 'error'});
    }
  );

  // 7. Work Orders + Work Order Items (parts & labor)
  const pendingWOs = await db.workOrders
    .filter((r) => r._syncStatus === 'pending')
    .toArray();

  for (const wo of pendingWOs) {
    if (!isUuid(wo.id)) continue;
    try {
      const partsTotal = wo.parts.reduce((acc, p) => acc + p.totalPrice, 0);
      const laborTotal = wo.labor.reduce((acc, l) => acc + l.totalPrice, 0);

      const {error: woErr} = await supabase.from('work_orders').upsert(
        {
          id: wo.id,
          order_number: wo.code,
          client_id: wo.clientId,
          vehicle_id: wo.vehicleId,
          assigned_mechanic_id: isUuid(wo.assignedMechanicId) ? wo.assignedMechanicId : null,
          status: WO_STATUS_TO_SQL[wo.status] ?? 'aberto',
          complaint_description: wo.complaintDescription ?? null,
          diagnosis_notes: wo.diagnosis,
          entry_mileage: wo.mileage,
          parts_total_aoa: partsTotal,
          labor_total_aoa: laborTotal,
          discount_aoa: wo.discount ?? 0,
          vat_rate: wo.ivaRate,
          tax_aoa: wo.ivaAmount,
          grand_total_aoa: wo.total,
          payment_status: PAY_STATUS_TO_SQL[wo.paymentStatus] ?? 'pendente',
          payment_method: wo.paymentMethod ?? null,
          payment_link: wo.paymentLink ?? null,
          period_key: wo.periodKey,
          opened_at: wo.openedAt,
          updated_at: wo.updatedAt,
          deleted_at: wo.deletedAt ?? null,
        },
        {onConflict: 'id'}
      );
      if (woErr) throw woErr;

      // Sync nested line items to public.work_order_items
      const itemRows = [
        ...wo.parts
          .filter((p) => isUuid(p.id))
          .map((p) => ({
            id: p.id,
            work_order_id: wo.id,
            item_type: 'peca',
            inventory_item_id: isUuid(p.stockItemId) ? p.stockItemId : null,
            sku: p.sku,
            technician_name: null,
            description: p.name,
            quantity: p.quantity,
            unit: p.unit,
            unit_cost_aoa: p.unitCost,
            unit_price_aoa: p.unitPrice,
            total_price_aoa: p.totalPrice,
            updated_at: wo.updatedAt,
            deleted_at: wo.deletedAt ?? null,
          })),
        ...wo.labor
          .filter((l) => isUuid(l.id))
          .map((l) => ({
            id: l.id,
            work_order_id: wo.id,
            item_type: 'mao_obra',
            inventory_item_id: null,
            sku: null,
            technician_name: l.technicianName,
            description: l.description,
            quantity: l.hours,
            unit: 'h',
            unit_cost_aoa: 0,
            unit_price_aoa: l.hourlyRate,
            total_price_aoa: l.totalPrice,
            updated_at: wo.updatedAt,
            deleted_at: wo.deletedAt ?? null,
          })),
      ];

      if (itemRows.length > 0) {
        const {error: itemsErr} = await supabase
          .from('work_order_items')
          .upsert(itemRows, {onConflict: 'id'});
        if (itemsErr) throw itemsErr;
      }

      await db.workOrders.update(wo.id, {_syncStatus: 'synced'});
      await db.syncQueue.where('recordId').equals(wo.id).delete();
      pushedCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao sincronizar Folha de Obra';
      errors.push(`work_orders(${wo.id}): ${msg}`);
      await db.workOrders.update(wo.id, {_syncStatus: 'error'});
    }
  }

  // 8. Payments
  const pendingPayments = await db.paymentRecords
    .filter((r) => r._syncStatus === 'pending')
    .toArray();
  pushedCount += await pushTableRows(
    pendingPayments,
    'payments',
    (p) => ({
      id: p.id,
      work_order_id: p.workOrderId,
      amount_aoa: p.amount,
      method: PAY_METHOD_TO_SQL[p.method] ?? 'multicaixa',
      status: PAY_STATUS_TO_SQL[p.status] ?? 'liquidado',
      reference_code: p.reference,
      payment_date: toIsoTimestamp(p.paidAt),
      period_key: p.periodKey,
      recorded_by: isUuid(p.recordedBy) ? p.recordedBy : null,
      updated_at: p.updatedAt,
      deleted_at: p.deletedAt ?? null,
    }),
    async (id) => {
      await db.paymentRecords.update(id, {_syncStatus: 'synced'});
    },
    async (id, msg) => {
      errors.push(`payments(${id}): ${msg}`);
      await db.paymentRecords.update(id, {_syncStatus: 'error'});
    }
  );

  return {pushedCount, errors};
}

// ----------------------------------------------------------------------------
// Pull Phase: Remote Delta (Supabase -> Dexie) with Last-Write-Wins (updated_at)
// ----------------------------------------------------------------------------
function isRemoteNewerOrEqual(remoteUpdatedAt: string, localRecord?: {updatedAt?: string; _syncStatus?: string}): boolean {
  if (!localRecord || !localRecord.updatedAt) return true;
  const remoteTime = new Date(remoteUpdatedAt).getTime();
  const localTime = new Date(localRecord.updatedAt).getTime();
  if (localRecord._syncStatus === 'pending' && localTime > remoteTime) {
    return false;
  }
  return remoteTime >= localTime;
}

async function pullDeltaChanges(lastSyncedAt: string): Promise<{
  pulledCount: number;
  maxUpdatedAt: string;
  errors: string[];
}> {
  if (!supabase) return {pulledCount: 0, maxUpdatedAt: lastSyncedAt, errors: []};

  let pulledCount = 0;
  let maxUpdatedAt = lastSyncedAt;
  const errors: string[] = [];

  const trackCursor = (ts?: string | null) => {
    if (!ts) return;
    if (new Date(ts).getTime() > new Date(maxUpdatedAt).getTime()) {
      maxUpdatedAt = ts;
    }
  };

  // 1. Workshop Settings
  try {
    const {data, error} = await supabase
      .from('workshop_settings')
      .select('*')
      .gt('updated_at', lastSyncedAt)
      .order('updated_at', {ascending: true});
    if (error) throw error;

    for (const row of data ?? []) {
      trackCursor(row.updated_at);
      const local = await db.workshopSettings.get(row.id);
      if (isRemoteNewerOrEqual(row.updated_at, local)) {
        const mapped: WorkshopSettings = {
          id: row.id,
          workshopName: row.company_name,
          nif: row.nif ?? '',
          phone: row.phone ?? '',
          email: row.email ?? undefined,
          address: row.address ?? '',
          logoUrl: row.logo_url ?? undefined,
          foPrefix: row.fo_prefix ?? 'FO-2026',
          currency: row.default_currency === 'EUR' ? 'EUR' : 'AOA',
          ivaRate: Number(row.vat_rate ?? 14),
          hourlyRate: Number(row.hourly_rate_aoa ?? 12000),
          invoiceFooter: row.invoice_footer ?? undefined,
          autoSync: Boolean(row.auto_sync ?? true),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          deletedAt: row.deleted_at ?? null,
          syncVersion: row.sync_version ?? 1,
          _syncStatus: 'synced',
        };
        await db.workshopSettings.put(mapped);
        pulledCount++;
      }
    }
  } catch (err) {
    errors.push(`pull workshop_settings: ${err instanceof Error ? err.message : 'erro'}`);
  }

  // 2. Suppliers
  try {
    const {data, error} = await supabase
      .from('suppliers')
      .select('*')
      .gt('updated_at', lastSyncedAt)
      .order('updated_at', {ascending: true});
    if (error) throw error;

    for (const row of data ?? []) {
      trackCursor(row.updated_at);
      const local = await db.suppliers.get(row.id);
      if (isRemoteNewerOrEqual(row.updated_at, local)) {
        const mapped: Supplier = {
          id: row.id,
          name: row.name,
          nif: row.nif ?? undefined,
          phone: row.phone ?? '',
          email: row.email ?? '',
          specialty: row.category ?? 'Geral',
          paymentTerms: row.payment_terms ?? undefined,
          deliveryEta: row.delivery_eta ?? '24h',
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          deletedAt: row.deleted_at ?? null,
          syncVersion: row.sync_version ?? 1,
          _syncStatus: 'synced',
        };
        await db.suppliers.put(mapped);
        pulledCount++;
      }
    }
  } catch (err) {
    errors.push(`pull suppliers: ${err instanceof Error ? err.message : 'erro'}`);
  }

  // 3. Clients
  try {
    const {data, error} = await supabase
      .from('clients')
      .select('*')
      .gt('updated_at', lastSyncedAt)
      .order('updated_at', {ascending: true});
    if (error) throw error;

    for (const row of data ?? []) {
      trackCursor(row.updated_at);
      const local = await db.clients.get(row.id);
      if (isRemoteNewerOrEqual(row.updated_at, local)) {
        const mapped: Client = {
          id: row.id,
          name: row.name,
          nif: row.nif ?? '',
          phone: row.phone ?? '',
          email: row.email ?? '',
          address: row.address ?? '',
          clientType: row.client_type === 'empresa' ? 'empresa' : 'particular',
          notes: row.notes ?? '',
          createdAt: toDisplayDate(row.created_at),
          updatedAt: row.updated_at,
          deletedAt: row.deleted_at ?? null,
          syncVersion: row.sync_version ?? 1,
          _syncStatus: 'synced',
        };
        await db.clients.put(mapped);
        pulledCount++;
      }
    }
  } catch (err) {
    errors.push(`pull clients: ${err instanceof Error ? err.message : 'erro'}`);
  }

  // 4. Vehicles
  try {
    const {data, error} = await supabase
      .from('vehicles')
      .select('*')
      .gt('updated_at', lastSyncedAt)
      .order('updated_at', {ascending: true});
    if (error) throw error;

    for (const row of data ?? []) {
      trackCursor(row.updated_at);
      const local = await db.vehicles.get(row.id);
      if (isRemoteNewerOrEqual(row.updated_at, local)) {
        const mapped: Vehicle = {
          id: row.id,
          clientId: row.client_id,
          plate: row.license_plate,
          brand: row.brand,
          model: row.model,
          year: Number(row.year ?? 2020),
          vin: row.vin ?? '',
          fuelType: row.fuel_type ?? undefined,
          mileage: Number(row.current_mileage ?? 0),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          deletedAt: row.deleted_at ?? null,
          syncVersion: row.sync_version ?? 1,
          _syncStatus: 'synced',
        };
        await db.vehicles.put(mapped);
        pulledCount++;
      }
    }
  } catch (err) {
    errors.push(`pull vehicles: ${err instanceof Error ? err.message : 'erro'}`);
  }

  // 5. Inventory Items
  try {
    const {data, error} = await supabase
      .from('inventory_items')
      .select('*')
      .gt('updated_at', lastSyncedAt)
      .order('updated_at', {ascending: true});
    if (error) throw error;

    const suppliersList = await db.suppliers.toArray();
    const supplierNames = new Map(suppliersList.map((s) => [s.id, s.name]));

    for (const row of data ?? []) {
      trackCursor(row.updated_at);
      const local = await db.stockItems.get(row.id);
      if (isRemoteNewerOrEqual(row.updated_at, local)) {
        const mapped: StockItem = {
          id: row.id,
          sku: row.sku,
          name: row.name,
          category: row.category ?? 'Geral',
          supplierId: row.supplier_id ?? '',
          supplierName: supplierNames.get(row.supplier_id) ?? local?.supplierName ?? 'Fornecedor Local',
          unit: row.unit ?? 'un',
          costPrice: Number(row.cost_price_aoa ?? local?.costPrice ?? 0),
          salePrice: Number(row.sell_price_aoa ?? 0),
          quantity: Number(row.stock_qty ?? 0),
          minQuantity: Number(row.min_stock_alert ?? 0),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          deletedAt: row.deleted_at ?? null,
          syncVersion: row.sync_version ?? 1,
          _syncStatus: 'synced',
        };
        await db.stockItems.put(mapped);
        pulledCount++;
      }
    }
  } catch (err) {
    errors.push(`pull inventory_items: ${err instanceof Error ? err.message : 'erro'}`);
  }

  // 6. Stock Movements
  try {
    const {data, error} = await supabase
      .from('stock_movements')
      .select('*')
      .gt('updated_at', lastSyncedAt)
      .order('updated_at', {ascending: true});
    if (error) throw error;

    for (const row of data ?? []) {
      trackCursor(row.updated_at);
      const local = await db.stockMovements.get(row.id);
      if (isRemoteNewerOrEqual(row.updated_at, local)) {
        const mapped: StockMovement = {
          id: row.id,
          stockItemId: row.inventory_item_id,
          sku: row.sku,
          itemName: row.item_name,
          type: row.movement_type === 'entrada' ? 'entrada' : 'saida',
          quantity: Number(row.quantity ?? 0),
          unit: row.unit ?? 'un',
          reference: row.reference ?? '',
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          deletedAt: row.deleted_at ?? null,
          syncVersion: row.sync_version ?? 1,
          _syncStatus: 'synced',
        };
        await db.stockMovements.put(mapped);
        pulledCount++;
      }
    }
  } catch (err) {
    errors.push(`pull stock_movements: ${err instanceof Error ? err.message : 'erro'}`);
  }

  // 7. Work Orders & Work Order Items
  try {
    const {data: woData, error: woErr} = await supabase
      .from('work_orders')
      .select('*')
      .gt('updated_at', lastSyncedAt)
      .order('updated_at', {ascending: true});
    if (woErr) throw woErr;

    const {data: itemsDelta, error: itemsErr} = await supabase
      .from('work_order_items')
      .select('*')
      .gt('updated_at', lastSyncedAt);
    if (itemsErr) throw itemsErr;

    const affectedWoIds = new Set<string>([
      ...(woData ?? []).map((w) => w.id as string),
      ...(itemsDelta ?? []).map((i) => i.work_order_id as string),
    ]);

    if (affectedWoIds.size > 0) {
      const idArray = Array.from(affectedWoIds);
      const {data: fullWos} = await supabase.from('work_orders').select('*').in('id', idArray);
      const {data: allItems} = await supabase
        .from('work_order_items')
        .select('*')
        .in('work_order_id', idArray)
        .is('deleted_at', null);

      const clientsList = await db.clients.toArray();
      const vehiclesList = await db.vehicles.toArray();
      const clientNames = new Map(clientsList.map((c) => [c.id, c.name]));
      const vehicleById = new Map(vehiclesList.map((v) => [v.id, v]));

      const itemsByWo = new Map<string, typeof allItems>();
      for (const item of allItems ?? []) {
        const list = itemsByWo.get(item.work_order_id) ?? [];
        list.push(item);
        itemsByWo.set(item.work_order_id, list);
      }

      for (const row of fullWos ?? []) {
        trackCursor(row.updated_at);
        const local = await db.workOrders.get(row.id);
        if (isRemoteNewerOrEqual(row.updated_at, local)) {
          const woItems = itemsByWo.get(row.id) ?? [];
          const parts: WorkOrderPart[] = woItems
            .filter((i) => i.item_type === 'peca')
            .map((i) => ({
              id: i.id,
              stockItemId: i.inventory_item_id ?? undefined,
              sku: i.sku ?? 'N/D',
              name: i.description,
              quantity: Number(i.quantity ?? 1),
              unit: i.unit ?? 'un',
              unitCost: Number(i.unit_cost_aoa ?? 0),
              unitPrice: Number(i.unit_price_aoa ?? 0),
              totalPrice: Number(i.total_price_aoa ?? 0),
            }));

          const labor: WorkOrderLabor[] = woItems
            .filter((i) => i.item_type === 'mao_obra' || i.item_type === 'servico_externo')
            .map((i) => ({
              id: i.id,
              technicianName: i.technician_name ?? 'Técnico ZercAuto',
              description: i.description,
              hours: Number(i.quantity ?? 1),
              hourlyRate: Number(i.unit_price_aoa ?? 0),
              totalPrice: Number(i.total_price_aoa ?? 0),
            }));

          const veh = vehicleById.get(row.vehicle_id);
          const cmvTotal = parts.reduce((acc, p) => acc + p.unitCost * p.quantity, 0);
          const subtotal =
            Number(row.parts_total_aoa ?? 0) + Number(row.labor_total_aoa ?? 0) - Number(row.discount_aoa ?? 0);

          const mapped: WorkOrder = {
            id: row.id,
            code: row.order_number,
            clientId: row.client_id,
            clientName: clientNames.get(row.client_id) ?? local?.clientName ?? 'Cliente',
            vehicleId: row.vehicle_id,
            vehiclePlate: veh?.plate ?? local?.vehiclePlate ?? '',
            vehicleLabel: veh ? `${veh.brand} ${veh.model}` : local?.vehicleLabel ?? '',
            mileage: Number(row.entry_mileage ?? 0),
            assignedMechanicId: row.assigned_mechanic_id ?? null,
            status: SQL_TO_WO_STATUS[row.status] ?? 'Aberta',
            diagnosis: row.diagnosis_notes ?? '',
            complaintDescription: row.complaint_description ?? undefined,
            parts,
            labor,
            ivaRate: Number(row.vat_rate ?? 14),
            discount: Number(row.discount_aoa ?? 0),
            subtotal,
            ivaAmount: Number(row.tax_aoa ?? 0),
            total: Number(row.grand_total_aoa ?? 0),
            cmvTotal,
            paymentStatus: SQL_TO_PAY_STATUS[row.payment_status] ?? 'Pendente',
            paymentMethod: row.payment_method as PaymentMethod | undefined,
            paymentLink: row.payment_link ?? undefined,
            periodKey: row.period_key ?? row.updated_at.slice(0, 7),
            openedAt: row.opened_at ?? toDisplayDate(row.created_at),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            deletedAt: row.deleted_at ?? null,
            syncVersion: row.sync_version ?? 1,
            _syncStatus: 'synced',
          };

          await db.workOrders.put(mapped);
          pulledCount++;
        }
      }
    }
  } catch (err) {
    errors.push(`pull work_orders: ${err instanceof Error ? err.message : 'erro'}`);
  }

  // 8. Payments
  try {
    const {data, error} = await supabase
      .from('payments')
      .select('*')
      .gt('updated_at', lastSyncedAt)
      .order('updated_at', {ascending: true});
    if (error) throw error;

    const woList = await db.workOrders.toArray();
    const woById = new Map(woList.map((w) => [w.id, w]));

    for (const row of data ?? []) {
      trackCursor(row.updated_at);
      const local = await db.paymentRecords.get(row.id);
      if (isRemoteNewerOrEqual(row.updated_at, local)) {
        const wo = woById.get(row.work_order_id);
        const mapped: PaymentRecord = {
          id: row.id,
          workOrderId: row.work_order_id,
          workOrderCode: wo?.code ?? local?.workOrderCode ?? '',
          clientName: wo?.clientName ?? local?.clientName ?? '',
          amount: Number(row.amount_aoa ?? 0),
          method: SQL_TO_PAY_METHOD[row.method] ?? 'TPA / Multicaixa',
          status: SQL_TO_PAY_STATUS[row.status] ?? 'Liquidado',
          reference: row.reference_code ?? '',
          periodKey: row.period_key ?? row.payment_date?.slice(0, 7) ?? '2026-11',
          paidAt: toDisplayDate(row.payment_date),
          recordedBy: row.recorded_by ?? null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          deletedAt: row.deleted_at ?? null,
          syncVersion: row.sync_version ?? 1,
          _syncStatus: 'synced',
        };
        await db.paymentRecords.put(mapped);
        pulledCount++;
      }
    }
  } catch (err) {
    errors.push(`pull payments: ${err instanceof Error ? err.message : 'erro'}`);
  }

  // 9. Profiles (Read-only pull into workshopUsers so offline session picker stays fresh)
  try {
    const {data, error} = await supabase
      .from('profiles')
      .select('*')
      .gt('updated_at', lastSyncedAt)
      .order('updated_at', {ascending: true});
    if (!error && data) {
      for (const row of data) {
        trackCursor(row.updated_at);
        const local = await db.workshopUsers.get(row.id);
        if (isRemoteNewerOrEqual(row.updated_at, local)) {
          const mapped: WorkshopUser = {
            id: row.id,
            name: row.full_name,
            email: row.email ?? '',
            phone: row.phone ?? undefined,
            role: SQL_TO_USER_ROLE[row.role] ?? 'Receção & Faturação',
            sessionState: row.active ? local?.sessionState ?? 'Online' : 'Suspenso',
            permissions: Array.isArray(row.permissions) ? row.permissions : ['work_orders'],
            active: Boolean(row.active),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            deletedAt: row.deleted_at ?? null,
            syncVersion: row.sync_version ?? 1,
            _syncStatus: 'synced',
          };
          await db.workshopUsers.put(mapped);
          pulledCount++;
        }
      }
    }
  } catch {
    // Profiles pull is optional when user is not yet authenticated via Supabase Auth
  }

  return {pulledCount, maxUpdatedAt, errors};
}

// ----------------------------------------------------------------------------
// Reconcile standalone offline checkpoint (when Supabase env vars aren't set)
// ----------------------------------------------------------------------------
async function markAllPendingAsLocalSynced(): Promise<number> {
  let count = 0;
  const tables = [
    db.workOrders,
    db.clients,
    db.vehicles,
    db.stockItems,
    db.stockMovements,
    db.suppliers,
    db.paymentRecords,
    db.workshopUsers,
    db.workshopSettings,
  ] as const;

  for (const table of tables) {
    const pending = await table.filter((r) => r._syncStatus === 'pending').toArray();
    for (const row of pending) {
      await (table as unknown as {update: (id: string, changes: Record<string, unknown>) => Promise<number>}).update(
        row.id,
        {_syncStatus: 'synced'}
      );
      count++;
    }
  }

  const queueItems = await db.syncQueue.orderBy('id').toArray();
  if (queueItems.length > 0) {
    const ids = queueItems.map((q) => q.id).filter((id): id is number => id !== undefined);
    await db.syncQueue.bulkDelete(ids);
  }
  return Math.max(count, queueItems.length);
}

// ----------------------------------------------------------------------------
// Manual & Automatic Sync Trigger (`syncNow` + `runSyncCycle` alias)
// ----------------------------------------------------------------------------
let activeSyncPromise: Promise<SyncResult> | null = null;

export async function syncNow(): Promise<SyncResult> {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async (): Promise<SyncResult> => {
    const timestamp = new Date().toISOString();
    const queueCount = await db.syncQueue.count();

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {
        syncedCount: 0,
        pushedCount: 0,
        pulledCount: 0,
        remainingCount: queueCount,
        mode: isSupabaseConfigured ? 'cloud' : 'local',
        healthOk: false,
        timestamp,
        error: 'Sem ligação à internet. Alterações mantidas no IndexedDB local.',
      };
    }

    if (!isSupabaseConfigured || !supabase) {
      const reconciled = await markAllPendingAsLocalSynced();
      await setLastSyncedAt(timestamp);
      return {
        syncedCount: reconciled,
        pushedCount: reconciled,
        pulledCount: 0,
        remainingCount: 0,
        mode: 'local',
        healthOk: false,
        timestamp,
      };
    }

    const {data: sessionData} = await supabase.auth.getSession();
    if (!sessionData.session) {
      return {
        syncedCount: 0,
        pushedCount: 0,
        pulledCount: 0,
        remainingCount: queueCount,
        mode: 'cloud',
        healthOk: false,
        timestamp,
        error: 'Ligue a sua sessão Supabase Auth em Definições para sincronizar com a cloud.',
      };
    }

    const healthOk = await checkSupabaseHealth();
    if (!healthOk) {
      return {
        syncedCount: 0,
        pushedCount: 0,
        pulledCount: 0,
        remainingCount: queueCount,
        mode: 'cloud',
        healthOk: false,
        timestamp,
        error:
          'Tabelas Supabase ainda não instaladas, sem permissão RLS no perfil ou servidor inacessível.',
      };
    }

    // 1. Push local changes first (including soft deletes)
    const pushRes = await pushPendingChanges();

    // 2. Pull remote delta changes since lastSyncedAt (LWW conflict resolution)
    const lastSyncedAt = await getLastSyncedAt();
    const pullRes = await pullDeltaChanges(lastSyncedAt);

    if (pullRes.errors.length === 0 && pushRes.errors.length === 0) {
      await setLastSyncedAt(
        new Date(pullRes.maxUpdatedAt).getTime() > new Date(lastSyncedAt).getTime()
          ? pullRes.maxUpdatedAt
          : timestamp
      );
    }

    const remainingCount = await db.syncQueue.count();
    const combinedErrors = [...pushRes.errors, ...pullRes.errors];

    return {
      syncedCount: pushRes.pushedCount + pullRes.pulledCount,
      pushedCount: pushRes.pushedCount,
      pulledCount: pullRes.pulledCount,
      remainingCount,
      mode: 'cloud',
      healthOk: true,
      timestamp,
      error: combinedErrors.length > 0 ? combinedErrors[0] : undefined,
    };
  })();

  try {
    return await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}

export const runSyncCycle = syncNow;
