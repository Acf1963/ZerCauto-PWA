export type CurrencyCode = 'AOA' | 'EUR';

export type WorkOrderStatus =
  | 'Aberta'
  | 'Em Diagnóstico'
  | 'Aguarda Peças'
  | 'Em Execução'
  | 'Concluída'
  | 'Pronta para Faturar'
  | 'Faturada';

export type PaymentStatus = 'Pendente' | 'Link Online' | 'Parcial' | 'Liquidado';

export type PaymentMethod =
  | 'Pagamento Online (Link / Ref.)'
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
  | 'folhas-obra'
  | 'clientes-viaturas'
  | 'stock-fornecedores'
  | 'pagamentos'
  | 'relatorios'
  | 'utilizadores'
  | 'definicoes';

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

export interface WorkOrder {
  id: string;
  code: string;
  clientId: string;
  clientName: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleLabel: string;
  mileage: number;
  status: WorkOrderStatus;
  diagnosis: string;
  parts: WorkOrderPart[];
  labor: WorkOrderLabor[];
  ivaRate: number;
  subtotal: number;
  ivaAmount: number;
  total: number;
  cmvTotal: number;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  paymentLink?: string;
  periodKey: string; // YYYY-MM e.g. '2026-11'
  openedAt: string; // DD/MM/YYYY
  updatedAt: string; // ISO
}

export interface Client {
  id: string;
  name: string;
  nif: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  clientId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  vin: string;
  mileage: number;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  deliveryEta: string;
  specialty: string;
  email: string;
  updatedAt: string;
}

export interface StockItem {
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
  updatedAt: string;
}

export interface StockMovement {
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

export interface PaymentRecord {
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
  updatedAt: string;
}

export interface WorkshopUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  sessionState: SessionState;
  permissions: ModulePermission[];
  active: boolean;
  updatedAt: string;
}

export interface WorkshopSettings {
  id: string; // 'default'
  workshopName: string;
  nif: string;
  phone: string;
  address: string;
  foPrefix: string;
  currency: CurrencyCode;
  ivaRate: number;
  hourlyRate: number;
  autoSync: boolean;
  updatedAt: string;
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
