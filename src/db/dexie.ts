import Dexie, {type Table} from 'dexie';
import type {
  Client,
  PaymentRecord,
  StockItem,
  StockMovement,
  Supplier,
  SyncEntityTable,
  SyncQueueItem,
  SyncStateMeta,
  Vehicle,
  WorkOrder,
  WorkshopSettings,
  WorkshopUser,
} from '../types/database';

export function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class ZercAutoDB extends Dexie {
  workOrders!: Table<WorkOrder, string>;
  clients!: Table<Client, string>;
  vehicles!: Table<Vehicle, string>;
  stockItems!: Table<StockItem, string>;
  stockMovements!: Table<StockMovement, string>;
  suppliers!: Table<Supplier, string>;
  paymentRecords!: Table<PaymentRecord, string>;
  workshopUsers!: Table<WorkshopUser, string>;
  workshopSettings!: Table<WorkshopSettings, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  syncMeta!: Table<SyncStateMeta, string>;

  constructor() {
    super('zercauto_gest_db');
    this.version(1).stores({
      workOrders: 'id, code, clientId, vehicleId, status, paymentStatus, periodKey, updatedAt',
      clients: 'id, name, nif, phone, updatedAt',
      vehicles: 'id, clientId, plate, updatedAt',
      stockItems: 'id, sku, name, category, supplierId, quantity, updatedAt',
      stockMovements: 'id, stockItemId, sku, type, createdAt',
      suppliers: 'id, name, specialty, updatedAt',
      paymentRecords: 'id, workOrderId, workOrderCode, status, periodKey, updatedAt',
      workshopUsers: 'id, email, role, sessionState, active, updatedAt',
      workshopSettings: 'id, updatedAt',
      syncQueue: '++id, table, recordId, operation, createdAt',
    });
    this.version(2).stores({
      workshopUsers: 'id, name, email, role, sessionState, active, updatedAt',
    });
    this.version(3).stores({
      workOrders:
        'id, code, clientId, vehicleId, status, paymentStatus, periodKey, updatedAt, deletedAt, _syncStatus',
      clients: 'id, name, nif, phone, updatedAt, deletedAt, _syncStatus',
      vehicles: 'id, clientId, plate, updatedAt, deletedAt, _syncStatus',
      stockItems:
        'id, sku, name, category, supplierId, quantity, updatedAt, deletedAt, _syncStatus',
      stockMovements: 'id, stockItemId, sku, type, createdAt, updatedAt, _syncStatus',
      suppliers: 'id, name, specialty, updatedAt, deletedAt, _syncStatus',
      paymentRecords:
        'id, workOrderId, workOrderCode, status, periodKey, updatedAt, deletedAt, _syncStatus',
      workshopUsers:
        'id, name, email, role, sessionState, active, updatedAt, deletedAt, _syncStatus',
      workshopSettings: 'id, updatedAt, _syncStatus',
      syncQueue: '++id, table, recordId, operation, createdAt',
      syncMeta: 'key',
    });
  }
}

export const db = new ZercAutoDB();

