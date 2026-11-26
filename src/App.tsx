import {useLiveQuery} from 'dexie-react-hooks';
import {CheckCircle2, Lock, LogIn} from 'lucide-react';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {MobileNav} from './components/layout/MobileNav';
import {Sidebar} from './components/layout/Sidebar';
import {Topbar} from './components/layout/Topbar';
import {db, saveWorkshopUser} from './db/dexie';
import {DEFAULT_SETTINGS, ensureDatabaseSeeded} from './db/seed';
import {useOnlineStatus} from './hooks/useOnlineStatus';
import {isSupabaseConfigured} from './lib/supabase';
import {runSyncCycle} from './lib/syncEngine';
import {ClientesViaturasPage} from './pages/ClientesViaturasPage';
import {DefinicoesPage} from './pages/DefinicoesPage';
import {FolhasObraPage} from './pages/FolhasObraPage';
import {PagamentosRelatoriosPage} from './pages/PagamentosRelatoriosPage';
import {StockFornecedoresPage} from './pages/StockFornecedoresPage';
import {UtilizadoresAcessoPage} from './pages/UtilizadoresAcessoPage';
import type {NavSection, WorkshopUser} from './types/database';
import {getInitials} from './utils/formatters';

const SECTION_META: Record<NavSection, {title: string; subtitle: string}> = {
  'folhas-obra': {
    title: 'Dashboard & Folhas de Obra',
    subtitle: 'Oficina Central · Novembro 2026',
  },
  'clientes-viaturas': {
    title: 'Clientes & Histórico de Viaturas',
    subtitle: 'Fichas de cliente, frotas associadas e registo cronológico de intervenções',
  },
  'stock-fornecedores': {
    title: 'Fornecedores & Controlo de Stock',
    subtitle: 'Catálogo de peças, preços de custo/venda, movimentos e alertas de reposição',
  },
  pagamentos: {
    title: 'Pagamentos & Liquidações',
    subtitle: 'Controlo de cobranças, referências TPA e links de liquidação online',
  },
  relatorios: {
    title: 'Pagamentos & Relatórios Mensais',
    subtitle: 'Faturação mensal, CMV de peças, margem bruta e exportação CSV/PDF',
  },
  utilizadores: {
    title: 'Utilizadores & Credenciais',
    subtitle: 'Controlo de acessos, perfis da oficina e sessões ativas',
  },
  definicoes: {
    title: 'Definições da Oficina',
    subtitle: 'Dados fiscais, moeda padrão, sincronização e backup local IndexedDB',
  },
};

