import {useLiveQuery} from 'dexie-react-hooks';
import {AlertTriangle, Database, Download, LogIn, LogOut, Monitor, Moon, RotateCcw, Save, Sun, Trash2, Upload} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import {db, saveWorkshopSettings} from '../db/dexie';
import {resetDatabaseToSeed} from '../db/seed';
import {type ThemePreference, useTheme} from '../hooks/useTheme';
import {isSupabaseConfigured, supabase} from '../lib/supabase';
import type {CurrencyCode, WorkshopSettings} from '../types/database';
import {PWAInstallButton} from '../components/ui/PWAInstallButton';

interface DefinicoesPageProps {
  settings: WorkshopSettings;
  pendingSyncCount: number;
  onSyncNow: () => void;
  onNotify: (msg: string) => void;
}

export function DefinicoesPage({
  settings,
  pendingSyncCount,
  onSyncNow,
  onNotify,
}: DefinicoesPageProps) {
  const [workshopName, setWorkshopName] = useState(settings.workshopName);
  const [nif, setNif] = useState(settings.nif);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);
  const [foPrefix, setFoPrefix] = useState(settings.foPrefix);
  const [currency, setCurrency] = useState<CurrencyCode>(settings.currency);
  const [ivaRate, setIvaRate] = useState(String(settings.ivaRate));
  const [hourlyRate, setHourlyRate] = useState(String(settings.hourlyRate));
  const [autoSync, setAutoSync] = useState(settings.autoSync);
  const [confirmReset, setConfirmReset] = useState(false);
  const [cloudUserEmail, setCloudUserEmail] = useState<string | null>(null);
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [cloudAuthBusy, setCloudAuthBusy] = useState(false);
  const {preference, setPreference} = useTheme();
  const syncErrors = useLiveQuery(() => db.syncErrors.orderBy('createdAt').reverse().limit(15).toArray()) ?? [];

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let active = true;
    supabase.auth.getUser().then(({data}) => {
      if (active) {
        setCloudUserEmail(data.user?.email ?? null);
      }
    });
    const {data: sub} = supabase.auth.onAuthStateChange((_event, session) => {
      setCloudUserEmail(session?.user?.email ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleCloudSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !cloudEmail.trim() || !cloudPassword) return;
    setCloudAuthBusy(true);
    try {
      const {data, error} = await supabase.auth.signInWithPassword({
        email: cloudEmail.trim(),
        password: cloudPassword,
      });
      if (error) {
        onNotify(`Erro Supabase Auth: ${error.message}`);
        return;
      }
      setCloudPassword('');
      setCloudUserEmail(data.user?.email ?? cloudEmail.trim());
      onNotify(`Sessão Supabase Cloud iniciada (${data.user?.email ?? cloudEmail.trim()}).`);
    } finally {
      setCloudAuthBusy(false);
    }
  };

  const handleCloudSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCloudUserEmail(null);
    onNotify('Sessão Supabase Cloud terminada.');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveWorkshopSettings({
      ...settings,
      workshopName: workshopName.trim() || settings.workshopName,
      nif: nif.trim(),
      phone: phone.trim(),
      address: address.trim(),
      foPrefix: foPrefix.trim() || 'FO-2026',
      currency,
      ivaRate: Math.max(0, Number(ivaRate) || 14),
      hourlyRate: Math.max(0, Number(hourlyRate) || 12000),
      autoSync,
      updatedAt: new Date().toISOString(),
    });
    onNotify('Definições da oficina guardadas no IndexedDB local.');
  };

  const handleExportBackup = async () => {
    const dump = {
      exportedAt: new Date().toISOString(),
      version: '2.4',
      workOrders: await db.workOrders.toArray(),
      clients: await db.clients.toArray(),
      vehicles: await db.vehicles.toArray(),
      stockItems: await db.stockItems.toArray(),
      stockMovements: await db.stockMovements.toArray(),
      suppliers: await db.suppliers.toArray(),
      paymentRecords: await db.paymentRecords.toArray(),
      workshopUsers: await db.workshopUsers.toArray(),
      workshopSettings: await db.workshopSettings.toArray(),
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `zercauto-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify('Backup JSON exportado com sucesso.');
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await db.transaction(
        'rw',
        [
          db.workOrders,
          db.clients,
          db.vehicles,
          db.stockItems,
          db.stockMovements,
          db.suppliers,
          db.paymentRecords,
          db.workshopUsers,
          db.workshopSettings,
        ],
        async () => {
          if (Array.isArray(parsed.workOrders)) await db.workOrders.bulkPut(parsed.workOrders);
          if (Array.isArray(parsed.clients)) await db.clients.bulkPut(parsed.clients);
          if (Array.isArray(parsed.vehicles)) await db.vehicles.bulkPut(parsed.vehicles);
          if (Array.isArray(parsed.stockItems)) await db.stockItems.bulkPut(parsed.stockItems);
          if (Array.isArray(parsed.stockMovements))
            await db.stockMovements.bulkPut(parsed.stockMovements);
          if (Array.isArray(parsed.suppliers)) await db.suppliers.bulkPut(parsed.suppliers);
          if (Array.isArray(parsed.paymentRecords))
            await db.paymentRecords.bulkPut(parsed.paymentRecords);
          if (Array.isArray(parsed.workshopUsers))
            await db.workshopUsers.bulkPut(parsed.workshopUsers);
          if (Array.isArray(parsed.workshopSettings))
            await db.workshopSettings.bulkPut(parsed.workshopSettings);
        }
      );
      onNotify('Backup restaurado com sucesso no IndexedDB local.');
    } catch {
      onNotify('Ficheiro de backup inválido.');
    } finally {
      e.target.value = '';
    }
  };

  const handleResetDemo = async () => {
    await resetDatabaseToSeed();
    setConfirmReset(false);
    onNotify('Base de dados local reposta com os registos iniciais.');
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg items-start">
      {/* Left: Workshop Profile & Financial Parameters */}
      <form
        onSubmit={handleSaveSettings}
        className="xl:col-span-7 bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-md"
      >
        <header className="flex items-center justify-between gap-gutter-sm pb-gutter-sm border-b border-light-outline-variant">
          <div className="flex items-center gap-gutter-sm">
            <div className="w-10 h-10 rounded bg-light-surface-bright p-0.5 border border-light-outline-variant flex items-center justify-center shrink-0">
              <img
                src={`${import.meta.env.BASE_URL}logo-zerca.png`}
                alt="Logótipo ZercAuto"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col">
              <h2 className="font-headline text-title-md text-light-on-surface">
                Dados da Oficina &amp; Faturação
              </h2>
              <span className="font-body text-body-sm text-light-on-surface-variant">
                Configuração aplicada a Folhas de Obra, relatórios e moeda padrão
              </span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-sm">
          <label className="flex flex-col gap-gutter-xs sm:col-span-2">
            <span className="font-label text-label-lg text-light-on-surface">Nome da Oficina</span>
            <input
              type="text"
              required
              value={workshopName}
              onChange={(e) => setWorkshopName(e.target.value)}
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
            />
          </label>
          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface">NIF</span>
            <input
              type="text"
              required
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
            />
          </label>
          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface">Telefone</span>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
            />
          </label>
          <label className="flex flex-col gap-gutter-xs sm:col-span-2">
            <span className="font-label text-label-lg text-light-on-surface">Morada</span>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-sm text-light-on-surface">Prefixo FO</span>
            <input
              type="text"
              value={foPrefix}
              onChange={(e) => setFoPrefix(e.target.value)}
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md uppercase text-light-on-surface"
            />
          </label>
          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-sm text-light-on-surface">Moeda Padrão</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
            >
              <option value="AOA">AOA (Kz)</option>
              <option value="EUR">EUR (€)</option>
            </select>
          </label>
          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-sm text-light-on-surface">Taxa IVA (%)</span>
            <input
              type="number"
              min={0}
              max={50}
              value={ivaRate}
              onChange={(e) => setIvaRate(e.target.value)}
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
            />
          </label>
          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-sm text-light-on-surface">M.O. / Hora (AOA)</span>
            <input
              type="number"
              min={0}
              step={500}
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
            />
          </label>
        </div>

        <label className="flex items-center gap-gutter-sm pt-gutter-xs cursor-pointer">
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(e) => setAutoSync(e.target.checked)}
            className="rounded border-light-outline text-light-primary focus:ring-light-primary"
          />
          <span className="font-body text-body-md text-light-on-surface">
            Sincronização automática ao recuperar ligação à rede
          </span>
        </label>

        <div className="flex justify-end pt-gutter-sm border-t border-light-outline-variant">
          <button
            type="submit"
            className="inline-flex items-center gap-gutter-sm px-gutter-md py-gutter-sm min-h-[42px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-lg"
          >
            <Save className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Guardar Definições</span>
          </button>
        </div>
      </form>

      {/* Right: Appearance, Sync, PWA Install, Backup & Restore */}
      <div className="xl:col-span-5 flex flex-col gap-gutter-md">
        {/* Theme / Appearance Panel */}
        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-sm">
          <header className="flex items-center justify-between gap-gutter-sm pb-gutter-sm border-b border-light-outline-variant">
            <div className="flex items-center gap-gutter-sm">
              {preference === 'dark' ? (
                <Moon className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              ) : (
                <Sun className="w-4 h-4 text-light-primary dark:text-red-400 shrink-0" aria-hidden="true" />
              )}
              <h3 className="font-headline text-title-md text-light-on-surface">
                Aparência da Aplicação
              </h3>
            </div>
            <span className="font-mono text-mono-sm text-light-on-surface-variant">
              {preference === 'system' ? 'Automático' : preference === 'dark' ? 'Escuro' : 'Claro'}
            </span>
          </header>

          <p className="font-body text-body-sm text-light-on-surface-variant">
            Escolha o tema visual para o balcão ou acompanhe a definição do dispositivo.
          </p>

          <div
            role="radiogroup"
            aria-label="Selecionar tema da aplicação"
            className="grid grid-cols-3 gap-gutter-xs p-1 rounded border border-light-outline-variant bg-light-surface-container-low"
          >
            {(
              [
                {id: 'light', label: 'Claro', icon: Sun},
                {id: 'dark', label: 'Escuro', icon: Moon},
                {id: 'system', label: 'Sistema', icon: Monitor},
              ] as Array<{id: ThemePreference; label: string; icon: typeof Sun}>
            ).map((opt) => {
              const Icon = opt.icon;
              const selected = preference === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setPreference(opt.id);
                    onNotify(`Tema alterado para ${opt.label}.`);
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 min-h-[38px] px-gutter-sm py-1.5 rounded font-label text-label-lg transition-colors duration-state-change ${
                    selected
                      ? 'bg-light-primary text-light-on-primary'
                      : 'text-light-on-surface-variant hover:bg-light-surface-container hover:text-light-on-surface'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </article>

        {/* Sync & Cloud Panel */}
        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-sm">
          <header className="flex items-center justify-between gap-gutter-sm pb-gutter-sm border-b border-light-outline-variant">
            <div className="flex items-center gap-gutter-sm">
              <Database className="w-4 h-4 text-light-primary dark:text-red-400 shrink-0" aria-hidden="true" />
              <h3 className="font-headline text-title-md text-light-on-surface">
                Sincronização &amp; Base de Dados
              </h3>
            </div>
            <span className="font-mono text-mono-sm text-light-on-surface-variant tabular-nums">
              {pendingSyncCount} pendentes
            </span>
          </header>

          <div className="flex flex-col gap-1 text-body-sm text-light-on-surface-variant">
            <p>
              Armazenamento Primário: <strong className="text-light-on-surface">IndexedDB (Dexie.js)</strong>
            </p>
            <p>
              Cloud Remota (Supabase):{' '}
              <strong className="text-light-on-surface">
                {isSupabaseConfigured
                  ? cloudUserEmail
                    ? `Autenticado (${cloudUserEmail})`
                    : 'Configurado · Aguarda sessão Auth'
                  : 'Modo Local Offline-First (sem credenciais .env)'}
              </strong>
            </p>
          </div>

          {isSupabaseConfigured && (
            <div className="p-gutter-sm bg-light-surface-container-low border border-light-outline-variant rounded flex flex-col gap-gutter-sm">
              {cloudUserEmail ? (
                <div className="flex items-center justify-between gap-gutter-sm flex-wrap">
                  <span className="font-mono text-mono-sm text-success dark:text-emerald-400">
                    Sessão ativa: {cloudUserEmail}
                  </span>
                  <button
                    type="button"
                    onClick={handleCloudSignOut}
                    className="inline-flex items-center gap-1 px-gutter-sm py-1 rounded border border-light-outline-variant hover:bg-light-surface-container font-label text-label-sm text-light-on-surface"
                  >
                    <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Sair da Cloud</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCloudSignIn} className="flex flex-col gap-gutter-xs">
                  <span className="font-label text-label-sm text-light-on-surface">
                    Iniciar Sessão Supabase Auth (necessário para RLS)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-xs">
                    <input
                      type="email"
                      required
                      value={cloudEmail}
                      onChange={(e) => setCloudEmail(e.target.value)}
                      placeholder="Email Supabase Auth"
                      className="w-full min-h-[38px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-sm text-light-on-surface"
                    />
                    <input
                      type="password"
                      required
                      value={cloudPassword}
                      onChange={(e) => setCloudPassword(e.target.value)}
                      placeholder="Palavra-passe"
                      className="w-full min-h-[38px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-sm text-light-on-surface"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={cloudAuthBusy}
                    className="self-start inline-flex items-center gap-1.5 px-gutter-sm py-1.5 min-h-[36px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container disabled:opacity-60 font-label text-label-sm"
                  >
                    <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{cloudAuthBusy ? 'A autenticar...' : 'Ligar Sessão Cloud'}</span>
                  </button>
                </form>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-gutter-sm pt-gutter-xs">
            <button
              type="button"
              onClick={onSyncNow}
              className="px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container font-label text-label-lg text-light-on-surface"
            >
              Executar Sincronização
            </button>
            <PWAInstallButton variant="full" onNotify={onNotify} />
          </div>
        </article>

        {/* Sync Diagnostic Panel */}
        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-sm">
          <header className="flex items-center justify-between gap-gutter-sm pb-gutter-sm border-b border-light-outline-variant">
            <div className="flex items-center gap-gutter-sm">
              <AlertTriangle className="w-4 h-4 text-light-error dark:text-red-400 shrink-0" aria-hidden="true" />
              <h3 className="font-headline text-title-md text-light-on-surface">
                Painel de Diagnóstico de Sincronização
              </h3>
            </div>
            <span className="font-mono text-mono-sm text-light-on-surface-variant tabular-nums">
              {syncErrors.length} erros
            </span>
          </header>

          <p className="font-body text-body-sm text-light-on-surface-variant">
            Histórico recente de falhas de rede, restrições RLS ou conflitos durante a sincronização com o Supabase.
          </p>

          {syncErrors.length === 0 ? (
            <div className="p-gutter-sm rounded border border-light-outline-variant bg-light-surface-container-low text-center font-body text-body-sm text-light-on-surface-variant">
              Sem erros de sincronização registados.
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto divide-y divide-light-outline-variant border border-light-outline-variant rounded p-2 bg-light-surface-container-low">
              {syncErrors.map((err) => (
                <div key={err.id} className="pt-2 first:pt-0 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-mono-xs text-light-primary dark:text-red-400 font-semibold uppercase">
                      {err.table}
                    </span>
                    <span className="font-mono text-mono-xs text-light-on-surface-variant">
                      {new Date(err.createdAt).toLocaleTimeString('pt-PT')}
                    </span>
                  </div>
                  <span className="font-body text-body-xs text-light-on-surface break-words">
                    {err.error}
                  </span>
                  <span className="font-mono text-mono-xs text-light-outline truncate">
                    ID: {err.recordId}
                  </span>
                </div>
              ))}
            </div>
          )}

          {syncErrors.length > 0 && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={async () => {
                  await db.syncErrors.clear();
                  onNotify('Histórico de diagnóstico limpo.');
                }}
                className="inline-flex items-center gap-1 px-gutter-sm py-1.5 rounded border border-light-outline-variant hover:bg-light-surface-container font-label text-label-sm text-light-on-surface"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Limpar Registos</span>
              </button>
            </div>
          )}
        </article>

        {/* Backup & Restore */}
        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-md">
          <header className="pb-gutter-sm border-b border-light-outline-variant">
            <h3 className="font-headline text-title-md text-light-on-surface">
              Backup &amp; Restauro Local
            </h3>
            <p className="font-body text-body-sm text-light-on-surface-variant">
              Exporte ou importe todas as tabelas locais em formato JSON
            </p>
          </header>

          <div className="flex flex-wrap items-center gap-gutter-sm">
            <button
              type="button"
              onClick={handleExportBackup}
              className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-outline-variant hover:bg-light-surface-container font-label text-label-lg text-light-on-surface"
            >
              <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Exportar Backup JSON</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-outline-variant hover:bg-light-surface-container font-label text-label-lg text-light-on-surface"
            >
              <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Importar Backup JSON</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportBackup}
              className="hidden"
            />
          </div>

          <div className="pt-gutter-sm border-t border-light-outline-variant flex items-center justify-between gap-gutter-sm">
            <span className="font-body text-body-sm text-light-on-surface-variant">
              Repor dados iniciais de demonstração
            </span>
            {confirmReset ? (
              <div className="flex items-center gap-gutter-xs">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-gutter-sm py-1.5 rounded border border-light-outline-variant font-label text-label-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleResetDemo}
                  className="px-gutter-sm py-1.5 rounded bg-light-error text-light-on-error font-label text-label-sm"
                >
                  Confirmar Reposição
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1 px-gutter-sm py-1.5 rounded border border-light-error/30 text-light-error dark:text-red-400 hover:bg-light-error-container font-label text-label-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Repor Dados</span>
              </button>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
