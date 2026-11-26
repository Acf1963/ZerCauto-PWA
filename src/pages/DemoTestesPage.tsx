import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardPlus,
  CreditCard,
  Eye,
  EyeOff,
  FlaskConical,
  Lock,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import {useState} from 'react';
import {
  newUuid,
  recordStockMovement,
  savePaymentRecord,
  saveWorkOrder,
} from '../db/dexie';
import {resetDatabaseToSeed} from '../db/seed';
import type {
  Client,
  CurrencyCode,
  NavSection,
  PaymentRecord,
  StockItem,
  SyncQueueItem,
  Vehicle,
  WorkOrder,
  WorkshopSettings,
} from '../types/database';
import {DEMO_TEST_EMAIL, verifyDemoCredentials} from '../utils/auth';
import {
  formatCurrency,
  formatTodayPT,
  getCurrentPeriodKey,
} from '../utils/formatters';

interface DemoTestesPageProps {
  demoAuthorizedEmail: string | null;
  demoModeActive: boolean;
  onUnlockDemo: (email: string) => void;
  onLockDemo: () => void;
  onToggleDemoBanner: (active: boolean) => void;
  workOrders: WorkOrder[];
  clients: Client[];
  vehicles: Vehicle[];
  stockItems: StockItem[];
  paymentRecords: PaymentRecord[];
  syncQueueItems: SyncQueueItem[];
  pendingSyncCount: number;
  settings: WorkshopSettings;
  currency: CurrencyCode;
  onSyncNow: () => void;
  onNavigate: (section: NavSection) => void;
  onNotify: (msg: string) => void;
}