function getInitialSectionFromHash(): NavSection {
  const hash = window.location.hash.replace('#', '') as NavSection;
  if (hash && hash in SECTION_META) {
    return hash;
  }
  return 'folhas-obra';
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [activeSection, setActiveSection] = useState<NavSection>(getInitialSectionFromHash);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [lockedOut, setLockedOut] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('usr-1');

  const isOnline = useOnlineStatus();

  useEffect(() => {
    let active = true;
    ensureDatabaseSeeded()
      .catch((err) => {
        console.error('Erro ao inicializar IndexedDB:', err);
      })
      .finally(() => {
        if (active) setDbReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setActiveSection(getInitialSectionFromHash());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleSelectSection = (section: NavSection) => {
    setActiveSection(section);
    window.location.hash = section;
  };

  const notify = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  // Live IndexedDB queries
  const workOrders = useLiveQuery(() => db.workOrders.orderBy('code').reverse().toArray(), []) ?? [];
  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), []) ?? [];
  const vehicles = useLiveQuery(() => db.vehicles.toArray(), []) ?? [];
  const stockItems = useLiveQuery(() => db.stockItems.orderBy('name').toArray(), []) ?? [];
  const movements =
    useLiveQuery(() => db.stockMovements.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const suppliers = useLiveQuery(() => db.suppliers.orderBy('name').toArray(), []) ?? [];
  const paymentRecords =
    useLiveQuery(() => db.paymentRecords.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const users = useLiveQuery(() => db.workshopUsers.orderBy('name').toArray(), []) ?? [];
  const settingsRecord = useLiveQuery(() => db.workshopSettings.get('default'), []);
  const pendingSyncCount = useLiveQuery(() => db.syncQueue.count(), []) ?? 0;

  const settings = settingsRecord ?? DEFAULT_SETTINGS;

  const currentUser: WorkshopUser = useMemo(
    () =>
      users.find((u) => u.id === currentUserId) ??
      users[0] ?? {
        id: 'usr-1',
        name: 'Ricardo Mendes',
        email: 'ricardo.mendes@zercauto.ao',
        role: 'Chefe de Oficina',
        sessionState: 'Ativa (Atual)',
        permissions: ['work_orders', 'stock', 'payments', 'users', 'settings'],
        active: true,
        updatedAt: new Date().toISOString(),
      },
    [users, currentUserId]
  );

  const criticalStockCount = useMemo(
    () => stockItems.filter((item) => item.quantity <= item.minQuantity).length,
    [stockItems]
  );

  const handleSyncNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await runSyncCycle();
      if (res.error) {
        notify(res.error);
      } else if (res.syncedCount > 0) {
        notify(
          `${res.syncedCount} ${
            res.syncedCount === 1 ? 'alteração sincronizada' : 'alterações sincronizadas'
          } (${res.mode === 'cloud' ? 'Supabase Cloud' : 'IndexedDB Local'}).`
        );
      } else {
        notify('Todos os registos locais estão sincronizados.');
      }
    } finally {
      setIsSyncing(false);
    }
  }, [notify]);

  // Automatic sync when returning online
  useEffect(() => {
    if (isOnline && dbReady && settings.autoSync && pendingSyncCount > 0 && !isSyncing) {
      handleSyncNow();
    }
  }, [isOnline, dbReady, settings.autoSync, pendingSyncCount, isSyncing, handleSyncNow]);

  const handleLogout = async () => {
    setLockedOut(true);
    notify(`Sessão de ${currentUser.name} terminada.`);
  };

  const handleSelectOperatorLogin = async (user: WorkshopUser) => {
    if (!user.active) return;
    setCurrentUserId(user.id);
    await saveWorkshopUser({...user, sessionState: 'Ativa (Atual)'});
    setLockedOut(false);
    notify(`Sessão iniciada como ${user.name}.`);
  };

  if (!dbReady) {
    return (
      <div className="min-h-screen bg-light-background flex items-center justify-center p-gutter-md">
        <div className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-lg max-w-sm w-full flex flex-col items-center gap-gutter-sm text-center">
          <div className="w-12 h-12 rounded bg-light-surface-bright p-1 border border-light-outline-variant">
            <img src="/logo-zerca.png" alt="ZercAuto" className="w-full h-full object-contain" />
          </div>
          <p className="font-headline text-title-md text-light-on-surface">
            A carregar ZercAuto Gest...
          </p>
          <p className="font-body text-body-sm text-light-on-surface-variant">
            A inicializar base de dados offline IndexedDB
          </p>
        </div>
      </div>
    );
  }

  if (lockedOut) {
    const activeOperators = users.filter((u) => u.active && u.sessionState !== 'Suspenso');
    return (
      <div className="min-h-screen bg-accent flex items-center justify-center p-gutter-md">
        <div className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-lg max-w-md w-full flex flex-col gap-gutter-md">
          <div className="flex items-center gap-gutter-sm pb-gutter-sm border-b border-light-outline-variant">
            <div className="w-11 h-11 rounded bg-light-surface-bright p-1 border border-light-outline-variant shrink-0">
              <img src="/logo-zerca.png" alt="ZercAuto" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col">
              <h1 className="font-headline text-headline-md text-light-on-surface">
                ZercAuto Gest
              </h1>
              <span className="font-body text-body-sm text-light-on-surface-variant">
                Sessão terminada · Selecione o operador para aceder ao balcão
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-gutter-xs">
            {activeOperators.map((op) => (
              <button
                key={op.id}
                type="button"
                onClick={() => handleSelectOperatorLogin(op)}
                className="w-full p-gutter-sm rounded border border-light-outline-variant hover:border-light-primary hover:bg-light-surface-container-low flex items-center justify-between gap-gutter-sm transition-colors duration-state-change text-left"
              >
                <div className="flex items-center gap-gutter-sm min-w-0">
                  <div className="w-9 h-9 rounded bg-accent text-on-accent flex items-center justify-center font-label text-label-sm shrink-0">
                    {getInitials(op.name)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-label text-label-lg text-light-on-surface truncate">
                      {op.name}
                    </span>
                    <span className="font-body text-body-sm text-light-on-surface-variant truncate">
                      {op.role}
                    </span>
                  </div>
                </div>
                <LogIn className="w-4 h-4 text-light-primary shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pt-gutter-xs text-body-sm text-light-on-surface-variant border-t border-light-outline-variant">
            <span className="inline-flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>IndexedDB Offline-First ativo</span>
            </span>
            <span className="font-mono text-mono-sm">v2.4</span>
          </div>
        </div>
      </div>
    );
  }

  const meta = SECTION_META[activeSection];
  const headerSubtitle =
    activeSection === 'folhas-obra'
      ? `${settings.workshopName} · Novembro 2026`
      : meta.subtitle;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-light-background text-light-on-background">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        criticalStockCount={criticalStockCount}
        currency={settings.currency}
        supabaseConfigured={isSupabaseConfigured}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <Topbar
          title={meta.title}
          subtitle={headerSubtitle}
          isOnline={isOnline}
          pendingSyncCount={pendingSyncCount}
          isSyncing={isSyncing}
          onSyncNow={handleSyncNow}
          currentUser={currentUser}
          onLogout={handleLogout}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onNotify={notify}
        />

        <main className="flex-1 p-gutter-md lg:p-gutter-lg pb-20 lg:pb-gutter-lg max-w-[1600px] w-full mx-auto">
          {activeSection === 'folhas-obra' && (
            <FolhasObraPage
              workOrders={workOrders}
              clients={clients}
              vehicles={vehicles}
              stockItems={stockItems}
              users={users}
              settings={settings}
              currency={settings.currency}
              onNotify={notify}
              onNavigateToStock={() => handleSelectSection('stock-fornecedores')}
            />
          )}

          {activeSection === 'clientes-viaturas' && (
            <ClientesViaturasPage
              clients={clients}
              vehicles={vehicles}
              workOrders={workOrders}
              currency={settings.currency}
              onNotify={notify}
            />
          )}

          {activeSection === 'stock-fornecedores' && (
            <StockFornecedoresPage
              stockItems={stockItems}
              movements={movements}
              suppliers={suppliers}
              currency={settings.currency}
              onNotify={notify}
            />
          )}

          {(activeSection === 'pagamentos' || activeSection === 'relatorios') && (
            <PagamentosRelatoriosPage
              workOrders={workOrders}
              paymentRecords={paymentRecords}
              currency={settings.currency}
              mode={activeSection === 'relatorios' ? 'reports' : 'payments'}
              onNotify={notify}
            />
          )}

          {activeSection === 'utilizadores' && (
            <UtilizadoresAcessoPage
              users={users}
              currentUserId={currentUser.id}
              onNotify={notify}
            />
          )}

          {activeSection === 'definicoes' && (
            <DefinicoesPage
              settings={settings}
              pendingSyncCount={pendingSyncCount}
              onSyncNow={handleSyncNow}
              onNotify={notify}
            />
          )}
        </main>
      </div>

      <MobileNav
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        criticalStockCount={criticalStockCount}
      />

      {/* Non-intrusive Toast Banner */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-16 lg:bottom-6 right-4 lg:right-6 z-50 bg-accent text-on-accent border border-light-outline-variant rounded px-gutter-md py-gutter-sm flex items-center gap-gutter-sm max-w-sm no-print"
        >
          <CheckCircle2 className="w-4 h-4 text-success-container shrink-0" aria-hidden="true" />
          <span className="font-body text-body-sm">{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
