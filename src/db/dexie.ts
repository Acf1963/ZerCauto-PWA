import Dexie, {type Table} from 'dexie';
import type {
  Client,
  PaymentRecord,
  StockItem,
  StockMovement,
  Supplier,
  SyncEntityTable,
  SyncQueueItem,
  Vehicle,
  WorkOrder,
  WorkshopSettings,
  WorkshopUser,
} from '../types/database';

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
  const updated = {...wo, updatedAt: new Date().toISOString()};
  await db.transaction('rw', db.workOrders, db.syncQueue, async () => {
    await db.workOrders.put(updated);
    await enqueueSync('workOrders', updated.id, 'upsert', updated);
  });
}

export async function saveClient(client: Client): Promise<void> {
  const updated = {...client, updatedAt: new Date().toISOString()};
  await db.transaction('rw', db.clients, db.syncQueue, async () => {
    await db.clients.put(updated);
    await enqueueSync('clients', updated.id, 'upsert', updated);
  });
}

export async function saveVehicle(vehicle: Vehicle): Promise<void> {
  const updated = {...vehicle, updatedAt: new Date().toISOString()};
  await db.transaction('rw', db.vehicles, db.syncQueue, async () => {
    await db.vehicles.put(updated);
    await enqueueSync('vehicles', updated.id, 'upsert', updated);
  });
}

export async function saveStockItem(item: StockItem): Promise<void> {
  const updated = {...item, updatedAt: new Date().toISOString()};
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
  const delta = type === 'entrada' ? quantity : -quantity;
  const nextQty = Math.max(0, Number((item.quantity + delta).toFixed(2)));
  const updatedItem: StockItem = {
    ...item,
    quantity: nextQty,
    updatedAt: new Date().toISOString(),
  };
  const movement: StockMovement = {
    id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    stockItemId: item.id,
    sku: item.sku,
    itemName: item.name,
    type,
    quantity,
    unit: item.unit,
    reference,
    createdAt: new Date().toISOString(),
  };

  await db.transaction('rw', db.stockItems, db.stockMovements, db.syncQueue, async () => {
    await db.stockItems.put(updatedItem);
    await db.stockMovements.put(movement);
    await enqueueSync('stockItems', updatedItem.id, 'upsert', updatedItem);
    await enqueueSync('stockMovements', movement.id, 'upsert', movement);
  });
}

export async function saveSupplier(supplier: Supplier): Promise<void> {
  const updated = {...supplier, updatedAt: new Date().toISOString()};
  await db.transaction('rw', db.suppliers, db.syncQueue, async () => {
    await db.suppliers.put(updated);
    await enqueueSync('suppliers', updated.id, 'upsert', updated);
  });
}

export async function savePaymentRecord(payment: PaymentRecord): Promise<void> {
  const updated = {...payment, updatedAt: new Date().toISOString()};
  await db.transaction('rw', db.paymentRecords, db.syncQueue, async () => {
    await db.paymentRecords.put(updated);
    await enqueueSync('paymentRecords', updated.id, 'upsert', updated);
  });
}

export async function saveWorkshopUser(user: WorkshopUser): Promise<void> {
  const updated = {...user, updatedAt: new Date().toISOString()};
  await db.transaction('rw', db.workshopUsers, db.syncQueue, async () => {
    await db.workshopUsers.put(updated);
    await enqueueSync('workshopUsers', updated.id, 'upsert', updated);
  });
}

export async function saveWorkshopSettings(settings: WorkshopSettings): Promise<void> {
  const updated = {...settings, updatedAt: new Date().toISOString()};
  await db.transaction('rw', db.workshopSettings, db.syncQueue, async () => {
    await db.workshopSettings.put(updated);
    await enqueueSync('workshopSettings', updated.id, 'upsert', updated);
  });
}