export function DemoTestesPage({
  demoAuthorizedEmail,
  demoModeActive,
  onUnlockDemo,
  onLockDemo,
  onToggleDemoBanner,
  workOrders,
  clients,
  vehicles,
  stockItems,
  paymentRecords,
  syncQueueItems,
  pendingSyncCount,
  settings,
  currency,
  onSyncNow,
  onNavigate,
  onNotify,
}: DemoTestesPageProps) {
  const [email, setEmail] = useState(DEMO_TEST_EMAIL);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleDemoLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifying) return;
    setAuthError(null);
    setVerifying(true);

    try {
      const res = await verifyDemoCredentials(email, password);
      if (!res.ok) {
        setAuthError(res.error);
        return;
      }
      setPassword('');
      onUnlockDemo(res.authorizedEmail);
      onNotify(`Módulo Demo desbloqueado (${res.authorizedEmail}).`);
    } finally {
      setVerifying(false);
    }
  };

  const handleGenerateTestWorkOrder = async () => {
    const client = clients[0];
    const vehicle =
      vehicles.find((v) => v.clientId === client?.id) ?? vehicles[0];
    if (!client || !vehicle) {
      onNotify('Sem cliente ou viatura base disponíveis. Reponha os dados demo.');
      return;
    }

    const seq = String(Math.floor(1000 + Math.random() * 8999));
    const code = `FO-DEMO-${seq}`;
    const part = stockItems[0];
    const partQty = 1;
    const partTotal = part ? part.salePrice * partQty : 0;
    const laborTotal = settings.hourlyRate * 1.5;
    const subtotal = partTotal + laborTotal;
    const ivaAmount = Math.round(subtotal * (settings.ivaRate / 100));
    const total = subtotal + ivaAmount;

    const testOrder: WorkOrder = {
      id: newUuid(),
      code,
      clientId: client.id,
      clientName: client.name,
      vehicleId: vehicle.id,
      vehiclePlate: vehicle.plate,
      vehicleLabel: `${vehicle.brand} ${vehicle.model}`,
      mileage: vehicle.mileage + 250,
      status: 'Em Diagnóstico',
      diagnosis: 'Cenário Demo: Inspeção completa de travagem e revisão periódica.',
      parts: part
        ? [
            {
              id: newUuid(),
              stockItemId: part.id,
              sku: part.sku,
              name: part.name,
              quantity: partQty,
              unit: part.unit,
              unitCost: part.costPrice,
              unitPrice: part.salePrice,
              totalPrice: partTotal,
            },
          ]
        : [],
      labor: [
        {
          id: newUuid(),
          technicianName: 'Paulo Silva (Teste)',
          description: 'Mão de Obra Demo · Diagnóstico e teste de estrada',
          hours: 1.5,
          hourlyRate: settings.hourlyRate,
          totalPrice: laborTotal,
        },
      ],
      ivaRate: settings.ivaRate,
      subtotal,
      ivaAmount,
      total,
      cmvTotal: part ? part.costPrice * partQty : 0,
      paymentStatus: 'Pendente',
      periodKey: getCurrentPeriodKey(),
      openedAt: formatTodayPT(),
      updatedAt: new Date().toISOString(),
    };

    await saveWorkOrder(testOrder);
    onNotify(`Folha de Obra de teste ${code} criada com sucesso.`);
  };

  const handleSimulateCriticalStock = async () => {
    const candidate =
      stockItems.find((item) => item.quantity > item.minQuantity) ?? stockItems[0];
    if (!candidate) {
      onNotify('Sem artigos de stock disponíveis para simulação.');
      return;
    }

    const qtyToRemove = Math.max(1, candidate.quantity - Math.max(0, candidate.minQuantity - 1));
    await recordStockMovement(
      candidate,
      'saida',
      qtyToRemove,
      `TESTE-DEMO-${new Date().toISOString().slice(11, 16)}`
    );
    onNotify(`Stock crítico simulado em ${candidate.sku} (${candidate.name}).`);
  };

  const handleSimulatePayment = async () => {
    const pendingOrder =
      workOrders.find((wo) => wo.paymentStatus !== 'Liquidado') ?? workOrders[0];
    if (!pendingOrder) {
      onNotify('Sem folhas de obra disponíveis para simular liquidação.');
      return;
    }

    const updatedOrder: WorkOrder = {
      ...pendingOrder,
      paymentStatus: 'Liquidado',
      paymentMethod: 'TPA / Multicaixa',
      status: 'Faturada',
    };
    const record: PaymentRecord = {
      id: newUuid(),
      workOrderId: pendingOrder.id,
      workOrderCode: pendingOrder.code,
      clientName: pendingOrder.clientName,
      amount: pendingOrder.total,
      method: 'TPA / Multicaixa',
      status: 'Liquidado',
      reference: `DEMO-TPA-${Math.floor(100000 + Math.random() * 899999)}`,
      periodKey: pendingOrder.periodKey,
      paidAt: formatTodayPT(),
      updatedAt: new Date().toISOString(),
    };

    await saveWorkOrder(updatedOrder);
    await savePaymentRecord(record);
    onNotify(
      `Liquidação demo registada para ${pendingOrder.code} (${formatCurrency(
        pendingOrder.total,
        currency
      )}).`
    );
  };

  const handleResetDemoData = async () => {
    await resetDatabaseToSeed();
    setConfirmReset(false);
    onNotify('Base de dados de testes reposta com os registos iniciais.');
  };

  if (!demoAuthorizedEmail) {
    return (
      <div className="min-h-[65vh] flex items-center justify-center py-gutter-lg">
        <article className="w-full max-w-md bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-lg flex flex-col gap-gutter-md">
          <header className="flex items-center gap-gutter-sm pb-gutter-sm border-b border-light-outline-variant">
            <div className="w-10 h-10 rounded bg-warning-container text-on-warning-container border border-warning/30 flex items-center justify-center shrink-0">
              <FlaskConical className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col min-w-0">
              <h2 className="font-headline text-headline-md text-light-on-surface">
                Módulo Demo para Testes
              </h2>
              <span className="font-body text-body-sm text-light-on-surface-variant">
                Autentique-se com a conta de teste para aceder à sandbox
              </span>
            </div>
          </header>

          <div className="p-gutter-sm bg-light-surface-container-low border border-light-outline-variant rounded flex items-start gap-gutter-sm">
            <Lock
              className="w-4 h-4 text-light-primary dark:text-red-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="font-body text-body-sm text-light-on-surface-variant">
              Email de teste configurado:{' '}
              <code className="font-mono text-mono-sm text-light-on-surface bg-light-surface-container px-1.5 py-0.5 rounded">
                {DEMO_TEST_EMAIL}
              </code>
            </div>
          </div>

          {authError && (
            <div
              role="alert"
              className="p-gutter-sm rounded bg-light-error-container text-light-on-error-container border border-light-error/30 flex items-center gap-gutter-sm font-body text-body-sm"
            >
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleDemoLogin} className="flex flex-col gap-gutter-md">
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">
                Email de Teste
              </span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={DEMO_TEST_EMAIL}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface placeholder:text-light-outline focus:outline-none focus:border-light-primary dark:focus:border-red-400"
              />
            </label>

            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Palavra-passe</span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[42px] pl-gutter-sm pr-10 bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface placeholder:text-light-outline focus:outline-none focus:border-light-primary dark:focus:border-red-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-light-on-surface-variant hover:text-light-on-surface"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={verifying}
              className="w-full inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm min-h-[42px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container disabled:opacity-60 font-label text-label-lg"
            >
              <FlaskConical className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{verifying ? 'A validar...' : 'Entrar no Módulo Demo'}</span>
            </button>
          </form>
        </article>
      </div>
    );
  }

  const criticalCount = stockItems.filter((item) => item.quantity <= item.minQuantity).length;

  return (
    <div className="flex flex-col gap-gutter-lg">
      {/* Active Demo Banner & Controls */}
      <section className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-wrap items-center justify-between gap-gutter-md">
        <div className="flex items-center gap-gutter-sm min-w-0">
          <div className="w-10 h-10 rounded bg-warning-container text-on-warning-container border border-warning/30 flex items-center justify-center shrink-0">
            <FlaskConical className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-gutter-sm flex-wrap">
              <h2 className="font-headline text-title-md text-light-on-surface">
                Ambiente de Testes Ativo
              </h2>
              <span className="px-gutter-sm py-0.5 rounded bg-success-container text-on-success-container font-mono text-mono-sm">
                {demoAuthorizedEmail}
              </span>
            </div>
            <p className="font-body text-body-sm text-light-on-surface-variant">
              Simule folhas de obra, alertas de stock e liquidações com persistência IndexedDB local
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-gutter-sm shrink-0">
          <button
            type="button"
            onClick={() => onToggleDemoBanner(!demoModeActive)}
            className={`px-gutter-sm py-1.5 min-h-[36px] rounded border font-label text-label-sm transition-colors duration-state-change ${
              demoModeActive
                ? 'bg-warning-container text-on-warning-container border-warning/40'
                : 'border-light-outline-variant bg-light-surface-container-low text-light-on-surface hover:bg-light-surface-container'
            }`}
          >
            {demoModeActive ? 'Etiqueta MODO DEMO: Ativa' : 'Ativar Etiqueta MODO DEMO'}
          </button>

          <button
            type="button"
            onClick={onLockDemo}
            className="inline-flex items-center gap-1 px-gutter-sm py-1.5 min-h-[36px] rounded border border-light-error/30 text-light-error dark:text-red-400 hover:bg-light-error-container font-label text-label-sm"
          >
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Bloquear Módulo Demo</span>
          </button>
        </div>
      </section>

      {/* Live DB State KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-gutter-md">
        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-xs">
          <span className="font-label text-label-sm text-light-on-surface-variant uppercase">
            Folhas de Obra
          </span>
          <p className="font-display text-headline-lg text-light-on-surface tabular-nums">
            {workOrders.length}
          </p>
          <span className="font-body text-body-sm text-light-on-surface-variant">
            {clients.length} clientes · {vehicles.length} viaturas
          </span>
        </article>

        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-xs">
          <span className="font-label text-label-sm text-light-on-surface-variant uppercase">
            Stock Crítico
          </span>
          <p
            className={`font-display text-headline-lg tabular-nums ${
              criticalCount > 0
                ? 'text-light-error dark:text-red-400'
                : 'text-success dark:text-emerald-400'
            }`}
          >
            {criticalCount} {criticalCount === 1 ? 'peça' : 'peças'}
          </p>
          <span className="font-body text-body-sm text-light-on-surface-variant">
            de {stockItems.length} referências em catálogo
          </span>
        </article>

        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-xs">
          <span className="font-label text-label-sm text-light-on-surface-variant uppercase">
            Pagamentos
          </span>
          <p className="font-display text-headline-lg text-success dark:text-emerald-400 tabular-nums">
            {paymentRecords.length}
          </p>
          <span className="font-body text-body-sm text-light-on-surface-variant">
            registos liquidados
          </span>
        </article>

        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-xs">
          <span className="font-label text-label-sm text-light-on-surface-variant uppercase">
            Fila de Sync
          </span>
          <p className="font-display text-headline-lg text-light-primary dark:text-red-400 tabular-nums">
            {pendingSyncCount}
          </p>
          <span className="font-body text-body-sm text-light-on-surface-variant">
            alterações pendentes
          </span>
        </article>
      </section>

      {/* Scenario Simulators & Sync Queue Inspector */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg items-start">
        {/* Left: Test Scenarios (7 cols) */}
        <div className="xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-gutter-md">
          <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col justify-between gap-gutter-md">
            <div className="flex flex-col gap-gutter-xs">
              <div className="flex items-center gap-gutter-sm">
                <ClipboardPlus
                  className="w-4 h-4 text-light-primary dark:text-red-400 shrink-0"
                  aria-hidden="true"
                />
                <h3 className="font-headline text-title-md text-light-on-surface">
                  Gerar Folha de Obra
                </h3>
              </div>
              <p className="font-body text-body-sm text-light-on-surface-variant">
                Cria uma folha <span className="font-mono">FO-DEMO</span> completa com peças, mão de
                obra e IVA calculado.
              </p>
            </div>
            <div className="flex items-center gap-gutter-sm">
              <button
                type="button"
                onClick={handleGenerateTestWorkOrder}
                className="flex-1 px-gutter-sm py-gutter-sm min-h-[38px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-lg"
              >
                Criar FO Teste
              </button>
              <button
                type="button"
                onClick={() => onNavigate('folhas-obra')}
                className="px-gutter-sm py-gutter-sm min-h-[38px] rounded border border-light-outline-variant hover:bg-light-surface-container font-label text-label-sm text-light-on-surface"
              >
                Abrir
              </button>
            </div>
          </article>

          <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col justify-between gap-gutter-md">
            <div className="flex flex-col gap-gutter-xs">
              <div className="flex items-center gap-gutter-sm">
                <AlertTriangle
                  className="w-4 h-4 text-light-error dark:text-red-400 shrink-0"
                  aria-hidden="true"
                />
                <h3 className="font-headline text-title-md text-light-on-surface">
                  Simular Stock Crítico
                </h3>
              </div>
              <p className="font-body text-body-sm text-light-on-surface-variant">
                Regista uma saída de stock para testar os alertas automáticos e contadores na barra
                lateral.
              </p>
            </div>
            <div className="flex items-center gap-gutter-sm">
              <button
                type="button"
                onClick={handleSimulateCriticalStock}
                className="flex-1 px-gutter-sm py-gutter-sm min-h-[38px] rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container font-label text-label-lg text-light-on-surface"
              >
                Baixar Stock
              </button>
              <button
                type="button"
                onClick={() => onNavigate('stock-fornecedores')}
                className="px-gutter-sm py-gutter-sm min-h-[38px] rounded border border-light-outline-variant hover:bg-light-surface-container font-label text-label-sm text-light-on-surface"
              >
                Abrir
              </button>
            </div>
          </article>

          <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col justify-between gap-gutter-md">
            <div className="flex flex-col gap-gutter-xs">
              <div className="flex items-center gap-gutter-sm">
                <CreditCard
                  className="w-4 h-4 text-success dark:text-emerald-400 shrink-0"
                  aria-hidden="true"
                />
                <h3 className="font-headline text-title-md text-light-on-surface">
                  Simular Liquidação
                </h3>
              </div>
              <p className="font-body text-body-sm text-light-on-surface-variant">
                Liquida uma folha pendente via TPA/Multicaixa para validar relatórios mensais e
                recibos.
              </p>
            </div>
            <div className="flex items-center gap-gutter-sm">
              <button
                type="button"
                onClick={handleSimulatePayment}
                className="flex-1 px-gutter-sm py-gutter-sm min-h-[38px] rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container font-label text-label-lg text-light-on-surface"
              >
                Liquidar Folha
              </button>
              <button
                type="button"
                onClick={() => onNavigate('relatorios')}
                className="px-gutter-sm py-gutter-sm min-h-[38px] rounded border border-light-outline-variant hover:bg-light-surface-container font-label text-label-sm text-light-on-surface"
              >
                Relatórios
              </button>
            </div>
          </article>

          <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col justify-between gap-gutter-md">
            <div className="flex flex-col gap-gutter-xs">
              <div className="flex items-center gap-gutter-sm">
                <RotateCcw
                  className="w-4 h-4 text-light-error dark:text-red-400 shrink-0"
                  aria-hidden="true"
                />
                <h3 className="font-headline text-title-md text-light-on-surface">
                  Repor Base de Dados
                </h3>
              </div>
              <p className="font-body text-body-sm text-light-on-surface-variant">
                Limpa registos de teste e restaura o conjunto inicial de demonstração no IndexedDB.
              </p>
            </div>
            {confirmReset ? (
              <div className="flex items-center gap-gutter-xs">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="flex-1 px-gutter-sm py-gutter-sm min-h-[38px] rounded border border-light-outline-variant font-label text-label-sm text-light-on-surface"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleResetDemoData}
                  className="flex-1 px-gutter-sm py-gutter-sm min-h-[38px] rounded bg-light-error text-light-on-error font-label text-label-sm"
                >
                  Confirmar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="w-full px-gutter-sm py-gutter-sm min-h-[38px] rounded border border-light-error/30 text-light-error dark:text-red-400 hover:bg-light-error-container font-label text-label-lg"
              >
                Repor Dados de Teste
              </button>
            )}
          </article>
        </div>

        {/* Right: Sync Queue Inspector (5 cols) */}
        <article className="xl:col-span-5 bg-light-surface-container-lowest border border-light-outline-variant rounded-lg overflow-hidden">
          <header className="px-gutter-md py-gutter-sm bg-light-surface-container-low border-b border-light-outline-variant flex items-center justify-between gap-gutter-sm">
            <div className="flex flex-col">
              <h3 className="font-headline text-title-md text-light-on-surface">
                Inspeção da Fila Offline
              </h3>
              <span className="font-mono text-mono-sm text-light-on-surface-variant">
                IndexedDB syncQueue ({pendingSyncCount})
              </span>
            </div>
            <button
              type="button"
              onClick={onSyncNow}
              className="inline-flex items-center gap-1 px-gutter-sm py-1.5 rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container font-label text-label-sm text-light-on-surface"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Testar Sync</span>
            </button>
          </header>

          {syncQueueItems.length === 0 ? (
            <div className="p-gutter-lg flex flex-col items-center justify-center text-center gap-gutter-xs">
              <CheckCircle2
                className="w-6 h-6 text-success dark:text-emerald-400"
                aria-hidden="true"
              />
              <p className="font-label text-label-lg text-light-on-surface">
                Fila de sincronização vazia
              </p>
              <p className="font-body text-body-sm text-light-on-surface-variant">
                Execute um dos cenários de teste ao lado para observar novas operações na fila.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-light-outline-variant">
              {syncQueueItems.map((item) => (
                <div
                  key={item.id ?? `${item.table}-${item.recordId}`}
                  className="px-gutter-md py-gutter-sm flex items-center justify-between gap-gutter-sm"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-mono text-mono-md text-light-primary dark:text-red-400 font-semibold truncate">
                      {item.table} · {item.operation}
                    </span>
                    <span className="font-mono text-mono-sm text-light-on-surface-variant truncate">
                      {item.recordId}
                    </span>
                  </div>
                  <span className="font-mono text-mono-sm text-light-on-surface-variant whitespace-nowrap tabular-nums">
                    {item.createdAt.slice(11, 19)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
