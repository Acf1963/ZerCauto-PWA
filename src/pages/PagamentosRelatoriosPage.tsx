import {
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  FileDown,
  FileSpreadsheet,
  Link2,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import {newUuid, savePaymentRecord, saveWorkOrder} from '../db/dexie';
import type {
  CurrencyCode,
  PaymentMethod,
  PaymentRecord,
  WorkOrder,
  WorkshopSettings,
} from '../types/database';
import {
  downloadCSV,
  formatCurrency,
  formatPeriodLabel,
  formatTodayPT,
  getPaymentStatusStyle,
} from '../utils/formatters';
import {Modal} from '../components/ui/Modal';

interface PagamentosRelatoriosPageProps {
  workOrders: WorkOrder[];
  paymentRecords: PaymentRecord[];
  settings: WorkshopSettings;
  currency: CurrencyCode;
  mode: 'payments' | 'reports';
  onNotify: (msg: string) => void;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  'TPA / Multicaixa',
  'Transferência Bancária',
  'Numerário',
];

export function PagamentosRelatoriosPage({
  workOrders,
  paymentRecords,
  settings,
  currency,
  mode,
  onNotify,
}: PagamentosRelatoriosPageProps) {
  const availablePeriods = useMemo(() => {
    const keys = Array.from(new Set(workOrders.map((w) => w.periodKey))).sort((a, b) =>
      b.localeCompare(a)
    );
    return keys.length > 0 ? keys : ['2026-11'];
  }, [workOrders]);

  const [selectedPeriod, setSelectedPeriod] = useState<string>(availablePeriods[0] ?? '2026-11');
  const [selectedOnlineOrderId, setSelectedOnlineOrderId] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    'TPA / Multicaixa'
  );
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Register Payment Modal state
  const [payOrderId, setPayOrderId] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('TPA / Multicaixa');
  const [payReference, setPayReference] = useState('');

  const periodOrders = useMemo(
    () =>
      selectedPeriod === 'all'
        ? workOrders
        : workOrders.filter((w) => w.periodKey === selectedPeriod),
    [workOrders, selectedPeriod]
  );

  const filteredPeriodPayments = useMemo(
    () =>
      selectedPeriod === 'all'
        ? paymentRecords
        : paymentRecords.filter((p) => p.periodKey === selectedPeriod),
    [paymentRecords, selectedPeriod]
  );

  // Dynamic Financial KPIs from IndexedDB records
  const financials = useMemo(() => {
    let totalInvoiced = 0;
    let totalParts = 0;
    let totalLabor = 0;
    let totalReceived = 0;
    let totalDebt = 0;
    let pendingCount = 0;
    let totalCMV = 0;

    for (const wo of periodOrders) {
      const woParts = wo.parts.reduce((a, p) => a + p.totalPrice, 0);
      const woLabor = wo.labor.reduce((a, l) => a + l.totalPrice, 0);
      totalInvoiced += wo.total;
      totalParts += woParts;
      totalLabor += woLabor;
      totalCMV += wo.cmvTotal;

      if (wo.paymentStatus === 'Liquidado') {
        totalReceived += wo.total;
      } else {
        totalDebt += wo.total;
        pendingCount++;
      }
    }

    const grossMargin = totalInvoiced - totalCMV;
    const collectionRate =
      totalInvoiced > 0 ? ((totalReceived / totalInvoiced) * 100).toFixed(1) : '0,0';

    return {
      totalInvoiced,
      totalParts,
      totalLabor,
      totalReceived,
      totalDebt,
      pendingCount,
      totalCMV,
      grossMargin,
      collectionRate: collectionRate.replace('.', ','),
    };
  }, [periodOrders]);

  const unpaidOrders = useMemo(
    () => workOrders.filter((w) => w.paymentStatus !== 'Liquidado'),
    [workOrders]
  );

  const onlineTargetOrder = useMemo(
    () =>
      unpaidOrders.find((w) => w.id === selectedOnlineOrderId) ?? unpaidOrders[0] ?? workOrders[0],
    [unpaidOrders, selectedOnlineOrderId, workOrders]
  );

  const generatedLink = onlineTargetOrder
    ? onlineTargetOrder.paymentLink ??
      `https://pay.zercauto.ao/${onlineTargetOrder.code.toLowerCase()}`
    : '';

  const handleExportCSV = () => {
    const headers = [
      'Folha de Obra',
      'Data',
      'Cliente',
      'Matrícula',
      'Peças (AOA)',
      'Mão de Obra (AOA)',
      'IVA (AOA)',
      'Total (AOA)',
      'CMV Peças (AOA)',
      'Estado Pagamento',
      'Método',
    ];
    const rows = periodOrders.map((wo) => [
      wo.code,
      wo.openedAt,
      wo.clientName,
      wo.vehiclePlate,
      wo.parts.reduce((a, p) => a + p.totalPrice, 0),
      wo.labor.reduce((a, l) => a + l.totalPrice, 0),
      wo.ivaAmount,
      wo.total,
      wo.cmvTotal,
      wo.paymentStatus,
      wo.paymentMethod ?? '-',
    ]);
    downloadCSV(`zercauto-relatorio-${selectedPeriod}.csv`, headers, rows);
    onNotify(`Relatório CSV (${formatPeriodLabel(selectedPeriod)}) exportado.`);
  };

  const handleExportXLSX = async () => {
    const label =
      selectedPeriod === 'all' ? 'Todos os Períodos' : formatPeriodLabel(selectedPeriod);
    const {exportFinancialReportXlsx} = await import('../utils/exporters');
    exportFinancialReportXlsx(
      selectedPeriod,
      label,
      periodOrders,
      filteredPeriodPayments,
      currency
    );
    onNotify(`Relatório Excel (.xlsx) (${label}) exportado.`);
  };

  const handleExportPDF = async () => {
    const label =
      selectedPeriod === 'all' ? 'Todos os Períodos' : formatPeriodLabel(selectedPeriod);
    setExportingPdf(true);
    try {
      const {exportFinancialReportPdf} = await import('../utils/exporters');
      await exportFinancialReportPdf(
        selectedPeriod,
        label,
        periodOrders,
        filteredPeriodPayments,
        settings,
        currency
      );
      onNotify(`Relatório PDF (${label}) gerado com sucesso.`);
    } catch (err) {
      onNotify(
        `Erro ao gerar PDF: ${err instanceof Error ? err.message : 'tente novamente.'}`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const handleGenerateAndCopyLink = async () => {
    if (!onlineTargetOrder) return;
    const link = `https://pay.zercauto.ao/${onlineTargetOrder.code.toLowerCase()}`;
    await saveWorkOrder({
      ...onlineTargetOrder,
      paymentLink: link,
      paymentMethod: selectedMethod,
      paymentStatus:
        onlineTargetOrder.paymentStatus === 'Liquidado' ? 'Liquidado' : 'Parcial',
    });
    try {
      await navigator.clipboard.writeText(link);
      onNotify(`Link ${link} gerado e copiado.`);
    } catch {
      onNotify(`Link ${link} guardado na folha ${onlineTargetOrder.code}.`);
    }
  };

  const handleOpenRegisterPayment = () => {
    const firstPending = unpaidOrders[0] ?? workOrders[0];
    setPayOrderId(firstPending?.id ?? '');
    setPayMethod('TPA / Multicaixa');
    setPayReference(`REC-${Date.now().toString().slice(-5)}`);
    setRegisterModalOpen(true);
  };

  const handleRegisterPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const wo = workOrders.find((w) => w.id === payOrderId);
    if (!wo) return;

    await saveWorkOrder({
      ...wo,
      status: 'Faturada',
      paymentStatus: 'Liquidado',
      paymentMethod: payMethod,
    });
    await savePaymentRecord({
      id: newUuid(),
      workOrderId: wo.id,
      workOrderCode: wo.code,
      clientName: wo.clientName,
      amount: wo.total,
      method: payMethod,
      status: 'Liquidado',
      reference: payReference.trim() || `PAG-${wo.code.slice(-4)}`,
      periodKey: wo.periodKey,
      paidAt: formatTodayPT(),
      updatedAt: new Date().toISOString(),
    });
    setRegisterModalOpen(false);
    onNotify(`Pagamento de ${wo.code} liquidado via ${payMethod}.`);
  };

  return (
    <div className="flex flex-col gap-gutter-lg">
      {/* Period Selector & Actions Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-gutter-sm no-print">
        <div className="flex items-center gap-gutter-sm">
          <label htmlFor="period-select" className="font-label text-label-lg text-light-on-surface">
            Período:
          </label>
          <select
            id="period-select"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="min-h-[40px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-label text-label-lg text-light-on-surface"
          >
            {availablePeriods.map((pk) => (
              <option key={pk} value={pk}>
                {formatPeriodLabel(pk)}
              </option>
            ))}
            <option value="all">Todos os Períodos</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-gutter-sm">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container font-label text-label-lg text-light-on-surface whitespace-nowrap"
          >
            <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportXLSX}
            className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container font-label text-label-lg text-light-on-surface whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Exportar XLSX</span>
          </button>
          <button
            type="button"
            disabled={exportingPdf}
            onClick={handleExportPDF}
            className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container disabled:opacity-60 font-label text-label-lg text-light-on-surface whitespace-nowrap"
          >
            <FileDown className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{exportingPdf ? 'A gerar PDF...' : 'Exportar PDF'}</span>
          </button>
          <button
            type="button"
            onClick={handleOpenRegisterPayment}
            className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-lg whitespace-nowrap"
          >
            <CreditCard className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Registar Pagamento</span>
          </button>
        </div>
      </div>

      {/* 4 Financial KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter-md">
        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-xs">
          <span className="font-label text-label-lg text-light-on-surface-variant">
            Total Faturado
          </span>
          <p className="font-display text-headline-md lg:text-headline-lg text-light-on-surface tabular-nums">
            {formatCurrency(financials.totalInvoiced, currency)}
          </p>
          <span className="font-body text-body-sm text-light-on-surface-variant tabular-nums">
            Peças: {formatCurrency(financials.totalParts, currency, {compact: true})} · M.O.:{' '}
            {formatCurrency(financials.totalLabor, currency, {compact: true})}
          </span>
        </article>

        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-xs">
          <span className="font-label text-label-lg text-light-on-surface-variant">
            Total Recebido
          </span>
          <p className="font-display text-headline-md lg:text-headline-lg text-success dark:text-emerald-400 tabular-nums">
            {formatCurrency(financials.totalReceived, currency)}
          </p>
          <span className="font-body text-body-sm text-success dark:text-emerald-400 tabular-nums">
            {financials.collectionRate}% cobrado
          </span>
        </article>

        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-xs">
          <span className="font-label text-label-lg text-light-on-surface-variant">Em Dívida</span>
          <p className="font-display text-headline-md lg:text-headline-lg text-light-error dark:text-red-400 tabular-nums">
            {formatCurrency(financials.totalDebt, currency)}
          </p>
          <span className="font-body text-body-sm text-light-on-surface-variant tabular-nums">
            {financials.pendingCount}{' '}
            {financials.pendingCount === 1 ? 'folha pendente' : 'folhas pendentes'}
          </span>
        </article>

        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-xs">
          <span className="font-label text-label-lg text-light-on-surface-variant">
            Margem Bruta Est.
          </span>
          <p className="font-display text-headline-md lg:text-headline-lg text-light-on-surface tabular-nums">
            {formatCurrency(financials.grossMargin, currency)}
          </p>
          <span className="font-body text-body-sm text-light-on-surface-variant tabular-nums">
            CMV Peças: {formatCurrency(financials.totalCMV, currency)}
          </span>
        </article>
      </section>

      {/* Breakdown Table + Online Payments Panel */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg items-start">
        <div
          className={`${
            mode === 'reports' ? 'xl:col-span-8' : 'xl:col-span-7'
          } bg-light-surface-container-lowest border border-light-outline-variant rounded-lg overflow-hidden min-w-0`}
        >
          <header className="px-gutter-md py-gutter-sm bg-light-surface-container-low border-b border-light-outline-variant flex items-center justify-between gap-gutter-sm">
            <h2 className="font-headline text-title-md text-light-on-surface">
              Detalhe Financeiro por Folha de Obra
            </h2>
            <span className="font-mono text-mono-sm text-light-on-surface-variant">
              {selectedPeriod === 'all' ? 'Histórico Completo' : formatPeriodLabel(selectedPeriod)}
            </span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-light-surface-container-low border-b border-light-outline-variant">
                <tr>
                  <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase">
                    Folha / Cliente
                  </th>
                  <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase text-right">
                    Peças
                  </th>
                  <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase text-right">
                    M. Obra
                  </th>
                  <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase text-right">
                    Total
                  </th>
                  <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase">
                    Pagamento
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light-outline-variant">
                {periodOrders.map((wo) => {
                  const partsSum = wo.parts.reduce((a, p) => a + p.totalPrice, 0);
                  const laborSum = wo.labor.reduce((a, l) => a + l.totalPrice, 0);
                  return (
                    <tr
                      key={wo.id}
                      className="hover:bg-light-surface-container-low/60 transition-colors duration-state-change"
                    >
                      <td className="px-gutter-sm py-gutter-sm">
                        <div className="flex flex-col">
                          <span className="font-mono text-mono-md text-light-primary dark:text-red-400 font-semibold">
                            {wo.code}
                          </span>
                          <span className="font-label text-label-sm text-light-on-surface">
                            {wo.clientName}
                          </span>
                        </div>
                      </td>
                      <td className="px-gutter-sm py-gutter-sm text-right font-mono text-mono-sm text-light-on-surface tabular-nums whitespace-nowrap">
                        {formatCurrency(partsSum, currency)}
                      </td>
                      <td className="px-gutter-sm py-gutter-sm text-right font-mono text-mono-sm text-light-on-surface tabular-nums whitespace-nowrap">
                        {formatCurrency(laborSum, currency)}
                      </td>
                      <td className="px-gutter-sm py-gutter-sm text-right font-mono text-mono-md font-semibold text-light-on-surface tabular-nums whitespace-nowrap">
                        {formatCurrency(wo.total, currency)}
                      </td>
                      <td className="px-gutter-sm py-gutter-sm whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-gutter-sm py-0.5 rounded font-label text-label-sm ${getPaymentStatusStyle(
                            wo.paymentStatus
                          )}`}
                        >
                          {wo.paymentStatus === 'Liquidado' && wo.paymentMethod
                            ? `Liquidado · ${
                                wo.paymentMethod.includes('TPA')
                                  ? 'TPA'
                                  : wo.paymentMethod.includes('Transf')
                                    ? 'Transf.'
                                    : wo.paymentMethod.includes('Online')
                                      ? 'Online'
                                      : 'Numerário'
                              }`
                            : wo.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Pagamentos Online & Recibos Recentes */}
        <div
          className={`${
            mode === 'reports' ? 'xl:col-span-4' : 'xl:col-span-5'
          } flex flex-col gap-gutter-md min-w-0`}
        >
          <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-md no-print">
            <header className="flex flex-col gap-0.5 pb-gutter-sm border-b border-light-outline-variant">
              <h3 className="font-headline text-title-md text-light-on-surface">
                Pagamentos Online
              </h3>
              <p className="font-body text-body-sm text-light-on-surface-variant">
                Gerar referência ou link para liquidação remota
              </p>
            </header>

            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Folha de Obra</span>
              <select
                value={onlineTargetOrder?.id ?? ''}
                onChange={(e) => setSelectedOnlineOrderId(e.target.value)}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              >
                {workOrders.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {formatCurrency(w.total, currency)} ({w.paymentStatus})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Método</span>
              <select
                value={selectedMethod}
                onChange={(e) => setSelectedMethod(e.target.value as PaymentMethod)}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            {onlineTargetOrder && (
              <div className="p-gutter-sm bg-light-surface-container-low border border-light-outline-variant rounded flex flex-col gap-1">
                <div className="flex items-center justify-between gap-gutter-sm">
                  <span className="font-label text-label-sm uppercase text-light-on-surface-variant">
                    Link Gerado
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(generatedLink);
                        onNotify('Link copiado.');
                      } catch {
                        onNotify(generatedLink);
                      }
                    }}
                    className="inline-flex items-center gap-1 font-label text-label-sm text-light-primary dark:text-red-400 hover:underline"
                  >
                    <Copy className="w-3 h-3" aria-hidden="true" />
                    <span>Copiar</span>
                  </button>
                </div>
                <span className="font-mono text-mono-md text-light-on-surface break-all">
                  {generatedLink}
                </span>
                <span className="font-body text-body-sm text-light-on-surface-variant">
                  Estado:{' '}
                  {onlineTargetOrder.paymentStatus === 'Liquidado'
                    ? 'Liquidado'
                    : 'Pendente de liquidação'}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={handleGenerateAndCopyLink}
              className="w-full inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm min-h-[42px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-lg"
            >
              <Link2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Gerar Link &amp; Copiar</span>
            </button>
          </article>

          {/* Latest Receipts Ledger */}
          <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg overflow-hidden">
            <header className="px-gutter-md py-gutter-sm bg-light-surface-container-low border-b border-light-outline-variant flex items-center justify-between">
              <h3 className="font-headline text-title-md text-light-on-surface">
                Liquidações Recentes
              </h3>
              <span className="font-mono text-mono-sm text-light-on-surface-variant">
                {paymentRecords.length} registos
              </span>
            </header>
            <div className="divide-y divide-light-outline-variant">
              {paymentRecords.slice(0, 5).map((rec) => (
                <div
                  key={rec.id}
                  className="px-gutter-md py-gutter-sm flex items-center justify-between gap-gutter-sm"
                >
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-success dark:text-emerald-400 shrink-0" aria-hidden="true" />
                      <span className="font-mono text-mono-md text-light-on-surface">
                        {rec.workOrderCode}
                      </span>
                    </div>
                    <span className="font-body text-body-sm text-light-on-surface-variant truncate">
                      {rec.clientName} · {rec.paidAt} · {rec.reference}
                    </span>
                  </div>
                  <span className="font-mono text-mono-md font-semibold text-success dark:text-emerald-400 tabular-nums whitespace-nowrap">
                    {formatCurrency(rec.amount, currency)}
                  </span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      {/* Modal: Registar Pagamento */}
      <Modal
        open={registerModalOpen}
        onClose={() => setRegisterModalOpen(false)}
        title="Registar Pagamento"
        subtitle="Liquidação direta ao balcão ou por transferência"
      >
        <form onSubmit={handleRegisterPaymentSubmit} className="flex flex-col gap-gutter-md">
          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface">Folha de Obra</span>
            <select
              value={payOrderId}
              onChange={(e) => setPayOrderId(e.target.value)}
              required
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
            >
              {workOrders.map((wo) => (
                <option key={wo.id} value={wo.id}>
                  {wo.code} · {wo.clientName} · {formatCurrency(wo.total, currency)} ({wo.paymentStatus})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface">
              Método de Pagamento
            </span>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface">
              Referência / Talão TPA
            </span>
            <input
              type="text"
              required
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
            />
          </label>

          <div className="flex justify-end gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
            <button
              type="button"
              onClick={() => setRegisterModalOpen(false)}
              className="px-gutter-md py-gutter-sm rounded border border-light-outline-variant font-label text-label-lg text-light-on-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-gutter-md py-gutter-sm rounded bg-success text-on-success font-label text-label-lg"
            >
              Confirmar Liquidação
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
