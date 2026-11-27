import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  ClipboardPlus,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Package,
  PackagePlus,
  TrendingUp,
  Wallet,
  Wrench,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import {ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid} from 'recharts';
import {newUuid, saveStockItem, saveWorkOrder} from '../db/dexie';
import type {
  Client,
  CurrencyCode,
  NavSection,
  PaymentRecord,
  StockItem,
  Supplier,
  Vehicle,
  WorkOrder,
  WorkOrderStatus,
  WorkshopSettings,
} from '../types/database';
import {
  formatCurrency,
  formatPeriodLabel,
  formatTodayPT,
  getCurrentPeriodKey,
  getWorkOrderStatusStyle,
} from '../utils/formatters';
import {Modal} from '../components/ui/Modal';
import {exportCustomTablePdf, downloadXlsxWorkbook} from '../utils/exporters';

const STATUS_OPTIONS: WorkOrderStatus[] = [
  'Aberta',
  'Em Diagnóstico',
  'Aguarda Peças',
  'Em Execução',
  'Concluída',
  'Pronta para Faturar',
  'Faturada',
];

interface DashboardPageProps {
  workOrders: WorkOrder[];
  clients: Client[];
  vehicles: Vehicle[];
  stockItems: StockItem[];
  suppliers: Supplier[];
  paymentRecords: PaymentRecord[];
  currency: CurrencyCode;
  settings: WorkshopSettings;
  onNavigate: (section: NavSection) => void;
  onNotify: (msg: string) => void;
}