export async function enqueueSync(
  table: SyncEntityTable,
  recordId: string,
  operation: 'upsert' | 'delete',
  payload: unknown
): Promise<void> {
  const existing = await db.syncQueue
    .where('recordId')
    .equals(recordId)
    .filter((item) => item.table === table)
    .first();

  if (existing && existing.id !== undefined) {
    await db.syncQueue.update(existing.id, {
      operation,
      payload,
      createdAt: new Date().toISOString(),
    });
  } else {
    await db.syncQueue.add({
      table,
      recordId,
      operation,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
  }
}

export async function saveWorkOrder(wo: WorkOrder): Promise<void> {
  const updated: WorkOrder = {
    ...wo,
    updatedAt: new Date().toISOString(),
    deletedAt: wo.deletedAt ?? null,
    syncVersion: (wo.syncVersion ?? 0) + 1,
    _syncStatus: 'pending',
  };
  await db.transaction('rw', db.workOrders, db.syncQueue, async () => {
    await db.workOrders.put(updated);
    await enqueueSync('workOrders', updated.id, 'upsert', updated);
  });
}

export async function saveClient(client: Client): Promise<void> {
  const updated: Client = {
    ...client,
    updatedAt: new Date().toISOString(),
    deletedAt: client.deletedAt ?? null,
    syncVersion: (client.syncVersion ?? 0) + 1,
    _syncStatus: 'pending',
  };
  await db.transaction('rw', db.clients, db.syncQueue, async () => {
    await db.clients.put(updated);
    await enqueueSync('clients', updated.id, 'upsert', updated);
  });
}

export async function saveVehicle(vehicle: Vehicle): Promise<void> {
  const updated: Vehicle = {
    ...vehicle,
    updatedAt: new Date().toISOString(),
    deletedAt: vehicle.deletedAt ?? null,
    syncVersion: (vehicle.syncVersion ?? 0) + 1,
    _syncStatus: 'pending',
  };
  await db.transaction('rw', db.vehicles, db.syncQueue, async () => {
    await db.vehicles.put(updated);
    await enqueueSync('vehicles', updated.id, 'upsert', updated);
  });
}

export async function saveStockItem(item: StockItem): Promise<void> {
  const updated: StockItem = {
    ...item,
    updatedAt: new Date().toISOString(),
    deletedAt: item.deletedAt ?? null,
    syncVersion: (item.syncVersion ?? 0) + 1,
    _syncStatus: 'pending',
  };
  await db.transaction('rw', db.stockItems, db.syncQueue, async () => {
    await db.stockItems.put(updated);
    await enqueueSync('stockItems', updated.id, 'upsert', updated);
  });
}

export async function recordStockMovement(
  item: StockItem,
  type: 'entrada' | 'saida',
  quantity: number,
  reference: string
): Promise<void> {
  const now = new Date().toISOString();
  const delta = type === 'entrada' ? quantity : -quantity;
  const nextQty = Math.max(0, Number((item.quantity + delta).toFixed(2)));
  const updatedItem: StockItem = {
    ...item,
    quantity: nextQty,
    updatedAt: now,
    deletedAt: item.deletedAt ?? null,
    syncVersion: (item.syncVersion ?? 0) + 1,
    _syncStatus: 'pending',
  };
  const movement: StockMovement = {
    id: newUuid(),
    stockItemId: item.id,
    sku: item.sku,
    itemName: item.name,
    type,
    quantity,
    unit: item.unit,
    reference,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncVersion: 1,
    _syncStatus: 'pending',
  };

  await db.transaction('rw', db.stockItems, db.stockMovements, db.syncQueue, async () => {
    await db.stockItems.put(updatedItem);
    await db.stockMovements.put(movement);
    await enqueueSync('stockItems', updatedItem.id, 'upsert', updatedItem);
    await enqueueSync('stockMovements', movement.id, 'upsert', movement);
  });
}

export interface InventoryAdjustmentInput {
  item: StockItem;
  countedQuantity: number;
  note?: string;
}

export interface InventoryAdjustmentAppliedItem {
  stockItemId: string;
  sku: string;
  name: string;
  unit: string;
  previousQuantity: number;
  countedQuantity: number;
  difference: number;
  costPrice: number;
  costImpact: number;
  movementType: 'entrada' | 'saida';
  note?: string;
}

export async function applyInventoryAdjustments(
  entries: InventoryAdjustmentInput[],
  inventoryRef: string
): Promise<InventoryAdjustmentAppliedItem[]> {
  const now = new Date().toISOString();
  const applied: InventoryAdjustmentAppliedItem[] = [];
  const cleanRef = inventoryRef.trim() || `INV-${now.slice(0, 10)}`;

  await db.transaction('rw', db.stockItems, db.stockMovements, db.syncQueue, async () => {
    for (const entry of entries) {
      const latestItem = (await db.stockItems.get(entry.item.id)) ?? entry.item;
      const nextQty = Math.max(0, Number(entry.countedQuantity.toFixed(2)));
      const prevQty = Number(latestItem.quantity.toFixed(2));
      const diff = Number((nextQty - prevQty).toFixed(2));

      if (Math.abs(diff) < 0.001) {
        continue;
      }

      const movementType: 'entrada' | 'saida' = diff > 0 ? 'entrada' : 'saida';
      const absDiff = Math.abs(diff);

      const updatedItem: StockItem = {
        ...latestItem,
        quantity: nextQty,
        updatedAt: now,
        deletedAt: latestItem.deletedAt ?? null,
        syncVersion: (latestItem.syncVersion ?? 0) + 1,
        _syncStatus: 'pending',
      };

      const noteSuffix = entry.note?.trim() ? ` · ${entry.note.trim()}` : '';
      const movement: StockMovement = {
        id: newUuid(),
        stockItemId: latestItem.id,
        sku: latestItem.sku,
        itemName: latestItem.name,
        type: movementType,
        quantity: absDiff,
        unit: latestItem.unit,
        reference: `${cleanRef} · Acerto (${prevQty}->${nextQty})${noteSuffix}`,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncVersion: 1,
        _syncStatus: 'pending',
      };

      await db.stockItems.put(updatedItem);
      await db.stockMovements.put(movement);
      await enqueueSync('stockItems', updatedItem.id, 'upsert', updatedItem);
      await enqueueSync('stockMovements', movement.id, 'upsert', movement);

      applied.push({
        stockItemId: latestItem.id,
        sku: latestItem.sku,
        name: latestItem.name,
        unit: latestItem.unit,
        previousQuantity: prevQty,
        countedQuantity: nextQty,
        difference: diff,
        costPrice: latestItem.costPrice,
        costImpact: Number((diff * latestItem.costPrice).toFixed(2)),
        movementType,
        note: entry.note?.trim() || undefined,
      });
    }
  });

  return applied;
}

export async function saveSupplier(supplier: Supplier): Promise<void> {
  const updated: Supplier = {
    ...supplier,
    updatedAt: new Date().toISOString(),
    deletedAt: supplier.deletedAt ?? null,
    syncVersion: (supplier.syncVersion ?? 0) + 1,
    _syncStatus: 'pending',
  };
  await db.transaction('rw', db.suppliers, db.syncQueue, async () => {
    await db.suppliers.put(updated);
    await enqueueSync('suppliers', updated.id, 'upsert', updated);
  });
}

export async function savePaymentRecord(payment: PaymentRecord): Promise<void> {
  const updated: PaymentRecord = {
    ...payment,
    updatedAt: new Date().toISOString(),
    deletedAt: payment.deletedAt ?? null,
    syncVersion: (payment.syncVersion ?? 0) + 1,
    _syncStatus: 'pending',
  };
  await db.transaction('rw', db.paymentRecords, db.syncQueue, async () => {
    await db.paymentRecords.put(updated);
    await enqueueSync('paymentRecords', updated.id, 'upsert', updated);
  });
}

export async function saveWorkshopUser(user: WorkshopUser): Promise<void> {
  const updated: WorkshopUser = {
    ...user,
    updatedAt: new Date().toISOString(),
    deletedAt: user.deletedAt ?? null,
    syncVersion: (user.syncVersion ?? 0) + 1,
    _syncStatus: 'pending',
  };
  await db.transaction('rw', db.workshopUsers, db.syncQueue, async () => {
    await db.workshopUsers.put(updated);
    await enqueueSync('workshopUsers', updated.id, 'upsert', updated);
  });
}

export async function saveWorkshopSettings(settings: WorkshopSettings): Promise<void> {
  const updated: WorkshopSettings = {
    ...settings,
    updatedAt: new Date().toISOString(),
    deletedAt: settings.deletedAt ?? null,
    syncVersion: (settings.syncVersion ?? 0) + 1,
    _syncStatus: 'pending',
  };
  await db.transaction('rw', db.workshopSettings, db.syncQueue, async () => {
    await db.workshopSettings.put(updated);
    await enqueueSync('workshopSettings', updated.id, 'upsert', updated);
  });
}
