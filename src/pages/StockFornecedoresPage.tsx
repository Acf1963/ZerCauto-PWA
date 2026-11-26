import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  FileSpreadsheet,
  PackagePlus,
  Plus,
  Search,
  Truck,
  Upload,
  Warehouse,
} from 'lucide-react';
import {useMemo, useRef, useState} from 'react';
import {
  applyInventoryAdjustments,
  newUuid,
  recordStockMovement,
  saveStockItem,
  saveSupplier,
} from '../db/dexie';
import type {
  CurrencyCode,
  StockItem,
  StockMovement,
  Supplier,
  WorkshopSettings,
} from '../types/database';
import type {InventoryAdjustmentReportData} from '../utils/exporters';
import {formatCurrency, formatNumberPT, formatTodayPT} from '../utils/formatters';
import {Modal} from '../components/ui/Modal';

interface StockFornecedoresPageProps {
  stockItems: StockItem[];
  movements: StockMovement[];
  suppliers: Supplier[];
  settings: WorkshopSettings;
  currency: CurrencyCode;
  onNotify: (msg: string) => void;
}

type StockTab = 'pecas' | 'critico' | 'fornecedores' | 'inventario';

const LAST_INV_REPORT_KEY = 'zercauto_last_inventory_report';

function loadLastInventoryReport(): InventoryAdjustmentReportData | null {
  try {
    const raw = localStorage.getItem(LAST_INV_REPORT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InventoryAdjustmentReportData;
    return parsed && Array.isArray(parsed.adjustments) ? parsed : null;
  } catch {
    return null;
  }
}

export function StockFornecedoresPage({
  stockItems,
  movements,
  suppliers,
  settings,
  currency,
  onNotify,
}: StockFornecedoresPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<StockTab>('pecas');
  const [exportingPdf, setExportingPdf] = useState(false);

  // Inventory Audit & Reconciliation state
  const inventoryFileInputRef = useRef<HTMLInputElement | null>(null);
  const [invCounts, setInvCounts] = useState<Record<string, string>>({});
  const [invNotes, setInvNotes] = useState<Record<string, string>>({});
  const [invReference, setInvReference] = useState(
    () => `INV-${formatTodayPT().replace(/\//g, '')}`
  );
  const [invResponsible, setInvResponsible] = useState('Responsável Armazém');
  const [invImportWarnings, setInvImportWarnings] = useState<string[]>([]);
  const [applyingInventory, setApplyingInventory] = useState(false);
  const [lastInventoryReport, setLastInventoryReport] =
    useState<InventoryAdjustmentReportData | null>(() => loadLastInventoryReport());

  // Modals
  const [newPartOpen, setNewPartOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);

  // New Part Form
  const [pSku, setPSku] = useState('');
  const [pName, setPName] = useState('');
  const [pCategory, setPCategory] = useState('Filtros');
  const [pSupplierId, setPSupplierId] = useState(suppliers[0]?.id ?? '');
  const [pUnit, setPUnit] = useState('un');
  const [pCost, setPCost] = useState('');
  const [pSale, setPSale] = useState('');
  const [pQty, setPQty] = useState('5');
  const [pMinQty, setPMinQty] = useState('2');

  // Movement Form
  const [mItemId, setMItemId] = useState(stockItems[0]?.id ?? '');
  const [mType, setMType] = useState<'entrada' | 'saida'>('entrada');
  const [mQty, setMQty] = useState('4');
  const [mRef, setMRef] = useState('GUI-2026-095');

  // New Supplier Form
  const [sName, setSName] = useState('');
  const [sPhone, setSPhone] = useState('+244 ');
  const [sEta, setSEta] = useState('24h');
  const [sSpecialty, setSSpecialty] = useState('Motor/Filtros');
  const [sEmail, setSEmail] = useState('');

  const criticalItems = useMemo(
    () => stockItems.filter((item) => item.quantity <= item.minQuantity),
    [stockItems]
  );

  const totalCostValuation = useMemo(
    () => stockItems.reduce((acc, item) => acc + item.costPrice * item.quantity, 0),
    [stockItems]
  );

  const filteredItems = useMemo(() => {
    const base = activeTab === 'critico' ? criticalItems : stockItems;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (item) =>
        item.sku.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.supplierName.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [activeTab, criticalItems, stockItems, searchQuery]);

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.specialty.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q)
    );
  }, [suppliers, searchQuery]);

  const inventorySummary = useMemo(() => {
    let countedCount = 0;
    let surplusCount = 0;
    let shortageCount = 0;
    let surplusValue = 0;
    let shortageValue = 0;

    const adjustments: Array<{
      item: StockItem;
      countedQuantity: number;
      difference: number;
      costImpact: number;
      note?: string;
    }> = [];

    for (const item of stockItems) {
      const raw = invCounts[item.id];
      if (raw === undefined || raw.trim() === '') continue;
      const parsed = Number(raw.replace(',', '.'));
      if (Number.isNaN(parsed) || parsed < 0) continue;

      countedCount++;
      const nextQty = Number(parsed.toFixed(2));
      const diff = Number((nextQty - item.quantity).toFixed(2));
      if (Math.abs(diff) >= 0.001) {
        const costImpact = Number((diff * item.costPrice).toFixed(2));
        if (diff > 0) {
          surplusCount++;
          surplusValue += costImpact;
        } else {
          shortageCount++;
          shortageValue += Math.abs(costImpact);
        }
        adjustments.push({
          item,
          countedQuantity: nextQty,
          difference: diff,
          costImpact,
          note: invNotes[item.id]?.trim() || undefined,
        });
      }
    }

    return {
      countedCount,
      surplusCount,
      shortageCount,
      surplusValue,
      shortageValue,
      adjustments,
    };
  }, [stockItems, invCounts, invNotes]);

  const handleImportInventoryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const {parseInventoryCountFile} = await import('../utils/exporters');
      const result = await parseInventoryCountFile(file, stockItems);

      setInvCounts((prev) => ({...prev, ...result.matchedCounts}));
      setInvNotes((prev) => ({...prev, ...result.matchedNotes}));

      const warnings: string[] = [];
      if (result.unknownSkus.length > 0) {
        warnings.push(
          `SKUs não encontrados (${result.unknownSkus.length}): ${result.unknownSkus
            .slice(0, 5)
            .join(', ')}${result.unknownSkus.length > 5 ? '...' : ''}`
        );
      }
      if (result.invalidRows.length > 0) {
        warnings.push(
          `Valores inválidos ignorados (${result.invalidRows.length}): ${result.invalidRows
            .slice(0, 5)
            .join(', ')}`
        );
      }
      setInvImportWarnings(warnings);

      if (result.matchedTotal === 0) {
        onNotify('Nenhuma contagem válida encontrada no ficheiro importado.');
      } else {
        onNotify(
          `${result.matchedTotal} contagens importadas (${result.blankRows} linhas em branco ignoradas).`
        );
      }
    } catch (err) {
      onNotify(
        `Erro ao importar mapa de inventário: ${
          err instanceof Error ? err.message : 'formato inválido.'
        }`
      );
    }
  };

  const handleApplyInventoryAdjustments = async () => {
    if (inventorySummary.adjustments.length === 0) {
      onNotify('Não existem divergências para aplicar ao stock.');
      return;
    }
    setApplyingInventory(true);
    try {
      const ref = invReference.trim() || `INV-${formatTodayPT().replace(/\//g, '')}`;
      const applied = await applyInventoryAdjustments(
        inventorySummary.adjustments.map((a) => ({
          item: a.item,
          countedQuantity: a.countedQuantity,
          note: a.note,
        })),
        ref
      );

      if (applied.length === 0) {
        onNotify('Nenhuma alteração de stock necessária.');
        return;
      }

      const report: InventoryAdjustmentReportData = {
        reference: ref,
        executedAt: new Date().toISOString(),
        responsibleName: invResponsible.trim() || 'Responsável Armazém',
        totalCatalogItems: stockItems.length,
        totalCountedItems: inventorySummary.countedCount,
        adjustments: applied,
      };
      setLastInventoryReport(report);
      try {
        localStorage.setItem(LAST_INV_REPORT_KEY, JSON.stringify(report));
      } catch {
        // Ignore storage errors
      }

      setInvCounts({});
      setInvNotes({});
      setInvImportWarnings([]);
      setInvReference(`INV-${formatTodayPT().replace(/\//g, '')}-${String(Date.now()).slice(-3)}`);
      onNotify(
        `Inventário ${report.reference} aplicado: ${applied.length} referências acertadas.`
      );
    } catch (err) {
      onNotify(
        `Erro ao aplicar acertos: ${err instanceof Error ? err.message : 'tente novamente.'}`
      );
    } finally {
      setApplyingInventory(false);
    }
  };

  const openMovementModal = (item?: StockItem, presetType: 'entrada' | 'saida' = 'entrada') => {
    setMItemId(item?.id ?? stockItems[0]?.id ?? '');
    setMType(presetType);
    setMQty(item ? String(Math.max(item.minQuantity * 2, 4)) : '4');
    setMRef(presetType === 'entrada' ? `GUI-2026-${Math.floor(100 + Math.random() * 899)}` : 'AJUSTE-OFICINA');
    setMovementOpen(true);
  };

  const handleSavePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pSku.trim() || !pName.trim()) return;
    const supplier = suppliers.find((s) => s.id === pSupplierId) ?? suppliers[0];

    const newItem: StockItem = {
      id: newUuid(),
      sku: pSku.trim().toUpperCase(),
      name: pName.trim(),
      category: pCategory,
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
    setPSku('');
    setPName('');
    setPCost('');
    setPSale('');
    onNotify(`Peça ${newItem.sku} adicionada ao catálogo local.`);
  };

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = stockItems.find((s) => s.id === mItemId);
    const qty = Math.max(1, Number(mQty) || 1);
    if (!item) return;

    await recordStockMovement(item, mType, qty, mRef.trim() || 'MOV-MANUAL');
    setMovementOpen(false);
    onNotify(
      `${mType === 'entrada' ? 'Entrada' : 'Saída'} de ${qty} ${item.unit} (${item.sku}) registada.`
    );
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sName.trim()) return;
    const supplier: Supplier = {
      id: newUuid(),
      name: sName.trim(),
      phone: sPhone.trim(),
      deliveryEta: sEta.trim() || '48h',
      specialty: sSpecialty.trim() || 'Peças Gerais',
      email: sEmail.trim(),
      updatedAt: new Date().toISOString(),
    };
    await saveSupplier(supplier);
    setNewSupplierOpen(false);
    setSName('');
    setSEmail('');
    onNotify(`Fornecedor ${supplier.name} registado.`);
  };

  return (
    <div className="flex flex-col gap-gutter-lg">
      {/* 4 Top KPIs */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-gutter-sm lg:gap-gutter-md">
        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-sm lg:p-gutter-md flex flex-col justify-between gap-gutter-xs">
          <header className="flex items-center justify-between gap-gutter-sm">
            <span className="font-label text-label-sm lg:text-label-lg text-light-on-surface-variant">
              Referências em Catálogo
            </span>
            <Boxes className="w-4 h-4 text-light-outline shrink-0 hidden sm:block" aria-hidden="true" />
          </header>
          <p className="font-display text-headline-md lg:text-headline-lg text-light-on-surface tabular-nums">
            {stockItems.length} SKUs
          </p>
        </article>

        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-sm lg:p-gutter-md flex flex-col justify-between gap-gutter-xs">
          <header className="flex items-center justify-between gap-gutter-sm">
            <span className="font-label text-label-sm lg:text-label-lg text-light-on-surface-variant">
              Valor em Stock (Custo)
            </span>
            <Warehouse className="w-4 h-4 text-light-outline shrink-0 hidden sm:block" aria-hidden="true" />
          </header>
          <p className="font-display text-headline-md lg:text-headline-lg text-light-on-surface tabular-nums">
            {formatCurrency(totalCostValuation, currency)}
          </p>
        </article>

        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-sm lg:p-gutter-md flex flex-col justify-between gap-gutter-xs">
          <header className="flex items-center justify-between gap-gutter-sm">
            <span className="font-label text-label-sm lg:text-label-lg text-light-on-surface-variant">
              Stock Crítico
            </span>
            <AlertTriangle
              className={`w-4 h-4 shrink-0 hidden sm:block ${
                criticalItems.length > 0 ? 'text-light-error dark:text-red-400' : 'text-success dark:text-emerald-400'
              }`}
              aria-hidden="true"
            />
          </header>
          <p
            className={`font-display text-headline-md lg:text-headline-lg tabular-nums ${
              criticalItems.length > 0 ? 'text-light-error dark:text-red-400' : 'text-success dark:text-emerald-400'
            }`}
          >
            {criticalItems.length} {criticalItems.length === 1 ? 'peça' : 'peças'}
          </p>
        </article>

        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-sm lg:p-gutter-md flex flex-col justify-between gap-gutter-xs">
          <header className="flex items-center justify-between gap-gutter-sm">
            <span className="font-label text-label-sm lg:text-label-lg text-light-on-surface-variant">
              Fornecedores Ativos
            </span>
            <Truck className="w-4 h-4 text-light-outline shrink-0 hidden sm:block" aria-hidden="true" />
          </header>
          <p className="font-display text-headline-md lg:text-headline-lg text-light-on-surface tabular-nums">
            {suppliers.length}
          </p>
        </article>
      </section>

      {/* Main Split Workspace */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg items-start">
        {/* Left: Inventory Catalog + Tabs (8 cols) */}
        <div className="xl:col-span-8 flex flex-col gap-gutter-md min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                className="w-4 h-4 text-light-outline absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar SKU, peça ou fornecedor..."
                className="w-full min-h-[42px] pl-9 pr-3 py-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface placeholder:text-light-outline focus:outline-none focus:border-light-primary"
              />
            </div>

            <div className="flex flex-wrap items-center gap-gutter-sm shrink-0">
              <button
                type="button"
                onClick={async () => {
                  const {exportStockXlsx} = await import('../utils/exporters');
                  exportStockXlsx(stockItems, movements, suppliers, currency);
                  onNotify('Inventário de stock exportado para Excel (.xlsx).');
                }}
                className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[42px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container font-label text-label-lg text-light-on-surface whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Exportar XLSX</span>
              </button>
              <button
                type="button"
                disabled={exportingPdf}
                onClick={async () => {
                  setExportingPdf(true);
                  try {
                    const {exportStockPdf} = await import('../utils/exporters');
                    await exportStockPdf(stockItems, suppliers, settings, currency);
                    onNotify('Inventário de stock exportado para PDF.');
                  } catch (err) {
                    onNotify(
                      `Erro ao gerar PDF: ${err instanceof Error ? err.message : 'tente novamente.'}`
                    );
                  } finally {
                    setExportingPdf(false);
                  }
                }}
                className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[42px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container disabled:opacity-60 font-label text-label-lg text-light-on-surface whitespace-nowrap"
              >
                <FileDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{exportingPdf ? 'A gerar PDF...' : 'PDF'}</span>
              </button>
              <button
                type="button"
                onClick={() => openMovementModal()}
                className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[42px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container font-label text-label-lg text-light-on-surface whitespace-nowrap"
              >
                <ArrowUpDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Registar Movimento</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPSupplierId(suppliers[0]?.id ?? '');
                  setNewPartOpen(true);
                }}
                className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[42px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-lg whitespace-nowrap"
              >
                <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Nova Peça</span>
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div
            role="tablist"
            className="flex items-center gap-gutter-xs border-b border-light-outline-variant overflow-x-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'pecas'}
              onClick={() => setActiveTab('pecas')}
              className={`px-gutter-md py-gutter-sm min-h-[40px] border-b-2 font-label text-label-lg whitespace-nowrap shrink-0 ${
                activeTab === 'pecas'
                  ? 'border-light-primary dark:border-red-400 text-light-primary dark:text-red-400'
                  : 'border-transparent text-light-on-surface-variant hover:text-light-on-surface'
              }`}
            >
              Peças ({stockItems.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'critico'}
              onClick={() => setActiveTab('critico')}
              className={`px-gutter-md py-gutter-sm min-h-[40px] border-b-2 font-label text-label-lg whitespace-nowrap shrink-0 ${
                activeTab === 'critico'
                  ? 'border-light-primary dark:border-red-400 text-light-primary dark:text-red-400'
                  : 'border-transparent text-light-on-surface-variant hover:text-light-on-surface'
              }`}
            >
              Crítico ({criticalItems.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'fornecedores'}
              onClick={() => setActiveTab('fornecedores')}
              className={`px-gutter-md py-gutter-sm min-h-[40px] border-b-2 font-label text-label-lg whitespace-nowrap shrink-0 ${
                activeTab === 'fornecedores'
                  ? 'border-light-primary dark:border-red-400 text-light-primary dark:text-red-400'
                  : 'border-transparent text-light-on-surface-variant hover:text-light-on-surface'
              }`}
            >
              Fornecedores ({suppliers.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'inventario'}
              onClick={() => setActiveTab('inventario')}
              className={`inline-flex items-center gap-1.5 px-gutter-md py-gutter-sm min-h-[40px] border-b-2 font-label text-label-lg whitespace-nowrap shrink-0 ${
                activeTab === 'inventario'
                  ? 'border-light-primary dark:border-red-400 text-light-primary dark:text-red-400'
                  : 'border-transparent text-light-on-surface-variant hover:text-light-on-surface'
              }`}
            >
              <ClipboardCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Inventário &amp; Acertos</span>
            </button>
          </div>

          {activeTab === 'inventario' ? (
            <div className="flex flex-col gap-gutter-md">
              {/* Step 1 & 2: Map Export & Import Controls */}
              <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-md">
                <header className="flex flex-wrap items-start justify-between gap-gutter-sm">
                  <div className="flex flex-col gap-0.5">
                    <h3 className="font-headline text-title-md text-light-on-surface">
                      Conferência Física &amp; Acerto de Stock
                    </h3>
                    <p className="font-body text-body-sm text-light-on-surface-variant">
                      Gere o mapa de contagem, importe o ficheiro preenchido (ou ajuste direto na tabela) e emita o relatório oficial das alterações.
                    </p>
                  </div>
                </header>

                <div className="flex flex-wrap items-center gap-gutter-sm">
                  <button
                    type="button"
                    onClick={async () => {
                      const {exportInventoryCountSheetXlsx} = await import('../utils/exporters');
                      exportInventoryCountSheetXlsx(stockItems, suppliers);
                      onNotify('Mapa de inventário (.xlsx) gerado com sucesso.');
                    }}
                    className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container font-label text-label-lg text-light-on-surface whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Gerar Mapa (XLSX)</span>
                  </button>

                  <button
                    type="button"
                    disabled={exportingPdf}
                    onClick={async () => {
                      setExportingPdf(true);
                      try {
                        const {exportInventoryCountSheetPdf} = await import('../utils/exporters');
                        await exportInventoryCountSheetPdf(stockItems, suppliers, settings);
                        onNotify('Mapa de contagem para impressão (PDF) gerado.');
                      } catch (err) {
                        onNotify(
                          `Erro ao gerar PDF: ${
                            err instanceof Error ? err.message : 'tente novamente.'
                          }`
                        );
                      } finally {
                        setExportingPdf(false);
                      }
                    }}
                    className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container disabled:opacity-60 font-label text-label-lg text-light-on-surface whitespace-nowrap"
                  >
                    <FileDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Mapa Impressão (PDF)</span>
                  </button>

                  <input
                    ref={inventoryFileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleImportInventoryFile}
                    className="sr-only"
                    aria-label="Importar mapa de inventário preenchido"
                  />
                  <button
                    type="button"
                    onClick={() => inventoryFileInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-primary dark:border-red-400 bg-light-surface-container-lowest hover:bg-light-surface-container font-label text-label-lg text-light-primary dark:text-red-400 whitespace-nowrap"
                  >
                    <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Importar Mapa (XLSX/CSV)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const next: Record<string, string> = {};
                      for (const item of stockItems) {
                        next[item.id] =
                          invCounts[item.id] !== undefined && invCounts[item.id] !== ''
                            ? invCounts[item.id]
                            : String(item.quantity);
                      }
                      setInvCounts(next);
                      onNotify('Contagens preenchidas com o stock atual do sistema.');
                    }}
                    className="inline-flex items-center justify-center gap-gutter-xs px-gutter-sm py-gutter-sm min-h-[40px] rounded border border-light-outline-variant hover:bg-light-surface-container font-label text-label-sm text-light-on-surface-variant whitespace-nowrap"
                  >
                    <span>Copiar Stock Atual</span>
                  </button>

                  {Object.keys(invCounts).length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setInvCounts({});
                        setInvNotes({});
                        setInvImportWarnings([]);
                      }}
                      className="inline-flex items-center justify-center px-gutter-sm py-gutter-sm min-h-[40px] rounded border border-light-outline-variant hover:bg-light-surface-container font-label text-label-sm text-light-on-surface-variant whitespace-nowrap"
                    >
                      <span>Limpar Contagens</span>
                    </button>
                  )}
                </div>

                {invImportWarnings.length > 0 && (
                  <div className="p-gutter-sm rounded border border-light-outline-variant bg-warning-container/40 text-light-on-surface flex items-start gap-gutter-sm">
                    <AlertTriangle
                      className="w-4 h-4 text-light-error dark:text-red-400 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="flex flex-col gap-0.5 font-body text-body-sm">
                      {invImportWarnings.map((w, idx) => (
                        <span key={idx}>{w}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4 Live Audit Summary Cells */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-label text-label-sm text-light-on-surface-variant">
                      SKUs Contados
                    </span>
                    <span className="font-mono text-title-md text-light-on-surface tabular-nums font-semibold">
                      {inventorySummary.countedCount} / {stockItems.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-label text-label-sm text-light-on-surface-variant">
                      Divergências
                    </span>
                    <span className="font-mono text-title-md text-light-on-surface tabular-nums font-semibold">
                      {inventorySummary.adjustments.length} SKUs
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-label text-label-sm text-light-on-surface-variant">
                      Sobras ({inventorySummary.surplusCount})
                    </span>
                    <span className="font-mono text-title-md text-success dark:text-emerald-400 tabular-nums font-semibold">
                      +{formatCurrency(inventorySummary.surplusValue, currency)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-label text-label-sm text-light-on-surface-variant">
                      Quebras ({inventorySummary.shortageCount})
                    </span>
                    <span className="font-mono text-title-md text-light-error dark:text-red-400 tabular-nums font-semibold">
                      -{formatCurrency(inventorySummary.shortageValue, currency)}
                    </span>
                  </div>
                </div>

                {/* Apply Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-gutter-sm items-end pt-gutter-sm border-t border-light-outline-variant">
                  <label className="sm:col-span-4 flex flex-col gap-1">
                    <span className="font-label text-label-sm text-light-on-surface-variant">
                      Referência do Inventário
                    </span>
                    <input
                      type="text"
                      value={invReference}
                      onChange={(e) => setInvReference(e.target.value)}
                      placeholder="INV-2026-01"
                      className="w-full min-h-[40px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-sm text-light-on-surface"
                    />
                  </label>
                  <label className="sm:col-span-4 flex flex-col gap-1">
                    <span className="font-label text-label-sm text-light-on-surface-variant">
                      Responsável
                    </span>
                    <input
                      type="text"
                      value={invResponsible}
                      onChange={(e) => setInvResponsible(e.target.value)}
                      placeholder="Nome do conferente"
                      className="w-full min-h-[40px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-sm text-light-on-surface"
                    />
                  </label>
                  <div className="sm:col-span-4 flex justify-end">
                    <button
                      type="button"
                      disabled={applyingInventory || inventorySummary.adjustments.length === 0}
                      onClick={handleApplyInventoryAdjustments}
                      className="w-full inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container disabled:opacity-50 font-label text-label-lg whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>
                        {applyingInventory
                          ? 'A aplicar...'
                          : `Aplicar Acertos (${inventorySummary.adjustments.length})`}
                      </span>
                    </button>
                  </div>
                </div>
              </article>

              {/* Step 3: Last Completed Inventory Adjustment Report */}
              {lastInventoryReport && (
                <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-sm">
                  <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-headline text-title-md text-light-on-surface">
                        Último Relatório de Alterações · {lastInventoryReport.reference}
                      </span>
                      <span className="font-mono text-mono-sm text-light-on-surface-variant">
                        {new Date(lastInventoryReport.executedAt).toLocaleString('pt-PT')} ·{' '}
                        {lastInventoryReport.responsibleName} ·{' '}
                        {lastInventoryReport.adjustments.length} SKUs alterados
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-gutter-sm">
                      <button
                        type="button"
                        onClick={async () => {
                          const {exportInventoryAdjustmentsReportPdf} = await import(
                            '../utils/exporters'
                          );
                          await exportInventoryAdjustmentsReportPdf(
                            lastInventoryReport,
                            settings,
                            currency
                          );
                          onNotify(
                            `Relatório PDF ${lastInventoryReport.reference} descarregado.`
                          );
                        }}
                        className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container font-label text-label-lg text-light-on-surface whitespace-nowrap"
                      >
                        <FileDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>Relatório PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          const {exportInventoryAdjustmentsReportXlsx} = await import(
                            '../utils/exporters'
                          );
                          exportInventoryAdjustmentsReportXlsx(lastInventoryReport, currency);
                          onNotify(
                            `Relatório Excel ${lastInventoryReport.reference} descarregado.`
                          );
                        }}
                        className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container font-label text-label-lg text-light-on-surface whitespace-nowrap"
                      >
                        <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>Relatório XLSX</span>
                      </button>
                    </div>
                  </div>
                </article>
              )}

              {/* Interactive Reconciliation Table */}
              <div className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-light-surface-container-low border-b border-light-outline-variant">
                      <tr>
                        <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase">
                          SKU &amp; Peça
                        </th>
                        <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase text-right">
                          Sistema
                        </th>
                        <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase text-right">
                          Contagem Física
                        </th>
                        <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase text-right">
                          Diferença
                        </th>
                        <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase">
                          Observações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-light-outline-variant">
                      {filteredItems.map((item) => {
                        const rawCount = invCounts[item.id] ?? '';
                        const parsed =
                          rawCount.trim() !== ''
                            ? Number(rawCount.replace(',', '.'))
                            : Number.NaN;
                        const hasValidCount = !Number.isNaN(parsed) && parsed >= 0;
                        const diff = hasValidCount
                          ? Number((parsed - item.quantity).toFixed(2))
                          : 0;

                        return (
                          <tr
                            key={item.id}
                            className="hover:bg-light-surface-container-low/50 transition-colors duration-state-change"
                          >
                            <td className="px-gutter-sm py-gutter-sm">
                              <div className="flex flex-col">
                                <span className="font-label text-label-lg text-light-on-surface">
                                  {item.name}
                                </span>
                                <span className="font-mono text-mono-sm text-light-on-surface-variant">
                                  {item.sku} · {item.unit}
                                </span>
                              </div>
                            </td>
                            <td className="px-gutter-sm py-gutter-sm text-right font-mono text-mono-md text-light-on-surface tabular-nums whitespace-nowrap">
                              {formatNumberPT(item.quantity)} {item.unit}
                            </td>
                            <td className="px-gutter-sm py-gutter-sm text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                aria-label={`Contagem física para ${item.sku}`}
                                value={rawCount}
                                onChange={(e) =>
                                  setInvCounts((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value,
                                  }))
                                }
                                placeholder="—"
                                className="w-24 min-h-[36px] px-2 text-right bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface tabular-nums focus:outline-none focus:border-light-primary"
                              />
                            </td>
                            <td className="px-gutter-sm py-gutter-sm text-right whitespace-nowrap font-mono text-mono-md tabular-nums">
                              {!hasValidCount ? (
                                <span className="text-light-on-surface-variant">—</span>
                              ) : Math.abs(diff) < 0.001 ? (
                                <span className="text-light-on-surface-variant">0 (OK)</span>
                              ) : diff > 0 ? (
                                <span className="text-success dark:text-emerald-400 font-semibold">
                                  +{formatNumberPT(diff)} (Sobra)
                                </span>
                              ) : (
                                <span className="text-light-error dark:text-red-400 font-semibold">
                                  {formatNumberPT(diff)} (Quebra)
                                </span>
                              )}
                            </td>
                            <td className="px-gutter-sm py-gutter-sm">
                              <input
                                type="text"
                                aria-label={`Observações para ${item.sku}`}
                                value={invNotes[item.id] ?? ''}
                                onChange={(e) =>
                                  setInvNotes((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value,
                                  }))
                                }
                                placeholder="Opcional..."
                                className="w-full min-w-[140px] min-h-[36px] px-2 bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-sm text-light-on-surface focus:outline-none focus:border-light-primary"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeTab === 'fornecedores' ? (
            <div className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg divide-y divide-light-outline-variant">
              {filteredSuppliers.map((sup) => (
                <div
                  key={sup.id}
                  className="p-gutter-md flex flex-wrap items-center justify-between gap-gutter-sm"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-title text-title-md text-light-on-surface">{sup.name}</span>
                    <span className="font-mono text-mono-sm text-light-on-surface-variant">
                      Entrega: {sup.deliveryEta} · {sup.phone}
                      {sup.email ? ` · ${sup.email}` : ''}
                    </span>
                  </div>
                  <span className="px-gutter-sm py-1 rounded bg-light-surface-container text-light-on-surface-variant font-label text-label-sm whitespace-nowrap">
                    {sup.specialty}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block bg-light-surface-container-lowest border border-light-outline-variant rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-light-surface-container-low border-b border-light-outline-variant">
                      <tr>
                        <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase">
                          SKU &amp; Peça
                        </th>
                        <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase">
                          Fornecedor
                        </th>
                        <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase text-right">
                          Custo / Venda
                        </th>
                        <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase text-right">
                          Stock
                        </th>
                        <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase text-right">
                          Ação
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-light-outline-variant">
                      {filteredItems.map((item) => {
                        const isCritical = item.quantity <= item.minQuantity;
                        return (
                          <tr
                            key={item.id}
                            className="hover:bg-light-surface-container-low/60 transition-colors duration-state-change"
                          >
                            <td className="px-gutter-sm py-gutter-sm">
                              <div className="flex flex-col">
                                <span className="font-label text-label-lg text-light-on-surface">
                                  {item.name}
                                </span>
                                <span className="font-mono text-mono-sm text-light-on-surface-variant">
                                  SKU: {item.sku} · {item.category}
                                </span>
                              </div>
                            </td>
                            <td className="px-gutter-sm py-gutter-sm font-body text-body-sm text-light-on-surface-variant">
                              {item.supplierName}
                            </td>
                            <td className="px-gutter-sm py-gutter-sm text-right whitespace-nowrap font-mono text-mono-sm text-light-on-surface tabular-nums">
                              {formatCurrency(item.costPrice, currency)} /{' '}
                              <span className="font-semibold">
                                {formatCurrency(item.salePrice, currency)}
                              </span>
                            </td>
                            <td className="px-gutter-sm py-gutter-sm text-right whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-gutter-sm py-0.5 rounded font-mono text-mono-sm tabular-nums ${
                                  isCritical
                                    ? 'bg-light-error-container text-light-on-error-container'
                                    : 'bg-success-container text-on-success-container'
                                }`}
                              >
                                {item.quantity} / mín {item.minQuantity} {item.unit}
                              </span>
                            </td>
                            <td className="px-gutter-sm py-gutter-sm text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openMovementModal(item, 'entrada')}
                                className="px-gutter-sm py-1 rounded border border-light-outline-variant hover:border-light-primary dark:hover:border-red-400 hover:text-light-primary dark:hover:text-red-400 font-label text-label-sm text-light-on-surface"
                              >
                                {isCritical ? 'Repor' : 'Movimentar'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden flex flex-col gap-gutter-sm">
                {filteredItems.map((item) => {
                  const isCritical = item.quantity <= item.minQuantity;
                  return (
                    <article
                      key={item.id}
                      className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-xs"
                    >
                      <header className="flex items-start justify-between gap-gutter-sm">
                        <div className="flex flex-col min-w-0">
                          <span className="font-label text-label-lg text-light-on-surface">
                            {item.name}
                          </span>
                          <span className="font-mono text-mono-sm text-light-on-surface-variant">
                            {item.sku} · {item.supplierName}
                          </span>
                        </div>
                        <span
                          className={`px-gutter-sm py-gutter-xs rounded font-mono text-mono-sm whitespace-nowrap tabular-nums ${
                            isCritical
                              ? 'bg-light-error-container text-light-on-error-container'
                              : 'bg-success-container text-on-success-container'
                          }`}
                        >
                          {isCritical
                            ? `${item.quantity} / mín ${item.minQuantity}`
                            : `${item.quantity} ${item.unit} OK`}
                        </span>
                      </header>
                      <footer className="pt-gutter-xs border-t border-light-outline-variant flex items-center justify-between gap-gutter-sm">
                        <span className="font-mono text-mono-sm text-light-on-surface tabular-nums">
                          Venda: {formatCurrency(item.salePrice, currency)}
                        </span>
                        <button
                          type="button"
                          onClick={() => openMovementModal(item, 'entrada')}
                          className="px-gutter-sm py-1.5 min-h-[36px] rounded border border-light-outline-variant font-label text-label-sm text-light-primary dark:text-red-400"
                        >
                          {isCritical ? 'Repor Stock' : 'Movimentos'}
                        </button>
                      </footer>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Right: Movimentos Recentes + Fornecedores (4 cols) */}
        <div className="xl:col-span-4 flex flex-col gap-gutter-md min-w-0">
          {/* Movimentos Recentes */}
          <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg overflow-hidden">
            <header className="px-gutter-md py-gutter-sm bg-light-surface-container-low border-b border-light-outline-variant flex items-center justify-between">
              <h3 className="font-headline text-title-md text-light-on-surface">
                Movimentos Recentes
              </h3>
              <span className="font-mono text-mono-sm text-light-on-surface-variant">Ledger</span>
            </header>
            <div className="divide-y divide-light-outline-variant">
              {movements.slice(0, 6).map((mov) => (
                <div
                  key={mov.id}
                  className="px-gutter-md py-gutter-sm flex items-center justify-between gap-gutter-sm"
                >
                  <div className="flex items-start gap-gutter-sm min-w-0">
                    {mov.type === 'entrada' ? (
                      <ArrowDownLeft
                        className="w-4 h-4 text-success dark:text-emerald-400 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    ) : (
                      <ArrowUpRight
                        className="w-4 h-4 text-light-error dark:text-red-400 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="font-label text-label-lg text-light-on-surface truncate">
                        {mov.type === 'entrada' ? 'Entrada' : 'Saída'} · {mov.itemName}
                      </span>
                      <span className="font-mono text-mono-sm text-light-on-surface-variant">
                        Ref: {mov.reference}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`font-mono text-mono-md font-semibold tabular-nums whitespace-nowrap ${
                      mov.type === 'entrada' ? 'text-success dark:text-emerald-400' : 'text-light-error dark:text-red-400'
                    }`}
                  >
                    {mov.type === 'entrada' ? `+${mov.quantity}` : `-${mov.quantity}`} {mov.unit}
                  </span>
                </div>
              ))}
            </div>
          </article>

          {/* Fornecedores Compact Panel */}
          <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg overflow-hidden">
            <header className="px-gutter-md py-gutter-sm bg-light-surface-container-low border-b border-light-outline-variant flex items-center justify-between">
              <h3 className="font-headline text-title-md text-light-on-surface">Fornecedores</h3>
              <button
                type="button"
                onClick={() => setNewSupplierOpen(true)}
                className="font-label text-label-sm text-light-primary dark:text-red-400 hover:underline whitespace-nowrap"
              >
                + Novo
              </button>
            </header>
            <div className="divide-y divide-light-outline-variant">
              {suppliers.map((sup) => (
                <div
                  key={sup.id}
                  className="px-gutter-md py-gutter-sm flex items-center justify-between gap-gutter-sm"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-label text-label-lg text-light-on-surface truncate">
                      {sup.name}
                    </span>
                    <span className="font-mono text-mono-sm text-light-on-surface-variant truncate">
                      Entrega: {sup.deliveryEta} · {sup.phone}
                    </span>
                  </div>
                  <span className="font-label text-label-sm text-light-on-surface-variant whitespace-nowrap shrink-0">
                    {sup.specialty}
                  </span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      {/* Modal: Nova Peça */}
      <Modal
        open={newPartOpen}
        onClose={() => setNewPartOpen(false)}
        title="Nova Peça em Catálogo"
        subtitle="Adiciona referência ao inventário offline-first com controlo de CMV"
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
              <span className="font-label text-label-sm text-light-on-surface">Custo (AOA)</span>
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
              <span className="font-label text-label-sm text-light-on-surface">Venda (AOA)</span>
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
          <div className="flex justify-end gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
            <button
              type="button"
              onClick={() => setNewPartOpen(false)}
              className="px-gutter-md py-gutter-sm rounded border border-light-outline-variant font-label text-label-lg text-light-on-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-gutter-md py-gutter-sm rounded bg-light-primary text-light-on-primary font-label text-label-lg"
            >
              <PackagePlus className="w-4 h-4" aria-hidden="true" />
              <span>Guardar Peça</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Registar Movimento */}
      <Modal
        open={movementOpen}
        onClose={() => setMovementOpen(false)}
        title="Registar Movimento de Stock"
        subtitle="Atualiza quantidades e regista linha auditável no ledger"
      >
        <form onSubmit={handleSaveMovement} className="flex flex-col gap-gutter-md">
          <div className="grid grid-cols-2 gap-gutter-sm">
            <button
              type="button"
              onClick={() => setMType('entrada')}
              className={`py-gutter-sm rounded border font-label text-label-lg ${
                mType === 'entrada'
                  ? 'bg-success text-on-success border-success'
                  : 'bg-light-surface-container-low text-light-on-surface border-light-outline-variant'
              }`}
            >
              Entrada (Compra)
            </button>
            <button
              type="button"
              onClick={() => setMType('saida')}
              className={`py-gutter-sm rounded border font-label text-label-lg ${
                mType === 'saida'
                  ? 'bg-light-primary text-light-on-primary border-light-primary'
                  : 'bg-light-surface-container-low text-light-on-surface border-light-outline-variant'
              }`}
            >
              Saída (Consumo)
            </button>
          </div>
          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface">Peça</span>
            <select
              value={mItemId}
              onChange={(e) => setMItemId(e.target.value)}
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
            >
              {stockItems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sku} · {s.name} (Atual: {s.quantity} {s.unit})
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-sm">
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Quantidade</span>
              <input
                type="number"
                min={1}
                required
                value={mQty}
                onChange={(e) => setMQty(e.target.value)}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">
                Guia / Folha de Obra
              </span>
              <input
                type="text"
                required
                value={mRef}
                onChange={(e) => setMRef(e.target.value)}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>
          </div>
          <div className="flex justify-end gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
            <button
              type="button"
              onClick={() => setMovementOpen(false)}
              className="px-gutter-md py-gutter-sm rounded border border-light-outline-variant font-label text-label-lg text-light-on-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-gutter-md py-gutter-sm rounded bg-light-primary text-light-on-primary font-label text-label-lg"
            >
              Confirmar Movimento
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Novo Fornecedor */}
      <Modal
        open={newSupplierOpen}
        onClose={() => setNewSupplierOpen(false)}
        title="Novo Fornecedor"
        subtitle="Adicionar parceiro de peças ou lubrificantes"
      >
        <form onSubmit={handleSaveSupplier} className="flex flex-col gap-gutter-md">
          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface">Nome / Firma</span>
            <input
              type="text"
              required
              value={sName}
              onChange={(e) => setSName(e.target.value)}
              placeholder="Ex.: LubriAngola Lda"
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-sm">
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Telefone</span>
              <input
                type="tel"
                required
                value={sPhone}
                onChange={(e) => setSPhone(e.target.value)}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Prazo Entrega</span>
              <input
                type="text"
                required
                value={sEta}
                onChange={(e) => setSEta(e.target.value)}
                placeholder="24h"
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-sm">
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Especialidade</span>
              <input
                type="text"
                required
                value={sSpecialty}
                onChange={(e) => setSSpecialty(e.target.value)}
                placeholder="Travagem / Motor"
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
              />
            </label>
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Email</span>
              <input
                type="email"
                value={sEmail}
                onChange={(e) => setSEmail(e.target.value)}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
              />
            </label>
          </div>
          <div className="flex justify-end gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
            <button
              type="button"
              onClick={() => setNewSupplierOpen(false)}
              className="px-gutter-md py-gutter-sm rounded border border-light-outline-variant font-label text-label-lg text-light-on-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-gutter-md py-gutter-sm rounded bg-light-primary text-light-on-primary font-label text-label-lg"
            >
              Guardar Fornecedor
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
