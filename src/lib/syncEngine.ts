import {db} from '../db/dexie';
import type {SyncEntityTable} from '../types/database';
import {isSupabaseConfigured, supabase} from './supabase';

export interface SyncResult {
  syncedCount: number;
  remainingCount: number;
  mode: 'cloud' | 'local';
  timestamp: string;
  error?: string;
}

const SUPABASE_TABLE_MAP: Record<SyncEntityTable, string> = {
  workOrders: 'work_orders',
  clients: 'clients',
  vehicles: 'vehicles',
  stockItems: 'stock_items',
  stockMovements: 'stock_movements',
  suppliers: 'suppliers',
  paymentRecords: 'payment_records',
  workshopUsers: 'workshop_users',
  workshopSettings: 'workshop_settings',
};

export async function runSyncCycle(): Promise<SyncResult> {
  const queueItems = await db.syncQueue.orderBy('id').toArray();
  const timestamp = new Date().toISOString();

  if (!navigator.onLine) {
    return {
      syncedCount: 0,
      remainingCount: queueItems.length,
      mode: isSupabaseConfigured ? 'cloud' : 'local',
      timestamp,
      error: 'Sem ligação à internet. Alterações mantidas no IndexedDB local.',
    };
  }

  // When Supabase cloud credentials are configured, push queue items to PostgreSQL
  if (isSupabaseConfigured && supabase) {
    let syncedCount = 0;
    for (const item of queueItems) {
      const remoteTable = SUPABASE_TABLE_MAP[item.table];
      try {
        if (item.operation === 'delete') {
          const {error} = await supabase.from(remoteTable).delete().eq('id', item.recordId);
          if (error) throw error;
        } else {
          const {error} = await supabase.from(remoteTable).upsert(item.payload as Record<string, unknown>);
          if (error) throw error;
        }
        if (item.id !== undefined) {
          await db.syncQueue.delete(item.id);
        }
        syncedCount++;
      } catch (err) {
        if (item.id !== undefined) {
          await db.syncQueue.update(item.id, {
            attempts: item.attempts + 1,
            lastError: err instanceof Error ? err.message : 'Erro de sincronização',
          });
        }
      }
    }
    const remainingCount = await db.syncQueue.count();
    return {
      syncedCount,
      remainingCount,
      mode: 'cloud',
      timestamp,
    };
  }

  // Local IndexedDB checkpoint reconciliation when running standalone offline-first
  if (queueItems.length > 0) {
    const ids = queueItems.map((q) => q.id).filter((id): id is number => id !== undefined);
    await db.syncQueue.bulkDelete(ids);
  }

  return {
    syncedCount: queueItems.length,
    remainingCount: 0,
    mode: 'local',
    timestamp,
  };
}
