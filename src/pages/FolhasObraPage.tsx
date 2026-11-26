import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPlus,
  Copy,
  FileDown,
  FileSpreadsheet,
  Link2,
  Plus,
  Search,
  TrendingUp,
  Wallet,
  Wrench,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import {
  newUuid,
  recordStockMovement,
  savePaymentRecord,
  saveWorkOrder,
} from '../db/dexie';
import type {
  Client,
  CurrencyCode,
  StockItem,
  Vehicle,
  WorkOrder,
  WorkOrderLabor,
  WorkOrderPart,
  WorkOrderStatus,
  WorkshopSettings,
  WorkshopUser,
} from '../types/database';
import {
  formatCurrency,
  formatNumberPT,
  formatTodayPT,
  getCurrentPeriodKey,
  getWorkOrderStatusStyle,
} from '../utils/formatters';
import {Modal} from '../components/ui/Modal';

interface FolhasObraPageProps {
  workOrders: WorkOrder[];
  clients: Client[];
  vehicles: Vehicle[];
  stockItems: StockItem[];
  users: WorkshopUser[];
  settings: WorkshopSettings;
  currency: CurrencyCode;
  onNotify: (msg: string) => void;
  onNavigateToStock: () => void;
}

const STATUS_OPTIONS: WorkOrderStatus[] = [
  'Aberta',
  'Em Diagnóstico',
  'Aguarda Peças',
  'Em Execução',
  'Concluída',
  'Pronta para Faturar',
  'Faturada',
];

type FilterTab = 'all' | 'Em Execução' | 'Aguarda Peças' | 'Pronta para Faturar' | 'Faturada';

function recalcOrder(order: WorkOrder): WorkOrder {
  const partsTotal = order.parts.reduce((acc, p) => acc + p.totalPrice, 0);
  const laborTotal = order.labor.reduce((acc, l) => acc + l.totalPrice, 0);
  const cmvTotal = order.parts.reduce((acc, p) => acc + p.unitCost * p.quantity, 0);
  const subtotal = partsTotal + laborTotal;
  const ivaAmount = Math.round(subtotal * (order.ivaRate / 100));
  return {
    ...order,
    subtotal,
    ivaAmount,
    total: subtotal + ivaAmount,
    cmvTotal,
  };
}

