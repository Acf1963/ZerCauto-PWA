export type CurrencyCode = 'AOA' | 'EUR';

export type SyncStatus = 'pending' | 'synced' | 'error';

export interface SyncMetadata {
  createdAt?: string;
  updatedAt: string;
  deletedAt?: string | null;
  syncVersion?: number;
  _syncStatus?: SyncStatus;
}

export type WorkOrderStatus =
  | 'Aberta'
  | 'Em Diagnóstico'
  | 'Aguarda Peças'
  | 'Em Execução'
  | 'Concluída'
  | 'Pronta para Faturar'
  | 'Faturada';

export type PaymentStatus = 'Pendente' | 'Parcial' | 'Liquidado';

export type PaymentMethod =
  | 'TPA / Multicaixa'
  | 'Transferência Bancária'
  | 'Numerário';

export type UserRole =
  | 'Administrador'
  | 'Chefe de Oficina'
  | 'Receção & Faturação'
  | 'Mecânico Sénior'
  | 'Mecânico'
  | 'Estagiário'
  | 'Contabilidade';

export type SessionState = 'Ativa (Atual)' | 'Online' | 'Offline Cache' | 'Suspenso';

export type ModulePermission = 'work_orders' | 'stock' | 'payments' | 'users' | 'settings';

export type SyncEntityTable =
  | 'workOrders'
  | 'clients'
  | 'vehicles'
  | 'stockItems'
  | 'stockMovements'
  | 'suppliers'
  | 'paymentRecords'
  | 'workshopUsers'
  | 'workshopSettings';

export type NavSection =
  | 'dashboard'
  | 'folhas-obra'
  | 'clientes-viaturas'
  | 'stock-fornecedores'
  | 'pagamentos'
  | 'relatorios'
  | 'utilizadores'
  | 'definicoes'
  | 'demo';

export interface WorkOrderPart {
  id: string;
  stockItemId?: string;
  sku: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  unitPrice: number;
  totalPrice: number;
}

export interface WorkOrderLabor {
  id: string;
  technicianName: string;
  description: string;
  hours: number;
  hourlyRate: number;
  totalPrice: number;
}

export interface WorkOrder extends SyncMetadata {
  id: string;
  code: string;
  clientId: string;
  clientName: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleLabel: string;
  mileage: number;
  assignedMechanicId?: string | null;
  status: WorkOrderStatus;
  diagnosis: string;
  complaintDescription?: string;
  parts: WorkOrderPart[];
  labor: WorkOrderLabor[];
  ivaRate: number;
  discount?: number;
  subtotal: number;
  ivaAmount: number;
  total: number;
  cmvTotal: number;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  paymentLink?: string;
  periodKey: string; // YYYY-MM e.g. '2026-11'
  openedAt: string; // DD/MM/YYYY
}

export interface Client extends SyncMetadata {
  id: string;
  name: string;
  nif: string;
  phone: string;
  email: string;
  address: string;
  clientType?: 'particular' | 'empresa';
  notes: string;
  createdAt: string;
}

export interface Vehicle extends SyncMetadata {
  id: string;
  clientId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  vin: string;
  fuelType?: string;
  mileage: number;
}

export interface Supplier extends SyncMetadata {
  id: string;
  name: string;
  nif?: string;
  phone: string;
  deliveryEta: string;
  specialty: string;
  paymentTerms?: string;
  email: string;
}

export interface StockItem extends SyncMetadata {
  id: string;
  sku: string;
  name: string;
  category: string;
  supplierId: string;
  supplierName: string;
  unit: string;
  costPrice: number;
  salePrice: number;
  quantity: number;
  minQuantity: number;
}

export interface StockMovement extends SyncMetadata {
  id: string;
  stockItemId: string;
  sku: string;
  itemName: string;
  type: 'entrada' | 'saida';
  quantity: number;
  unit: string;
  reference: string;
  createdAt: string;
}

export interface PaymentRecord extends SyncMetadata {
  id: string;
  workOrderId: string;
  workOrderCode: string;
  clientName: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string;
  periodKey: string;
  paidAt: string; // DD/MM/YYYY
  recordedBy?: string | null;
}

export interface WorkshopUser extends SyncMetadata {
  id: string;
  name: string;
  email: string;
  phone?: string;
  passwordHash?: string;
  role: UserRole;
  sessionState: SessionState;
  permissions: ModulePermission[];
  active: boolean;
}

export interface WorkshopSettings extends SyncMetadata {
  id: string; // UUID '00000000-0000-4000-8000-000000000001'
  workshopName: string;
  nif: string;
  phone: string;
  email?: string;
  address: string;
  logoUrl?: string;
  foPrefix: string;
  currency: CurrencyCode;
  ivaRate: number;
  hourlyRate: number;
  invoiceFooter?: string;
  autoSync: boolean;
}

export interface SyncQueueItem {
  id?: number;
  table: SyncEntityTable;
  recordId: string;
  operation: 'upsert' | 'delete';
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

export interface SyncErrorLog {
  id?: number;
  table: string;
  recordId: string;
  error: string;
  createdAt: string;
}

export interface SyncStateMeta {
  key: string;
  value: string;
}

