import {
  BarChart3,
  Car,
  ClipboardList,
  CreditCard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
  X,
} from 'lucide-react';
import type {CurrencyCode, NavSection} from '../../types/database';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  criticalStockCount: number;
  currency: CurrencyCode;
  supabaseConfigured: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItemConfig {
  id: NavSection;
  label: string;
  icon: typeof ClipboardList;
  badgeCount?: number;
}

export function Sidebar({
  activeSection,
  onSelectSection,
  criticalStockCount,
  currency,
  supabaseConfigured,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navItems: NavItemConfig[] = [
    {id: 'folhas-obra', label: 'Folhas de Obra', icon: ClipboardList},
    {id: 'clientes-viaturas', label: 'Clientes & Viaturas', icon: Car},
    {
      id: 'stock-fornecedores',
      label: 'Stock & Fornecedores',
      icon: Package,
      badgeCount: criticalStockCount,
    },
    {id: 'pagamentos', label: 'Pagamentos', icon: CreditCard},
    {id: 'relatorios', label: 'Relatórios Mensais', icon: BarChart3},
    {id: 'utilizadores', label: 'Utilizadores & Acesso', icon: Users},
    {id: 'definicoes', label: 'Definições', icon: Settings},
  ];

  const handleNav = (id: NavSection) => {
    onSelectSection(id);
    onCloseMobile();
  };

  const renderSidebarContent = (isMobileDrawer: boolean) => (
    <div className="flex flex-col justify-between h-full">
      <div className="flex flex-col">
        {/* Brand Header */}
        <div className="px-gutter-md py-gutter-md border-b border-on-accent/15 flex items-center justify-between gap-gutter-sm">
          <div className="flex items-center gap-gutter-sm min-w-0">
            <div className="w-10 h-10 rounded bg-light-surface-bright p-0.5 flex items-center justify-center shrink-0 border border-light-outline-variant">
              <img
                src="/logo-zerca.png"
                alt="Logótipo ZercAuto"
                className="w-full h-full object-contain"
              />
            </div>
            {(!collapsed || isMobileDrawer) && (
              <div className="flex flex-col min-w-0">
                <span className="font-headline text-title-md text-on-accent leading-tight truncate">
                  ZercAuto Gest
                </span>
                <span className="font-mono text-mono-sm text-on-accent/70 whitespace-nowrap">
                  PWA · v2.4
                </span>
              </div>
            )}
          </div>

          {isMobileDrawer ? (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Fechar menu"
              className="min-w-[44px] min-h-[44px] rounded border border-on-accent/20 hover:bg-on-accent/10 flex items-center justify-center text-on-accent shrink-0"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
              className="hidden lg:flex w-8 h-8 rounded border border-on-accent/20 hover:bg-on-accent/10 items-center justify-center text-on-accent transition-colors duration-state-change shrink-0"
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="p-gutter-sm flex flex-col gap-gutter-xs" aria-label="Navegação principal">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                aria-current={active ? 'page' : undefined}
                title={collapsed && !isMobileDrawer ? item.label : undefined}
                className={`w-full min-h-[42px] px-gutter-sm py-gutter-sm rounded flex items-center justify-between gap-gutter-sm transition-colors duration-state-change text-left whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-light-primary text-light-on-primary'
                    : 'text-on-accent/80 hover:bg-on-accent/10 hover:text-on-accent'
                }`}
              >
                <span className="flex items-center gap-gutter-sm min-w-0">
                  <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                  {(!collapsed || isMobileDrawer) && (
                    <span className="font-label text-label-lg truncate">{item.label}</span>
                  )}
                </span>
                {item.badgeCount !== undefined &&
                  item.badgeCount > 0 &&
                  (!collapsed || isMobileDrawer) && (
                    <span className="px-1.5 py-0.5 rounded bg-light-error text-light-on-error font-mono text-mono-sm tabular-nums shrink-0">
                      {item.badgeCount}
                    </span>
                  )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Local Database / Currency Footer */}
      {(!collapsed || isMobileDrawer) && (
        <div className="p-gutter-md border-t border-on-accent/15 flex flex-col gap-gutter-xs">
          <div className="flex items-center justify-between gap-gutter-sm">
            <span className="font-label text-label-sm text-on-accent/70 whitespace-nowrap">
              IndexedDB Local
            </span>
            <span className="font-mono text-mono-sm text-success-container whitespace-nowrap">
              Ativo
            </span>
          </div>
          <div className="flex items-center justify-between gap-gutter-sm">
            <span className="font-label text-label-sm text-on-accent/70 whitespace-nowrap">
              Cloud Supabase
            </span>
            <span className="font-mono text-mono-sm text-on-accent/90 whitespace-nowrap">
              {supabaseConfigured ? 'Configurado' : 'Modo Local'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-gutter-sm">
            <span className="font-label text-label-sm text-on-accent/70 whitespace-nowrap">
              Moeda padrão
            </span>
            <span className="font-mono text-mono-sm text-on-accent whitespace-nowrap">
              {currency === 'EUR' ? 'EUR (€)' : 'AOA (Kz)'}
            </span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Collapsible Rail Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 bg-accent text-on-accent border-r border-light-outline-variant min-h-screen transition-[width] duration-state-change no-print ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-accent/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-accent text-on-accent h-full border-r border-light-outline-variant shadow-none">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}
    </>
  );
}