export function FolhasObraPage({
  workOrders,
  clients,
  vehicles,
  stockItems,
  users,
  settings,
  currency,
  onNotify,
  onNavigateToStock,
}: FolhasObraPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string>(workOrders[0]?.id ?? '');
  const [exportingPdf, setExportingPdf] = useState(false);

  const handleExportOrderPdf = async (order: WorkOrder) => {
    setExportingPdf(true);
    try {
      const {exportWorkOrderPdf} = await import('../utils/exporters');
      await exportWorkOrderPdf(order, settings, currency);
      onNotify(`PDF ${order.code}.pdf exportado com sucesso.`);
    } catch (err) {
      onNotify(
        `Erro ao gerar PDF: ${err instanceof Error ? err.message : 'tente novamente.'}`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportOrdersListXlsx = async () => {
    if (filteredOrders.length === 0) {
      onNotify('Sem folhas de obra para exportar neste filtro.');
      return;
    }
    const {exportWorkOrdersXlsx} = await import('../utils/exporters');
    exportWorkOrdersXlsx(filteredOrders, currency);
    onNotify(`${filteredOrders.length} folhas de obra exportadas para Excel (.xlsx).`);
  };

  // Modals
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [paymentModalOrder, setPaymentModalOrder] = useState<WorkOrder | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [restockItem, setRestockItem] = useState<StockItem | null>(null);

  // New Order Form state
  const [newClientId, setNewClientId] = useState(clients[0]?.id ?? '');
  const [newVehicleId, setNewVehicleId] = useState('');
  const [newMileage, setNewMileage] = useState('');
  const [newStatus, setNewStatus] = useState<WorkOrderStatus>('Em Diagnóstico');
  const [newDiagnosis, setNewDiagnosis] = useState('');

  // Add Part / Labor Form state
  const [itemMode, setItemMode] = useState<'part' | 'labor'>('part');
  const [selectedStockId, setSelectedStockId] = useState(stockItems[0]?.id ?? '');
  const [partQty, setPartQty] = useState('1');
  const [laborTech, setLaborTech] = useState(
    users.find((u) => u.role.includes('Mecânico'))?.name ?? users[0]?.name ?? 'Paulo Silva'
  );
  const [laborDesc, setLaborDesc] = useState('');
  const [laborHours, setLaborHours] = useState('1');
  const [laborRate, setLaborRate] = useState(String(settings.hourlyRate));

  // Restock Form state
  const [restockQty, setRestockQty] = useState('10');
  const [restockRef, setRestockRef] = useState('GUI-2026-094');

  const selectedOrder = useMemo(
    () => workOrders.find((w) => w.id === selectedOrderId) ?? workOrders[0] ?? null,
    [workOrders, selectedOrderId]
  );

  // Live KPIs
  const currentPeriod = getCurrentPeriodKey();
  const activeOrders = workOrders.filter((w) => w.status !== 'Faturada');
  const waitingPartsCount = workOrders.filter((w) => w.status === 'Aguarda Peças').length;
  const currentMonthOrders = workOrders.filter((w) => w.periodKey === currentPeriod);
  const monthlyRevenue = currentMonthOrders.reduce((acc, w) => acc + w.total, 0);
  const prevMonthRevenue = workOrders
    .filter((w) => w.periodKey === '2026-10')
    .reduce((acc, w) => acc + w.total, 0);
  const growthPct =
    prevMonthRevenue > 0
      ? (((monthlyRevenue - prevMonthRevenue) / prevMonthRevenue) * 100).toFixed(1)
      : '12,4';

  const unpaidOrders = workOrders.filter((w) => w.paymentStatus !== 'Liquidado');
  const unpaidTotal = unpaidOrders.reduce((acc, w) => acc + w.total, 0);
  const criticalStock = stockItems.filter((s) => s.quantity <= s.minQuantity);

  const tabCounts = useMemo(
    () => ({
      all: workOrders.length,
      'Em Execução': workOrders.filter((w) => w.status === 'Em Execução').length,
      'Aguarda Peças': workOrders.filter((w) => w.status === 'Aguarda Peças').length,
      'Pronta para Faturar': workOrders.filter((w) => w.status === 'Pronta para Faturar').length,
      Faturada: workOrders.filter((w) => w.status === 'Faturada').length,
    }),
    [workOrders]
  );

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workOrders.filter((wo) => {
      const matchesTab = activeTab === 'all' || wo.status === activeTab;
      if (!matchesTab) return false;
      if (!q) return true;
      return (
        wo.code.toLowerCase().includes(q) ||
        wo.clientName.toLowerCase().includes(q) ||
        wo.vehiclePlate.toLowerCase().includes(q) ||
        wo.vehicleLabel.toLowerCase().includes(q)
      );
    });
  }, [workOrders, activeTab, searchQuery]);

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
    if (!client || !vehicle || !newDiagnosis.trim()) return;

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
    setSelectedOrderId(newOrder.id);
    setNewOrderOpen(false);
    onNotify(`Folha de Obra ${code} criada e guardada localmente.`);
  };

  const handleStatusChange = async (order: WorkOrder, nextStatus: WorkOrderStatus) => {
    await saveWorkOrder({...order, status: nextStatus});
    onNotify(`${order.code} atualizada para "${nextStatus}".`);
  };

  const handleAddItemToOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    if (itemMode === 'part') {
      const stock = stockItems.find((s) => s.id === selectedStockId);
      const qty = Math.max(1, Number(partQty) || 1);
      if (!stock) return;

      const part: WorkOrderPart = {
        id: newUuid(),
        stockItemId: stock.id,
        sku: stock.sku,
        name: stock.name,
        quantity: qty,
        unit: stock.unit,
        unitCost: stock.costPrice,
        unitPrice: stock.salePrice,
        totalPrice: stock.salePrice * qty,
      };
      const updated = recalcOrder({
        ...selectedOrder,
        parts: [...selectedOrder.parts, part],
      });
      await saveWorkOrder(updated);
      await recordStockMovement(stock, 'saida', qty, selectedOrder.code);
      onNotify(`${stock.name} (${qty} ${stock.unit}) aplicada à ${selectedOrder.code}.`);
    } else {
      const hours = Math.max(0.5, Number(laborHours) || 1);
      const rate = Math.max(0, Number(laborRate) || settings.hourlyRate);
      const laborItem: WorkOrderLabor = {
        id: newUuid(),
        technicianName: laborTech,
        description: laborDesc.trim() || `Mão de Obra · ${laborTech}`,
        hours,
        hourlyRate: rate,
        totalPrice: Math.round(hours * rate),
      };
      const updated = recalcOrder({
        ...selectedOrder,
        labor: [...selectedOrder.labor, laborItem],
      });
      await saveWorkOrder(updated);
      onNotify(`Mão de obra (${hours}h) adicionada à ${selectedOrder.code}.`);
    }
    setAddItemOpen(false);
    setLaborDesc('');
  };

  const handleGeneratePaymentLink = async (order: WorkOrder) => {
    const slug = order.code.toLowerCase();
    const link = order.paymentLink ?? `https://pay.zercauto.ao/${slug}`;
    const updated: WorkOrder = {
      ...order,
      paymentLink: link,
      paymentMethod: order.paymentMethod ?? 'Pagamento Online (Link / Ref.)',
      paymentStatus: order.paymentStatus === 'Liquidado' ? 'Liquidado' : 'Link Online',
    };
    await saveWorkOrder(updated);
    setPaymentModalOrder(updated);
  };

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      onNotify('Link de pagamento copiado para a área de transferência.');
    } catch {
      onNotify('Link pronto: ' + link);
    }
  };

  const handleSimulateLiquidation = async (order: WorkOrder) => {
    const updated: WorkOrder = {
      ...order,
      status: 'Faturada',
      paymentStatus: 'Liquidado',
      paymentMethod: 'Pagamento Online (Link / Ref.)',
    };
    await saveWorkOrder(updated);
    await savePaymentRecord({
      id: newUuid(),
      workOrderId: order.id,
      workOrderCode: order.code,
      clientName: order.clientName,
      amount: order.total,
      method: 'Pagamento Online (Link / Ref.)',
      status: 'Liquidado',
      reference: `ONL-${order.code.slice(-4)}`,
      periodKey: order.periodKey,
      paidAt: formatTodayPT(),
      updatedAt: new Date().toISOString(),
    });
    setPaymentModalOrder(null);
    onNotify(`Pagamento da ${order.code} liquidado com sucesso.`);
  };

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockItem) return;
    const qty = Math.max(1, Number(restockQty) || 1);
    await recordStockMovement(
      restockItem,
      'entrada',
      qty,
      restockRef.trim() || `GUI-${Date.now().toString().slice(-4)}`
    );
    onNotify(`Stock de ${restockItem.name} reposto (+${qty} ${restockItem.unit}).`);
    setRestockItem(null);
  };

  return (
    <div className="flex flex-col gap-gutter-lg">
      {/* 4 Top KPI Summary Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter-md">
        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col justify-between gap-gutter-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-label text-label-lg text-light-on-surface-variant">
              Folhas de Obra Ativas
            </h2>
            <Wrench className="w-[18px] h-[18px] text-light-outline shrink-0" aria-hidden="true" />
          </header>
          <div className="flex flex-col gap-gutter-xs">
            <p className="font-display text-headline-lg text-light-on-surface tabular-nums whitespace-nowrap">
              {activeOrders.length}
            </p>
            <span className="font-body text-body-sm text-light-on-surface-variant">
              {waitingPartsCount} {waitingPartsCount === 1 ? 'aguarda peças' : 'aguardam peças'}
            </span>
          </div>
        </article>

        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col justify-between gap-gutter-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-label text-label-lg text-light-on-surface-variant">
              Faturação Mensal
            </h2>
            <TrendingUp className="w-[18px] h-[18px] text-success dark:text-emerald-400 shrink-0" aria-hidden="true" />
          </header>
          <div className="flex flex-col gap-gutter-xs">
            <p className="font-display text-headline-md lg:text-headline-lg text-light-on-surface tabular-nums whitespace-nowrap">
              {formatCurrency(monthlyRevenue, currency)}
            </p>
            <span className="font-body text-body-sm text-success dark:text-emerald-400">
              +{String(growthPct).replace('.', ',')}% vs mês anterior
            </span>
          </div>
        </article>

        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col justify-between gap-gutter-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-label text-label-lg text-light-on-surface-variant">
              Por Liquidar
            </h2>
            <Wallet className="w-[18px] h-[18px] text-warning shrink-0" aria-hidden="true" />
          </header>
          <div className="flex flex-col gap-gutter-xs">
            <p className="font-display text-headline-md lg:text-headline-lg text-light-on-surface tabular-nums whitespace-nowrap">
              {formatCurrency(unpaidTotal, currency)}
            </p>
            <span className="font-body text-body-sm text-light-on-surface-variant">
              {unpaidOrders.length} {unpaidOrders.length === 1 ? 'folha pendente' : 'folhas pendentes'}
            </span>
          </div>
        </article>

        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col justify-between gap-gutter-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-label text-label-lg text-light-on-surface-variant">
              Alertas de Stock
            </h2>
            <AlertTriangle
              className={`w-[18px] h-[18px] shrink-0 ${
                criticalStock.length > 0 ? 'text-light-error dark:text-red-400' : 'text-success dark:text-emerald-400'
              }`}
              aria-hidden="true"
            />
          </header>
          <div className="flex flex-col gap-gutter-xs">
            <p
              className={`font-display text-headline-lg tabular-nums whitespace-nowrap ${
                criticalStock.length > 0 ? 'text-light-error dark:text-red-400' : 'text-success dark:text-emerald-400'
              }`}
            >
              {criticalStock.length} {criticalStock.length === 1 ? 'peça' : 'peças'}
            </p>
            <span className="font-body text-body-sm text-light-on-surface-variant">
              Abaixo do stock mínimo
            </span>
          </div>
        </article>
      </section>

      {/* Split Workspace: Work Orders List (7 cols) + Live Inspector & Stock Alerts (5 cols) */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg items-start">
        {/* Left Pane: Work Orders Table & Filters */}
        <div className="xl:col-span-7 flex flex-col gap-gutter-md min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-gutter-sm no-print">
            <div className="relative flex-1 min-w-[220px]">
              <Search
                className="w-4 h-4 text-light-outline absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar matrícula, cliente ou FO..."
                className="w-full min-h-[42px] pl-9 pr-3 py-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface placeholder:text-light-outline focus:outline-none focus:border-light-primary focus:ring-1 focus:ring-light-primary"
              />
            </div>

            <div className="flex flex-wrap items-center gap-gutter-sm shrink-0">
              <button
                type="button"
                onClick={handleExportOrdersListXlsx}
                className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[42px] bg-light-surface-container-lowest text-light-on-surface rounded border border-light-outline-variant hover:bg-light-surface-container transition-colors duration-state-change font-label text-label-lg whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Exportar XLSX</span>
              </button>

              <button
                type="button"
                onClick={handleOpenNewOrder}
                className="inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm min-h-[42px] bg-light-primary text-light-on-primary rounded border border-light-primary hover:bg-light-primary-container transition-colors duration-state-change font-label text-label-lg whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Nova Folha de Obra</span>
              </button>
            </div>
          </div>

          {/* Status Filter Tabs */}
          <div
            role="tablist"
            aria-label="Filtrar folhas de obra por estado"
            className="flex items-center gap-gutter-xs border-b border-light-outline-variant overflow-x-auto no-print"
          >
            {(
              [
                {key: 'all', label: `Todas (${tabCounts.all})`},
                {key: 'Em Execução', label: `Em Execução (${tabCounts['Em Execução']})`},
                {key: 'Aguarda Peças', label: `Aguarda Peças (${tabCounts['Aguarda Peças']})`},
                {
                  key: 'Pronta para Faturar',
                  label: `Pronta para Faturar (${tabCounts['Pronta para Faturar']})`,
                },
                {key: 'Faturada', label: `Faturada (${tabCounts.Faturada})`},
              ] as Array<{key: FilterTab; label: string}>
            ).map((tab) => {
              const selected = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-gutter-md py-gutter-sm min-h-[40px] border-b-2 font-label text-label-lg whitespace-nowrap shrink-0 transition-colors duration-state-change ${
                    selected
                      ? 'border-light-primary dark:border-red-400 text-light-primary dark:text-red-400'
                      : 'border-transparent text-light-on-surface-variant hover:text-light-on-surface'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Work Orders Table */}
          <div className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg overflow-hidden">
            {filteredOrders.length === 0 ? (
              <div className="p-gutter-xl flex flex-col items-center justify-center text-center gap-gutter-sm">
                <ClipboardPlus className="w-8 h-8 text-light-outline" aria-hidden="true" />
                <p className="font-title text-title-md text-light-on-surface">
                  Nenhuma folha de obra encontrada
                </p>
                <p className="font-body text-body-sm text-light-on-surface-variant">
                  Ajuste os filtros ou crie uma nova Folha de Obra para iniciar a intervenção.
                </p>
                <button
                  type="button"
                  onClick={handleOpenNewOrder}
                  className="mt-gutter-xs px-gutter-md py-gutter-sm rounded bg-light-primary text-light-on-primary font-label text-label-lg whitespace-nowrap"
                >
                  Nova Folha de Obra
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-light-surface-container-low border-b border-light-outline-variant">
                    <tr>
                      <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase">
                        Folha
                      </th>
                      <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase">
                        Cliente &amp; Viatura
                      </th>
                      <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase">
                        Estado
                      </th>
                      <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase text-right">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-light-outline-variant">
                    {filteredOrders.map((wo) => {
                      const isSelected = selectedOrder?.id === wo.id;
                      return (
                        <tr
                          key={wo.id}
                          onClick={() => setSelectedOrderId(wo.id)}
                          aria-selected={isSelected}
                          className={`cursor-pointer transition-colors duration-state-change ${
                            isSelected
                              ? 'bg-light-surface-container-low'
                              : 'hover:bg-light-surface-container-low/60'
                          }`}
                        >
                          <td className="px-gutter-sm py-gutter-sm whitespace-nowrap">
                            <span
                              className={`font-mono text-mono-md ${
                                isSelected ? 'text-light-primary dark:text-red-400 font-semibold' : 'text-light-on-surface'
                              }`}
                            >
                              {wo.code}
                            </span>
                          </td>
                          <td className="px-gutter-sm py-gutter-sm">
                            <div className="flex flex-col">
                              <span className="font-label text-label-lg text-light-on-surface">
                                {wo.clientName}
                              </span>
                              <span className="font-mono text-mono-sm text-light-on-surface-variant">
                                {wo.vehiclePlate} · {wo.vehicleLabel}
                              </span>
                            </div>
                          </td>
                          <td className="px-gutter-sm py-gutter-sm whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-gutter-sm py-gutter-xs rounded font-label text-label-sm whitespace-nowrap ${getWorkOrderStatusStyle(
                                wo.status
                              )}`}
                            >
                              {wo.status}
                            </span>
                          </td>
                          <td className="px-gutter-sm py-gutter-sm text-right whitespace-nowrap">
                            <span className="font-mono text-mono-md text-light-on-surface tabular-nums">
                              {formatCurrency(wo.total, currency)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Live Inspector + Low Stock Alerts */}
        <div className="xl:col-span-5 flex flex-col gap-gutter-md min-w-0">
          {selectedOrder && (
            <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg overflow-hidden flex flex-col">
              {/* Inspector Header */}
              <header className="px-gutter-md py-gutter-sm bg-light-surface-container-low border-b border-light-outline-variant flex flex-wrap items-center justify-between gap-gutter-sm">
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-gutter-sm flex-wrap">
                    <span className="font-mono text-title-md text-light-primary dark:text-red-400 font-semibold">
                      {selectedOrder.code}
                    </span>
                    <span
                      className={`px-gutter-sm py-0.5 rounded font-label text-label-sm whitespace-nowrap ${getWorkOrderStatusStyle(
                        selectedOrder.status
                      )}`}
                    >
                      {selectedOrder.status}
                    </span>
                  </div>
                  <span className="font-body text-body-sm text-light-on-surface-variant">
                    {selectedOrder.clientName} · {selectedOrder.vehiclePlate} ·{' '}
                    {selectedOrder.vehicleLabel} ({formatNumberPT(selectedOrder.mileage)} km)
                  </span>
                </div>

                <select
                  aria-label="Alterar estado da folha de obra"
                  value={selectedOrder.status}
                  onChange={(e) =>
                    handleStatusChange(selectedOrder, e.target.value as WorkOrderStatus)
                  }
                  className="no-print min-h-[36px] px-gutter-sm py-1 bg-light-surface-container-lowest border border-light-outline-variant rounded font-label text-label-sm text-light-on-surface focus:outline-none focus:border-light-primary"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </header>

              {/* Diagnosis & Service */}
              <div className="p-gutter-md flex flex-col gap-gutter-md">
                <div className="flex flex-col gap-gutter-xs">
                  <h3 className="font-label text-label-sm uppercase text-light-on-surface-variant">
                    Diagnóstico &amp; Serviço
                  </h3>
                  <p className="font-body text-body-md text-light-on-surface">
                    {selectedOrder.diagnosis}
                  </p>
                </div>

                {/* Parts & Labor Breakdown */}
                <div className="flex flex-col gap-gutter-sm border-t border-light-outline-variant pt-gutter-sm">
                  <div className="flex items-center justify-between gap-gutter-sm">
                    <h3 className="font-label text-label-sm uppercase text-light-on-surface-variant">
                      Peças Aplicadas &amp; Mão de Obra
                    </h3>
                    <div className="flex items-center gap-gutter-sm">
                      <span className="font-mono text-mono-sm text-light-on-surface-variant">
                        IVA {selectedOrder.ivaRate}%
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setItemMode('part');
                          setSelectedStockId(stockItems[0]?.id ?? '');
                          setPartQty('1');
                          setLaborRate(String(settings.hourlyRate));
                          setAddItemOpen(true);
                        }}
                        className="no-print inline-flex items-center gap-1 px-2 py-1 rounded border border-light-outline-variant hover:bg-light-surface-container font-label text-label-sm text-light-primary dark:text-red-400 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Adicionar</span>
                      </button>
                    </div>
                  </div>

                  {selectedOrder.parts.length === 0 && selectedOrder.labor.length === 0 ? (
                    <p className="font-body text-body-sm text-light-on-surface-variant py-gutter-sm">
                      Sem peças ou mão de obra registadas nesta folha de obra.
                    </p>
                  ) : (
                    <div className="divide-y divide-light-outline-variant border border-light-outline-variant rounded">
                      {selectedOrder.parts.map((part) => {
                        const stockMatch = stockItems.find((s) => s.id === part.stockItemId);
                        return (
                          <div
                            key={part.id}
                            className="px-gutter-sm py-gutter-xs flex items-center justify-between gap-gutter-sm"
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="font-label text-label-lg text-light-on-surface truncate">
                                {part.name} ({part.quantity} {part.unit})
                              </span>
                              <span className="font-mono text-mono-sm text-light-on-surface-variant">
                                SKU: {part.sku}
                                {stockMatch ? ` · Stock: ${stockMatch.quantity} ${stockMatch.unit}` : ''}
                              </span>
                            </div>
                            <span className="font-mono text-mono-md text-light-on-surface tabular-nums whitespace-nowrap">
                              {formatCurrency(part.totalPrice, currency)}
                            </span>
                          </div>
                        );
                      })}
                      {selectedOrder.labor.map((lab) => (
                        <div
                          key={lab.id}
                          className="px-gutter-sm py-gutter-xs flex items-center justify-between gap-gutter-sm"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="font-label text-label-lg text-light-on-surface truncate">
                              {lab.description}
                            </span>
                            <span className="font-mono text-mono-sm text-light-on-surface-variant tabular-nums">
                              {formatNumberPT(lab.hours, 1)}h ×{' '}
                              {formatCurrency(lab.hourlyRate, currency)}/h · {lab.technicianName}
                            </span>
                          </div>
                          <span className="font-mono text-mono-md text-light-on-surface tabular-nums whitespace-nowrap">
                            {formatCurrency(lab.totalPrice, currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Subtotal + IVA + Total */}
                  <div className="flex flex-col gap-1 pt-gutter-xs">
                    <div className="flex items-center justify-between text-body-sm text-light-on-surface-variant">
                      <span>Subtotal</span>
                      <span className="font-mono tabular-nums">
                        {formatCurrency(selectedOrder.subtotal, currency, {decimals: 2})}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-body-sm text-light-on-surface-variant">
                      <span>IVA ({selectedOrder.ivaRate}%)</span>
                      <span className="font-mono tabular-nums">
                        {formatCurrency(selectedOrder.ivaAmount, currency, {decimals: 2})}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-gutter-xs border-t border-light-outline-variant">
                      <span className="font-headline text-title-md text-light-on-surface">
                        Total c/ IVA
                      </span>
                      <span className="font-display text-headline-md text-light-primary dark:text-red-400 tabular-nums whitespace-nowrap">
                        {formatCurrency(selectedOrder.total, currency, {decimals: 2})}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Footer */}
                <div className="pt-gutter-sm border-t border-light-outline-variant flex flex-wrap items-center justify-between gap-gutter-sm no-print">
                  <div className="flex flex-wrap items-center gap-gutter-sm">
                    <button
                      type="button"
                      disabled={exportingPdf}
                      onClick={() => handleExportOrderPdf(selectedOrder)}
                      className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container disabled:opacity-60 font-label text-label-lg text-light-on-surface whitespace-nowrap"
                    >
                      <FileDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{exportingPdf ? 'A gerar PDF...' : 'Exportar PDF'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const {exportWorkOrdersXlsx} = await import('../utils/exporters');
                        exportWorkOrdersXlsx(
                          [selectedOrder],
                          currency,
                          `${selectedOrder.code}.xlsx`
                        );
                        onNotify(`Folha ${selectedOrder.code}.xlsx exportada.`);
                      }}
                      className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container font-label text-label-lg text-light-on-surface whitespace-nowrap"
                    >
                      <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>XLSX</span>
                    </button>
                  </div>

                  {selectedOrder.paymentStatus === 'Liquidado' ? (
                    <span className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-success-container text-on-success-container font-label text-label-lg whitespace-nowrap">
                      <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>Liquidado</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleGeneratePaymentLink(selectedOrder)}
                      className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-lg whitespace-nowrap"
                    >
                      <Link2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>Gerar Link de Pagamento</span>
                    </button>
                  )}
                </div>
              </div>
            </article>
          )}

          {/* Low Stock Alerts Panel */}
          <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg overflow-hidden no-print">
            <header className="px-gutter-md py-gutter-sm bg-light-surface-container-low border-b border-light-outline-variant flex items-center justify-between gap-gutter-sm">
              <div className="flex items-center gap-gutter-sm">
                <AlertTriangle className="w-4 h-4 text-light-error dark:text-red-400 shrink-0" aria-hidden="true" />
                <h3 className="font-headline text-title-md text-light-on-surface">
                  Alertas de Stock Baixo
                </h3>
              </div>
              <button
                type="button"
                onClick={onNavigateToStock}
                className="font-label text-label-sm text-light-primary dark:text-red-400 hover:underline whitespace-nowrap"
              >
                {criticalStock.length} Críticos · Ver Stock
              </button>
            </header>

            {criticalStock.length === 0 ? (
              <div className="p-gutter-md font-body text-body-sm text-light-on-surface-variant">
                Todas as referências estão acima do stock mínimo.
              </div>
            ) : (
              <div className="divide-y divide-light-outline-variant">
                {criticalStock.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="px-gutter-md py-gutter-sm flex items-center justify-between gap-gutter-sm"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-label text-label-lg text-light-on-surface truncate">
                        {item.name}
                      </span>
                      <span className="font-mono text-mono-sm text-light-error dark:text-red-400 tabular-nums">
                        Atual: {item.quantity} {item.unit} · Mín: {item.minQuantity} {item.unit}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setRestockItem(item);
                        setRestockQty(String(Math.max(item.minQuantity * 2, 5)));
                      }}
                      className="px-gutter-sm py-1.5 min-h-[34px] rounded border border-light-outline-variant hover:border-light-primary dark:hover:border-red-400 hover:text-light-primary dark:hover:text-red-400 font-label text-label-sm text-light-on-surface whitespace-nowrap shrink-0"
                    >
                      Repor
                    </button>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      </section>

      {/* Modal: Nova Folha de Obra */}
      <Modal
        open={newOrderOpen}
        onClose={() => setNewOrderOpen(false)}
        title="Nova Folha de Obra"
        subtitle="Registo offline imediato no IndexedDB e fila de sincronização"
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
              placeholder="Ex.: Revisão periódica dos 100.000 km, substituição de filtros e pastilhas..."
              className="w-full p-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
            />
          </label>

          <div className="flex items-center justify-end gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
            <button
              type="button"
              onClick={() => setNewOrderOpen(false)}
              className="px-gutter-md py-gutter-sm rounded border border-light-outline-variant font-label text-label-lg text-light-on-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!newVehicleId}
              className="px-gutter-md py-gutter-sm rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container disabled:opacity-50 font-label text-label-lg"
            >
              Criar Folha de Obra
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Adicionar Peça ou Mão de Obra */}
      <Modal
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        title={`Adicionar à ${selectedOrder?.code ?? ''}`}
        subtitle="Atualiza automaticamente os totais, IVA e stock local"
      >
        <form onSubmit={handleAddItemToOrder} className="flex flex-col gap-gutter-md">
          <div className="grid grid-cols-2 gap-gutter-sm">
            <button
              type="button"
              onClick={() => setItemMode('part')}
              className={`py-gutter-sm rounded border font-label text-label-lg ${
                itemMode === 'part'
                  ? 'bg-light-primary text-light-on-primary border-light-primary'
                  : 'bg-light-surface-container-low text-light-on-surface border-light-outline-variant'
              }`}
            >
              Peça de Stock
            </button>
            <button
              type="button"
              onClick={() => setItemMode('labor')}
              className={`py-gutter-sm rounded border font-label text-label-lg ${
                itemMode === 'labor'
                  ? 'bg-light-primary text-light-on-primary border-light-primary'
                  : 'bg-light-surface-container-low text-light-on-surface border-light-outline-variant'
              }`}
            >
              Mão de Obra (M.O.)
            </button>
          </div>

          {itemMode === 'part' ? (
            <>
              <label className="flex flex-col gap-gutter-xs">
                <span className="font-label text-label-lg text-light-on-surface">
                  Peça / Referência
                </span>
                <select
                  value={selectedStockId}
                  onChange={(e) => setSelectedStockId(e.target.value)}
                  className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
                >
                  {stockItems.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sku} · {s.name} ({formatCurrency(s.salePrice, currency)} / Stock:{' '}
                      {s.quantity} {s.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-gutter-xs">
                <span className="font-label text-label-lg text-light-on-surface">Quantidade</span>
                <input
                  type="number"
                  min={1}
                  step="1"
                  value={partQty}
                  onChange={(e) => setPartQty(e.target.value)}
                  required
                  className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
                />
              </label>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-gutter-xs">
                <span className="font-label text-label-lg text-light-on-surface">Técnico</span>
                <select
                  value={laborTech}
                  onChange={(e) => setLaborTech(e.target.value)}
                  className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-gutter-xs">
                <span className="font-label text-label-lg text-light-on-surface">
                  Descrição da Intervenção
                </span>
                <input
                  type="text"
                  value={laborDesc}
                  onChange={(e) => setLaborDesc(e.target.value)}
                  placeholder="Ex.: Mão de Obra · Alinhamento e diagnóstico"
                  className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
                />
              </label>
              <div className="grid grid-cols-2 gap-gutter-sm">
                <label className="flex flex-col gap-gutter-xs">
                  <span className="font-label text-label-lg text-light-on-surface">Horas</span>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={laborHours}
                    onChange={(e) => setLaborHours(e.target.value)}
                    required
                    className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
                  />
                </label>
                <label className="flex flex-col gap-gutter-xs">
                  <span className="font-label text-label-lg text-light-on-surface">
                    Taxa Horária (AOA)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={laborRate}
                    onChange={(e) => setLaborRate(e.target.value)}
                    required
                    className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
                  />
                </label>
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
            <button
              type="button"
              onClick={() => setAddItemOpen(false)}
              className="px-gutter-md py-gutter-sm rounded border border-light-outline-variant font-label text-label-lg text-light-on-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-gutter-md py-gutter-sm rounded bg-light-primary text-light-on-primary font-label text-label-lg"
            >
              Aplicar na Folha
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Link de Pagamento Online */}
      <Modal
        open={Boolean(paymentModalOrder)}
        onClose={() => setPaymentModalOrder(null)}
        title="Link de Pagamento Online"
        subtitle={
          paymentModalOrder
            ? `Referência gerada para ${paymentModalOrder.code}`
            : undefined
        }
      >
        {paymentModalOrder && (
          <div className="flex flex-col gap-gutter-md">
            <p className="font-body text-body-md text-light-on-surface">
              Referência gerada para liquidação online da folha{' '}
              <span className="font-mono font-semibold text-light-primary dark:text-red-400">
                {paymentModalOrder.code}
              </span>{' '}
              no valor de{' '}
              <span className="font-mono font-semibold tabular-nums">
                {formatCurrency(paymentModalOrder.total, currency, {decimals: 2})}
              </span>
              .
            </p>
            <div className="p-gutter-sm bg-light-surface-container-low border border-light-outline-variant rounded flex items-center justify-between gap-gutter-sm">
              <span className="font-mono text-mono-md text-light-on-surface truncate">
                {paymentModalOrder.paymentLink}
              </span>
              <button
                type="button"
                onClick={() => handleCopyLink(paymentModalOrder.paymentLink ?? '')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container font-label text-label-sm text-light-on-surface shrink-0"
              >
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copiar</span>
              </button>
            </div>
            <div className="flex items-center justify-between pt-gutter-sm border-t border-light-outline-variant gap-gutter-sm">
              <button
                type="button"
                onClick={() => setPaymentModalOrder(null)}
                className="px-gutter-md py-gutter-sm rounded border border-light-outline-variant font-label text-label-lg text-light-on-surface"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => handleSimulateLiquidation(paymentModalOrder)}
                className="px-gutter-md py-gutter-sm rounded bg-success text-on-success hover:opacity-90 font-label text-label-lg"
              >
                Simular Liquidação
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Reposição Rápida de Stock */}
      <Modal
        open={Boolean(restockItem)}
        onClose={() => setRestockItem(null)}
        title="Repor Stock de Peça"
        subtitle={restockItem ? `${restockItem.sku} · ${restockItem.name}` : undefined}
      >
        {restockItem && (
          <form onSubmit={handleRestockSubmit} className="flex flex-col gap-gutter-md">
            <div className="p-gutter-sm bg-light-surface-container-low border border-light-outline-variant rounded flex items-center justify-between">
              <span className="font-body text-body-sm text-light-on-surface-variant">
                Stock atual / mínimo
              </span>
              <span className="font-mono text-mono-md text-light-error dark:text-red-400 tabular-nums">
                {restockItem.quantity} / {restockItem.minQuantity} {restockItem.unit}
              </span>
            </div>
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">
                Quantidade a Entrar ({restockItem.unit})
              </span>
              <input
                type="number"
                min={1}
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                required
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">
                Guia / Referência de Fornecedor
              </span>
              <input
                type="text"
                value={restockRef}
                onChange={(e) => setRestockRef(e.target.value)}
                required
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>
            <div className="flex justify-end gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
              <button
                type="button"
                onClick={() => setRestockItem(null)}
                className="px-gutter-md py-gutter-sm rounded border border-light-outline-variant font-label text-label-lg text-light-on-surface"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-gutter-md py-gutter-sm rounded bg-light-primary text-light-on-primary font-label text-label-lg"
              >
                Confirmar Entrada
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