export function DashboardPage({
  workOrders,
  clients,
  vehicles,
  stockItems,
  suppliers,
  paymentRecords: _paymentRecords,
  currency,
  settings,
  onNavigate,
  onNotify,
}: DashboardPageProps) {
  // Interactive Modals triggered by clicking KPI cards
  const [revenueModalOpen, setRevenueModalOpen] = useState(false);
  const [activeModalOpen, setActiveModalOpen] = useState(false);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [unpaidModalOpen, setUnpaidModalOpen] = useState(false);

  // Quick Action Modals
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newPartOpen, setNewPartOpen] = useState(false);

  // Quick New Order Form state
  const [newClientId, setNewClientId] = useState(clients[0]?.id ?? '');
  const [newVehicleId, setNewVehicleId] = useState('');
  const [newMileage, setNewMileage] = useState('');
  const [newStatus, setNewStatus] = useState<WorkOrderStatus>('Em Diagnóstico');
  const [newDiagnosis, setNewDiagnosis] = useState('');

  // Quick New Part Form state
  const [pSku, setPSku] = useState('');
  const [pName, setPName] = useState('');
  const [pCategory, setPCategory] = useState('Filtros');
  const [pSupplierId, setPSupplierId] = useState(suppliers[0]?.id ?? '');
  const [pUnit, setPUnit] = useState('un');
  const [pCost, setPCost] = useState('');
  const [pSale, setPSale] = useState('');
  const [pQty, setPQty] = useState('5');
  const [pMinQty, setPMinQty] = useState('2');

  const currentPeriod = getCurrentPeriodKey();
  const currentMonthOrders = useMemo(
    () => workOrders.filter((w) => w.periodKey === currentPeriod),
    [workOrders, currentPeriod]
  );

  const monthlyRevenue = useMemo(
    () => currentMonthOrders.reduce((acc, w) => acc + w.total, 0),
    [currentMonthOrders]
  );

  const activeOrders = useMemo(
    () => workOrders.filter((w) => w.status !== 'Faturada' && w.status !== 'Concluída'),
    [workOrders]
  );

  const criticalItems = useMemo(
    () => stockItems.filter((s) => s.quantity <= s.minQuantity),
    [stockItems]
  );

  const unpaidOrders = useMemo(
    () => workOrders.filter((w) => w.paymentStatus !== 'Liquidado'),
    [workOrders]
  );

  const unpaidTotal = useMemo(
    () => unpaidOrders.reduce((acc, w) => acc + w.total, 0),
    [unpaidOrders]
  );

  const recentOrders = useMemo(
    () => [...workOrders].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
    [workOrders]
  );

  // Last 6 months revenue data for Recharts BarChart
  const monthlyRevenueData = useMemo(() => {
    const months: Array<{periodKey: string; label: string; revenue: number; count: number}> = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const periodKey = `${year}-${month}`;
      const label = d.toLocaleDateString('pt-PT', {month: 'short', year: 'numeric'});

      const periodOrders = workOrders.filter((w) => w.periodKey === periodKey);
      const revenue = periodOrders.reduce((acc, w) => acc + w.total, 0);
      months.push({periodKey, label, revenue, count: periodOrders.length});
    }
    return months;
  }, [workOrders]);

  const handleCopyRestockList = async () => {
    const lines = criticalItems.map(
      (item) =>
        `SKU: ${item.sku} | ${item.name} | Stock Atual: ${item.quantity} ${item.unit} | Sugestão Encomenda: ${Math.max(
          item.minQuantity * 3 - item.quantity,
          item.minQuantity
        )} ${item.unit}`
    );
    const text = `--- SUGESTÃO DE ENCOMENDA DE STOCK CRÍTICO (${formatPeriodLabel(currentPeriod)}) ---\n` + lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      onNotify('Lista de sugestão de encomenda copiada para o clipboard.');
    } catch {
      onNotify('Erro ao copiar para o clipboard.');
    }
  };

  const clientVehicles = useMemo(
    () => vehicles.filter((v) => v.clientId === newClientId),
    [vehicles, newClientId]
  );

  const handleOpenNewOrder = () => {
    const firstClientId = clients[0]?.id ?? '';
    setNewClientId(firstClientId);
    const firstVeh = vehicles.find((v) => v.clientId === firstClientId);
    setNewVehicleId(firstVeh?.id ?? '');
    setNewMileage(firstVeh ? String(firstVeh.mileage) : '');
    setNewStatus('Em Diagnóstico');
    setNewDiagnosis('');
    setNewOrderOpen(true);
  };

  const handleOpenNewPart = () => {
    setPSupplierId(suppliers[0]?.id ?? '');
    setPSku('');
    setPName('');
    setPCategory('Filtros');
    setPUnit('un');
    setPCost('');
    setPSale('');
    setPQty('5');
    setPMinQty('2');
    setNewPartOpen(true);
  };

  const handleClientChange = (cid: string) => {
    setNewClientId(cid);
    const firstVeh = vehicles.find((v) => v.clientId === cid);
    setNewVehicleId(firstVeh?.id ?? '');
    setNewMileage(firstVeh ? String(firstVeh.mileage) : '');
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find((c) => c.id === newClientId);
    const vehicle = vehicles.find((v) => v.id === newVehicleId);
    if (!client || !vehicle || !newDiagnosis.trim()) {
      onNotify('Selecione cliente, viatura e preencha o diagnóstico.');
      return;
    }

    const nextSeq =
      workOrders.reduce((max, w) => {
        const num = Number(w.code.split('-').pop() ?? 0);
        return Number.isFinite(num) && num > max ? num : max;
      }, 142) + 1;
    const code = `${settings.foPrefix}-${String(nextSeq).padStart(4, '0')}`;

    const newOrder: WorkOrder = {
      id: newUuid(),
      code,
      clientId: client.id,
      clientName: client.name,
      vehicleId: vehicle.id,
      vehiclePlate: vehicle.plate,
      vehicleLabel: `${vehicle.brand} ${vehicle.model}`,
      mileage: Number(newMileage) || vehicle.mileage,
      status: newStatus,
      diagnosis: newDiagnosis.trim(),
      parts: [],
      labor: [],
      ivaRate: settings.ivaRate,
      subtotal: 0,
      ivaAmount: 0,
      total: 0,
      cmvTotal: 0,
      paymentStatus: 'Pendente',
      periodKey: currentPeriod,
      openedAt: formatTodayPT(),
      updatedAt: new Date().toISOString(),
    };

    await saveWorkOrder(newOrder);
    setNewOrderOpen(false);
    onNotify(`Folha de Obra ${code} criada e guardada localmente.`);
  };

  const handleSavePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pSku.trim() || !pName.trim()) return;
    const supplier = suppliers.find((s) => s.id === pSupplierId) ?? suppliers[0];

    const newItem: StockItem = {
      id: newUuid(),
      sku: pSku.trim().toUpperCase(),
      name: pName.trim(),
      category: pCategory.trim() || 'Geral',
      supplierId: supplier?.id ?? '',
      supplierName: supplier?.name ?? 'Fornecedor Local',
      unit: pUnit.trim() || 'un',
      costPrice: Number(pCost) || 0,
      salePrice: Number(pSale) || 0,
      quantity: Math.max(0, Number(pQty) || 0),
      minQuantity: Math.max(1, Number(pMinQty) || 1),
      updatedAt: new Date().toISOString(),
    };

    await saveStockItem(newItem);
    setNewPartOpen(false);
    onNotify(`Peça ${newItem.sku} registada no catálogo de stock.`);
  };

  return (
    <div className="flex flex-col gap-gutter-lg">
      {/* Welcome Hero Bar + Quick Actions */}
      <div className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md lg:p-gutter-lg flex flex-wrap items-center justify-between gap-gutter-md">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="font-label text-label-sm text-light-on-surface-variant uppercase tracking-wider">
            Painel Central · {settings.workshopName}
          </span>
          <h1 className="font-display text-headline-md text-light-on-surface">
            Resumo Operacional &amp; Alertas em Tempo Real
          </h1>
          <p className="font-body text-body-sm text-light-on-surface-variant">
            Acompanhe o estado da oficina, tarefas pendentes, alertas de stock e saldos por liquidar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-gutter-sm shrink-0">
          <button
            type="button"
            onClick={handleOpenNewOrder}
            className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[42px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-lg whitespace-nowrap transition-colors duration-state-change shadow-sm"
          >
            <ClipboardPlus className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Nova Folha de Obra</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNewPart}
            className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[42px] rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container text-light-on-surface font-label text-label-lg whitespace-nowrap transition-colors duration-state-change shadow-sm"
          >
            <PackagePlus className="w-4 h-4 shrink-0 text-light-primary dark:text-red-400" aria-hidden="true" />
            <span>Registar Peça</span>
          </button>
        </div>
      </div>

      {/* 4 Interactive KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter-md">
        {/* Card 1: Faturamento Mensal (Interactive) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setRevenueModalOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setRevenueModalOpen(true);
          }}
          className="bg-light-surface-container-lowest border border-light-outline-variant hover:border-light-primary rounded-lg p-gutter-md flex flex-col justify-between gap-gutter-xs cursor-pointer transition-all duration-state-change hover:shadow-sm"
        >
          <header className="flex items-center justify-between gap-gutter-sm">
            <span className="font-label text-label-lg text-light-on-surface-variant">
              Faturamento ({formatPeriodLabel(currentPeriod)})
            </span>
            <Wallet className="w-4 h-4 text-light-outline shrink-0" aria-hidden="true" />
          </header>
          <p className="font-display text-headline-lg text-light-on-surface tabular-nums">
            {formatCurrency(monthlyRevenue, currency)}
          </p>
          <span className="font-body text-body-sm text-light-primary dark:text-red-400 flex items-center gap-1 font-medium">
            <span>{currentMonthOrders.length} folhas emitidas (Ver detalhe)</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        </div>

        {/* Card 2: FOs Ativas (Interactive) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveModalOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setActiveModalOpen(true);
          }}
          className="bg-light-surface-container-lowest border border-light-outline-variant hover:border-light-primary rounded-lg p-gutter-md flex flex-col justify-between gap-gutter-xs cursor-pointer transition-all duration-state-change hover:shadow-sm"
        >
          <header className="flex items-center justify-between gap-gutter-sm">
            <span className="font-label text-label-lg text-light-on-surface-variant">
              Folhas em Oficina
            </span>
            <Wrench className="w-4 h-4 text-light-outline shrink-0" aria-hidden="true" />
          </header>
          <p className="font-display text-headline-lg text-light-on-surface tabular-nums">
            {activeOrders.length} FOs
          </p>
          <span className="font-body text-body-sm text-light-primary dark:text-red-400 flex items-center gap-1 font-medium">
            <span>Em execução ou diagnóstico (Ver)</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        </div>

        {/* Card 3: Alertas de Stock (Interactive) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setStockModalOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setStockModalOpen(true);
          }}
          className={`bg-light-surface-container-lowest border rounded-lg p-gutter-md flex flex-col justify-between gap-gutter-xs cursor-pointer transition-all duration-state-change hover:shadow-sm ${
            criticalItems.length > 0
              ? 'border-light-error/60 dark:border-red-400/60 hover:border-light-error'
              : 'border-light-outline-variant hover:border-light-primary'
          }`}
        >
          <header className="flex items-center justify-between gap-gutter-sm">
            <span className="font-label text-label-lg text-light-on-surface-variant">
              Alertas de Stock
            </span>
            <AlertTriangle
              className={`w-4 h-4 shrink-0 ${
                criticalItems.length > 0 ? 'text-light-error dark:text-red-400' : 'text-success dark:text-emerald-400'
              }`}
              aria-hidden="true"
            />
          </header>
          <p
            className={`font-display text-headline-lg tabular-nums ${
              criticalItems.length > 0 ? 'text-light-error dark:text-red-400' : 'text-success dark:text-emerald-400'
            }`}
          >
            {criticalItems.length} {criticalItems.length === 1 ? 'peça crítica' : 'peças críticas'}
          </p>
          <span className="font-body text-body-sm text-light-primary dark:text-red-400 flex items-center gap-1 font-medium">
            <span>Ver lista e sugestão de encomenda</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        </div>

        {/* Card 4: Por Liquidar (Interactive) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setUnpaidModalOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setUnpaidModalOpen(true);
          }}
          className="bg-light-surface-container-lowest border border-light-outline-variant hover:border-light-primary rounded-lg p-gutter-md flex flex-col justify-between gap-gutter-xs cursor-pointer transition-all duration-state-change hover:shadow-sm"
        >
          <header className="flex items-center justify-between gap-gutter-sm">
            <span className="font-label text-label-lg text-light-on-surface-variant">
              Por Liquidar
            </span>
            <CreditCard className="w-4 h-4 text-light-outline shrink-0" aria-hidden="true" />
          </header>
          <p className="font-display text-headline-lg text-light-on-surface tabular-nums">
            {formatCurrency(unpaidTotal, currency)}
          </p>
          <span className="font-body text-body-sm text-light-primary dark:text-red-400 flex items-center gap-1 font-medium">
            <span>{unpaidOrders.length} FOs pendentes (Ver)</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        </div>
      </section>

      {/* Main Split: Recharts Monthly Revenue Bar Chart & Recent Work Orders / Shortcuts */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg items-start">
        {/* Left Column: Recharts Bar Chart + Recent Work Orders (7 cols) */}
        <div className="xl:col-span-7 flex flex-col gap-gutter-lg">
          {/* Recharts Monthly Revenue Bar Chart */}
          <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-md">
            <header className="flex items-center justify-between gap-gutter-sm pb-2 border-b border-light-outline-variant">
              <div>
                <h3 className="font-headline text-title-md text-light-on-surface">
                  Faturação Mensal Acumulada (Últimos 6 Meses)
                </h3>
                <p className="font-body text-body-sm text-light-on-surface-variant">
                  Evolução do volume de faturação em {currency}
                </p>
              </div>
              <TrendingUp className="w-5 h-5 text-light-primary dark:text-red-400 shrink-0" aria-hidden="true" />
            </header>

            <div className="w-full h-[260px] pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyRevenueData} margin={{top: 10, right: 10, left: -20, bottom: 0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.4} />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} />
                  <Tooltip
                    formatter={(value: any) => [
                      formatCurrency(Number(value ?? 0), currency),
                      'Faturação',
                    ]}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="revenue" fill="#991b1b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          {/* Recent Work Orders List */}
          <div className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg overflow-hidden flex flex-col">
            <header className="px-gutter-md py-gutter-sm bg-light-surface-container-low border-b border-light-outline-variant flex items-center justify-between">
              <h3 className="font-headline text-title-md text-light-on-surface">
                Folhas de Obra Recentes
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('folhas-obra')}
                className="font-label text-label-sm text-light-primary dark:text-red-400 hover:underline inline-flex items-center gap-1"
              >
                <span>Ver todas</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </header>

            <div className="divide-y divide-light-outline-variant">
              {recentOrders.length === 0 ? (
                <div className="p-gutter-lg text-center font-body text-body-sm text-light-on-surface-variant">
                  Nenhuma folha de obra registada.
                </div>
              ) : (
                recentOrders.map((wo) => (
                  <div
                    key={wo.id}
                    onClick={() => onNavigate('folhas-obra')}
                    className="px-gutter-md py-gutter-sm flex items-center justify-between gap-gutter-sm hover:bg-light-surface-container-low/60 cursor-pointer transition-colors duration-state-change"
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-gutter-sm flex-wrap">
                        <span className="font-mono text-title-sm text-light-primary dark:text-red-400 font-semibold">
                          {wo.code}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-label text-label-sm whitespace-nowrap ${getWorkOrderStatusStyle(
                            wo.status
                          )}`}
                        >
                          {wo.status}
                        </span>
                      </div>
                      <span className="font-body text-body-sm text-light-on-surface-variant truncate">
                        {wo.clientName} · {wo.vehiclePlate} ({wo.vehicleLabel})
                      </span>
                    </div>

                    <span className="font-mono text-mono-md text-light-on-surface tabular-nums whitespace-nowrap font-semibold">
                      {formatCurrency(wo.total, currency)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Compact Button-like Shortcuts (5 cols) */}
        <div className="xl:col-span-5 flex flex-col gap-gutter-md">
          <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-md">
            <header className="pb-2 border-b border-light-outline-variant">
              <h3 className="font-headline text-title-md text-light-on-surface">
                Atalhos Rápidos
              </h3>
              <p className="font-body text-body-sm text-light-on-surface-variant">
                Aceda rapidamente aos módulos principais da oficina.
              </p>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onNavigate('folhas-obra')}
                className="px-3 py-2.5 rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container text-left flex items-center gap-2.5 transition-colors duration-state-change group"
              >
                <ClipboardList className="w-4 h-4 text-light-primary dark:text-red-400 shrink-0 group-hover:scale-110 transition-transform" aria-hidden="true" />
                <span className="font-label text-label-lg text-light-on-surface truncate">Folhas de Obra</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('stock-fornecedores')}
                className="px-3 py-2.5 rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container text-left flex items-center gap-2.5 transition-colors duration-state-change group"
              >
                <Package className="w-4 h-4 text-light-primary dark:text-red-400 shrink-0 group-hover:scale-110 transition-transform" aria-hidden="true" />
                <span className="font-label text-label-lg text-light-on-surface truncate">Stock &amp; Inventário</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('pagamentos')}
                className="px-3 py-2.5 rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container text-left flex items-center gap-2.5 transition-colors duration-state-change group"
              >
                <CreditCard className="w-4 h-4 text-light-primary dark:text-red-400 shrink-0 group-hover:scale-110 transition-transform" aria-hidden="true" />
                <span className="font-label text-label-lg text-light-on-surface truncate">Finanças &amp; Pagamentos</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('relatorios')}
                className="px-3 py-2.5 rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container text-left flex items-center gap-2.5 transition-colors duration-state-change group"
              >
                <TrendingUp className="w-4 h-4 text-light-primary dark:text-red-400 shrink-0 group-hover:scale-110 transition-transform" aria-hidden="true" />
                <span className="font-label text-label-lg text-light-on-surface truncate">Relatórios Mensais</span>
              </button>
            </div>
          </article>
        </div>
      </section>

      {/* Modal 1: Faturamento Mensal (November Details) with PDF & XLSX export */}
      <Modal
        open={revenueModalOpen}
        onClose={() => setRevenueModalOpen(false)}
        title={`Detalhe de Faturamento (${formatPeriodLabel(currentPeriod)})`}
        subtitle={`Exibe ${currentMonthOrders.length} folhas de obra emitidas este mês · Total: ${formatCurrency(monthlyRevenue, currency)}`}
      >
        <div className="flex flex-col gap-gutter-md">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={async () => {
                const headers = ['Código FO', 'Cliente', 'Viatura', 'Estado', 'Pagamento', `Total (${currency})`];
                const rows = currentMonthOrders.map((wo) => [
                  wo.code,
                  wo.clientName,
                  `${wo.vehiclePlate} (${wo.vehicleLabel})`,
                  wo.status,
                  wo.paymentStatus,
                  formatCurrency(wo.total, currency),
                ]);
                await exportCustomTablePdf(
                  `Faturação Mensal - ${formatPeriodLabel(currentPeriod)}`,
                  `Total Faturado: ${formatCurrency(monthlyRevenue, currency)} (${currentMonthOrders.length} folhas)`,
                  headers,
                  rows,
                  settings,
                  `zercauto-faturacao-${currentPeriod}.pdf`
                );
                onNotify('Relatório PDF de faturamento exportado com sucesso.');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container font-label text-label-sm text-light-on-surface"
            >
              <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Exportar PDF</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const headers = ['Código FO', 'Cliente', 'Viatura', 'Estado', 'Pagamento', `Total (${currency})`];
                const rows = currentMonthOrders.map((wo) => [
                  wo.code,
                  wo.clientName,
                  `${wo.vehiclePlate} (${wo.vehicleLabel})`,
                  wo.status,
                  wo.paymentStatus,
                  wo.total,
                ]);
                downloadXlsxWorkbook(`zercauto-faturacao-${currentPeriod}.xlsx`, [
                  {name: 'Faturação Mensal', headers, rows},
                ]);
                onNotify('Relatório XLSX de faturamento exportado com sucesso.');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container font-label text-label-sm text-light-on-surface"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Exportar XLSX</span>
            </button>
          </div>

          {currentMonthOrders.length === 0 ? (
            <div className="p-gutter-lg text-center font-body text-body-md text-light-on-surface-variant">
              Nenhuma folha de obra emitida neste período.
            </div>
          ) : (
            <div className="divide-y divide-light-outline-variant border border-light-outline-variant rounded overflow-hidden max-h-[60vh] overflow-y-auto">
              {currentMonthOrders.map((wo) => (
                <div key={wo.id} className="p-gutter-md flex items-center justify-between gap-gutter-sm bg-light-surface-container-lowest">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-title-sm text-light-primary dark:text-red-400 font-semibold">{wo.code}</span>
                      <span className={`px-2 py-0.5 rounded font-label text-label-sm ${getWorkOrderStatusStyle(wo.status)}`}>{wo.status}</span>
                    </div>
                    <span className="font-body text-body-sm text-light-on-surface-variant">{wo.clientName} · {wo.vehiclePlate}</span>
                  </div>
                  <span className="font-mono text-title-md text-light-on-surface font-semibold tabular-nums">{formatCurrency(wo.total, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal 2: Folhas em Oficina (Active Orders) with PDF & XLSX export */}
      <Modal
        open={activeModalOpen}
        onClose={() => setActiveModalOpen(false)}
        title="Folhas de Obra em Oficina (Ativas)"
        subtitle={`Exibe ${activeOrders.length} folhas de obra atualmente em execução ou diagnóstico`}
      >
        <div className="flex flex-col gap-gutter-md">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={async () => {
                const headers = ['Código FO', 'Cliente', 'Viatura', 'Estado', 'Diagnóstico', `Total (${currency})`];
                const rows = activeOrders.map((wo) => [
                  wo.code,
                  wo.clientName,
                  `${wo.vehiclePlate} (${wo.vehicleLabel})`,
                  wo.status,
                  wo.diagnosis,
                  formatCurrency(wo.total, currency),
                ]);
                await exportCustomTablePdf(
                  'Folhas de Obra em Oficina (Ativas)',
                  `Total Ativas: ${activeOrders.length} folhas`,
                  headers,
                  rows,
                  settings,
                  'zercauto-folhas-oficina-ativas.pdf'
                );
                onNotify('Relatório PDF de folhas ativas exportado.');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container font-label text-label-sm text-light-on-surface"
            >
              <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Exportar PDF</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const headers = ['Código FO', 'Cliente', 'Viatura', 'Estado', 'Diagnóstico', `Total (${currency})`];
                const rows = activeOrders.map((wo) => [
                  wo.code,
                  wo.clientName,
                  `${wo.vehiclePlate} (${wo.vehicleLabel})`,
                  wo.status,
                  wo.diagnosis,
                  wo.total,
                ]);
                downloadXlsxWorkbook('zercauto-folhas-oficina-ativas.xlsx', [
                  {name: 'Folhas Ativas', headers, rows},
                ]);
                onNotify('Relatório XLSX de folhas ativas exportado.');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container font-label text-label-sm text-light-on-surface"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Exportar XLSX</span>
            </button>
          </div>

          {activeOrders.length === 0 ? (
            <div className="p-gutter-lg text-center font-body text-body-md text-success dark:text-emerald-400">
              Não existem folhas de obra ativas neste momento.
            </div>
          ) : (
            <div className="divide-y divide-light-outline-variant border border-light-outline-variant rounded overflow-hidden max-h-[60vh] overflow-y-auto">
              {activeOrders.map((wo) => (
                <div key={wo.id} className="p-gutter-md flex items-center justify-between gap-gutter-sm bg-light-surface-container-lowest">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-title-sm text-light-primary dark:text-red-400 font-semibold">{wo.code}</span>
                      <span className={`px-2 py-0.5 rounded font-label text-label-sm ${getWorkOrderStatusStyle(wo.status)}`}>{wo.status}</span>
                    </div>
                    <span className="font-body text-body-sm text-light-on-surface-variant">{wo.clientName} · {wo.vehiclePlate} ({wo.diagnosis})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModalOpen(false);
                      onNavigate('folhas-obra');
                    }}
                    className="px-3 py-1.5 rounded border border-light-outline-variant hover:bg-light-surface-container font-label text-label-sm text-light-primary dark:text-red-400 whitespace-nowrap"
                  >
                    Abrir em FOs
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal 3: Alertas de Stock & Sugestão de Encomenda with PDF & XLSX export */}
      <Modal
        open={stockModalOpen}
        onClose={() => setStockModalOpen(false)}
        title="Alertas de Stock Crítico & Sugestão de Encomenda"
        subtitle={`Exibe ${criticalItems.length} peças abaixo do stock mínimo com quantidade sugerida de reposição`}
      >
        <div className="flex flex-col gap-gutter-md">
          {criticalItems.length === 0 ? (
            <div className="p-gutter-lg text-center font-body text-body-md text-success dark:text-emerald-400">
              Parabéns! Não existem peças abaixo do stock mínimo neste momento.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const headers = ['SKU', 'Designação', 'Fornecedor', 'Stock Atual', 'Stock Mínimo', 'Sugestão Encomenda'];
                    const rows = criticalItems.map((item) => {
                      const suggestedOrder = Math.max(item.minQuantity * 3 - item.quantity, item.minQuantity);
                      return [item.sku, item.name, item.supplierName, `${item.quantity} ${item.unit}`, `${item.minQuantity} ${item.unit}`, `+${suggestedOrder} ${item.unit}`];
                    });
                    await exportCustomTablePdf(
                      'Alertas de Stock Crítico & Sugestão de Encomenda',
                      `Total de peças críticas: ${criticalItems.length}`,
                      headers,
                      rows,
                      settings,
                      'zercauto-alertas-stock.pdf'
                    );
                    onNotify('Relatório PDF de stock crítico exportado.');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container font-label text-label-sm text-light-on-surface"
                >
                  <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Exportar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const headers = ['SKU', 'Designação', 'Fornecedor', 'Stock Atual', 'Stock Mínimo', 'Sugestão Encomenda'];
                    const rows = criticalItems.map((item) => {
                      const suggestedOrder = Math.max(item.minQuantity * 3 - item.quantity, item.minQuantity);
                      return [item.sku, item.name, item.supplierName, item.quantity, item.minQuantity, suggestedOrder];
                    });
                    downloadXlsxWorkbook('zercauto-alertas-stock.xlsx', [
                      {name: 'Stock Crítico', headers, rows},
                    ]);
                    onNotify('Relatório XLSX de stock crítico exportado.');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container font-label text-label-sm text-light-on-surface"
                >
                  <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Exportar XLSX</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyRestockList}
                  className="inline-flex items-center gap-1.5 px-gutter-md py-2 rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-sm"
                >
                  <span>Copiar Sugestão de Encomenda</span>
                </button>
              </div>

              <div className="divide-y divide-light-outline-variant border border-light-outline-variant rounded overflow-hidden max-h-[50vh] overflow-y-auto">
                {criticalItems.map((item) => {
                  const suggestedOrder = Math.max(
                    item.minQuantity * 3 - item.quantity,
                    item.minQuantity
                  );
                  return (
                    <div
                      key={item.id}
                      className="p-gutter-md flex flex-wrap items-center justify-between gap-gutter-sm bg-light-surface-container-lowest"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="font-label text-label-lg text-light-on-surface">
                          {item.name}
                        </span>
                        <span className="font-mono text-mono-sm text-light-on-surface-variant">
                          SKU: {item.sku} · Fornecedor: {item.supplierName}
                        </span>
                      </div>

                      <div className="flex items-center gap-gutter-md">
                        <div className="flex flex-col text-right">
                          <span className="font-mono text-mono-sm text-light-error dark:text-red-400 font-semibold tabular-nums">
                            Atual: {item.quantity} / Mín: {item.minQuantity} {item.unit}
                          </span>
                          <span className="font-mono text-mono-sm text-success dark:text-emerald-400 font-semibold tabular-nums">
                            Sugestão Encomenda: +{suggestedOrder} {item.unit}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setStockModalOpen(false);
                            onNavigate('stock-fornecedores');
                          }}
                          className="px-3 py-1.5 rounded border border-light-outline-variant hover:bg-light-surface-container font-label text-label-sm text-light-primary dark:text-red-400 whitespace-nowrap"
                        >
                          Gerir em Stock
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Modal 4: FOs Por Liquidar (Unpaid Work Orders) with PDF & XLSX export */}
      <Modal
        open={unpaidModalOpen}
        onClose={() => setUnpaidModalOpen(false)}
        title="Folhas de Obra Por Liquidar"
        subtitle={`Exibe ${unpaidOrders.length} folhas de obra com pagamento pendente ou parcial · Total: ${formatCurrency(unpaidTotal, currency)}`}
      >
        <div className="flex flex-col gap-gutter-md">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={async () => {
                const headers = ['Código FO', 'Cliente', 'Viatura', 'Estado Pagamento', `Total (${currency})`];
                const rows = unpaidOrders.map((wo) => [
                  wo.code,
                  wo.clientName,
                  `${wo.vehiclePlate} (${wo.vehicleLabel})`,
                  wo.paymentStatus,
                  formatCurrency(wo.total, currency),
                ]);
                await exportCustomTablePdf(
                  'Folhas de Obra Por Liquidar',
                  `Total Pendente: ${formatCurrency(unpaidTotal, currency)} (${unpaidOrders.length} folhas)`,
                  headers,
                  rows,
                  settings,
                  'zercauto-folhas-por-liquidar.pdf'
                );
                onNotify('Relatório PDF de folhas por liquidar exportado.');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container font-label text-label-sm text-light-on-surface"
            >
              <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Exportar PDF</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const headers = ['Código FO', 'Cliente', 'Viatura', 'Estado Pagamento', `Total (${currency})`];
                const rows = unpaidOrders.map((wo) => [
                  wo.code,
                  wo.clientName,
                  `${wo.vehiclePlate} (${wo.vehicleLabel})`,
                  wo.paymentStatus,
                  wo.total,
                ]);
                downloadXlsxWorkbook('zercauto-folhas-por-liquidar.xlsx', [
                  {name: 'Por Liquidar', headers, rows},
                ]);
                onNotify('Relatório XLSX de folhas por liquidar exportado.');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container font-label text-label-sm text-light-on-surface"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Exportar XLSX</span>
            </button>
          </div>

          {unpaidOrders.length === 0 ? (
            <div className="p-gutter-lg text-center font-body text-body-md text-success dark:text-emerald-400">
              Todas as folhas de obra emitidas encontram-se liquidadas!
            </div>
          ) : (
            <div className="divide-y divide-light-outline-variant border border-light-outline-variant rounded overflow-hidden max-h-[60vh] overflow-y-auto">
              {unpaidOrders.map((wo) => (
                <div
                  key={wo.id}
                  className="p-gutter-md flex flex-wrap items-center justify-between gap-gutter-sm bg-light-surface-container-lowest"
                >
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-gutter-sm flex-wrap">
                      <span className="font-mono text-title-sm text-light-primary dark:text-red-400 font-semibold">
                        {wo.code}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-warning-container text-on-warning-container font-label text-label-sm">
                        {wo.paymentStatus}
                      </span>
                    </div>
                    <span className="font-body text-body-sm text-light-on-surface-variant">
                      {wo.clientName} · {wo.vehiclePlate} ({wo.vehicleLabel})
                    </span>
                  </div>

                  <div className="flex items-center gap-gutter-md">
                    <span className="font-mono text-title-md text-light-on-surface tabular-nums font-semibold">
                      {formatCurrency(wo.total, currency)}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setUnpaidModalOpen(false);
                        onNavigate('pagamentos');
                      }}
                      className="px-3 py-1.5 rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-sm whitespace-nowrap"
                    >
                      Ir para Pagamentos
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal: Quick Nova Folha de Obra */}
      <Modal
        open={newOrderOpen}
        onClose={() => setNewOrderOpen(false)}
        title="Nova Folha de Obra"
        subtitle="Registo rápido a partir do painel principal"
      >
        <form onSubmit={handleCreateOrder} className="flex flex-col gap-gutter-md">
          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface">Cliente</span>
            <select
              value={newClientId}
              onChange={(e) => handleClientChange(e.target.value)}
              required
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (NIF: {c.nif})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface">Viatura</span>
            <select
              value={newVehicleId}
              onChange={(e) => {
                setNewVehicleId(e.target.value);
                const v = vehicles.find((item) => item.id === e.target.value);
                if (v) setNewMileage(String(v.mileage));
              }}
              required
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
            >
              {clientVehicles.length === 0 ? (
                <option value="">Sem viaturas associadas</option>
              ) : (
                clientVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} · {v.brand} {v.model} ({v.year})
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-sm">
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">
                Quilometragem (km)
              </span>
              <input
                type="number"
                min={0}
                value={newMileage}
                onChange={(e) => setNewMileage(e.target.value)}
                required
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>

            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Estado Inicial</span>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as WorkOrderStatus)}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
              >
                {STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface">
              Diagnóstico &amp; Descrição do Serviço
            </span>
            <textarea
              rows={3}
              required
              value={newDiagnosis}
              onChange={(e) => setNewDiagnosis(e.target.value)}
              placeholder="Descreva a avaria reportada pelo cliente ou serviço a executar..."
              className="w-full p-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
            />
          </label>

          <div className="flex items-center justify-end gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
            <button
              type="button"
              onClick={() => setNewOrderOpen(false)}
              className="px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-outline-variant font-label text-label-lg text-light-on-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!newVehicleId}
              className="px-gutter-md py-gutter-sm min-h-[40px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container disabled:opacity-50 font-label text-label-lg"
            >
              Criar Folha de Obra
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Quick Registar Peça */}
      <Modal
        open={newPartOpen}
        onClose={() => setNewPartOpen(false)}
        title="Registar Nova Peça"
        subtitle="Adiciona referência diretamente ao catálogo de stock offline-first"
      >
        <form onSubmit={handleSavePart} className="flex flex-col gap-gutter-md">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-sm">
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Código SKU</span>
              <input
                type="text"
                required
                value={pSku}
                onChange={(e) => setPSku(e.target.value)}
                placeholder="FLT-9010"
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md uppercase text-light-on-surface"
              />
            </label>
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Categoria</span>
              <input
                type="text"
                required
                value={pCategory}
                onChange={(e) => setPCategory(e.target.value)}
                placeholder="Filtros"
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
              />
            </label>
          </div>

          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface">Designação da Peça</span>
            <input
              type="text"
              required
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              placeholder="Ex.: Filtro de Gasóleo Bosch N204"
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-sm">
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Fornecedor</span>
              <select
                value={pSupplierId}
                onChange={(e) => setPSupplierId(e.target.value)}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Unidade</span>
              <input
                type="text"
                required
                value={pUnit}
                onChange={(e) => setPUnit(e.target.value)}
                placeholder="un / L / jg"
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-gutter-sm">
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-sm text-light-on-surface">Custo ({currency})</span>
              <input
                type="number"
                required
                min={0}
                value={pCost}
                onChange={(e) => setPCost(e.target.value)}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-sm text-light-on-surface">Venda ({currency})</span>
              <input
                type="number"
                required
                min={0}
                value={pSale}
                onChange={(e) => setPSale(e.target.value)}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-sm text-light-on-surface">Stock Inicial</span>
              <input
                type="number"
                required
                min={0}
                value={pQty}
                onChange={(e) => setPQty(e.target.value)}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-sm text-light-on-surface">Stock Mínimo</span>
              <input
                type="number"
                required
                min={1}
                value={pMinQty}
                onChange={(e) => setPMinQty(e.target.value)}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
            <button
              type="button"
              onClick={() => setNewPartOpen(false)}
              className="px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-outline-variant font-label text-label-lg text-light-on-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-gutter-md py-gutter-sm min-h-[40px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-lg"
            >
              Registar Peça
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
