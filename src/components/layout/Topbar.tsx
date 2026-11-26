import {LogOut, Menu, Moon, RefreshCw, Sun} from 'lucide-react';
import {useTheme} from '../../hooks/useTheme';
import type {WorkshopUser} from '../../types/database';
import {getInitials} from '../../utils/formatters';
import {PWAInstallButton} from '../ui/PWAInstallButton';

interface TopbarProps {
  title: string;
  subtitle: string;
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  demoModeActive?: boolean;
  onExitDemo?: () => void;
  onSyncNow: () => void;
  currentUser: WorkshopUser;
  onLogout: () => void;
  onOpenMobileMenu: () => void;
  onNotify: (msg: string) => void;
}

export function Topbar({
  title,
  subtitle,
  isOnline,
  pendingSyncCount,
  isSyncing,
  demoModeActive = false,
  onExitDemo,
  onSyncNow,
  currentUser,
  onLogout,
  onOpenMobileMenu,
  onNotify,
}: TopbarProps) {
  const {isDark, toggleTheme} = useTheme();
  const statusLabel = isSyncing
    ? 'A Sincronizar...'
    : !isOnline
      ? `Modo Offline (${pendingSyncCount} pendentes)`
      : pendingSyncCount > 0
        ? `Online (${pendingSyncCount} por sincronizar)`
        : 'Online (Sincronizado)';

  const statusClasses = isSyncing
    ? 'bg-warning-container text-on-warning-container'
    : !isOnline
      ? 'bg-light-error-container text-light-on-error-container'
      : pendingSyncCount > 0
        ? 'bg-warning-container text-on-warning-container'
        : 'bg-success-container text-on-success-container';

  const dotClass = isSyncing
    ? 'bg-warning'
    : !isOnline
      ? 'bg-light-error'
      : pendingSyncCount > 0
        ? 'bg-warning'
        : 'bg-success';

  return (
    <header className="sticky top-0 z-30 bg-light-surface-container-lowest border-b border-light-outline-variant px-gutter-md lg:px-gutter-lg py-2.5 lg:py-gutter-md flex items-center justify-between gap-gutter-sm no-print">
      {/* Left: Mobile Menu Trigger + Title */}
      <div className="flex items-center gap-gutter-sm min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Abrir menu de navegação"
          className="lg:hidden min-w-[44px] min-h-[44px] -ml-1 rounded border border-light-outline-variant bg-light-surface-container-low flex items-center justify-center text-light-on-surface shrink-0"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="flex flex-col min-w-0">
          <h1 className="font-headline text-title-md lg:text-headline-lg text-light-on-surface truncate">
            {title}
          </h1>
          <p className="hidden sm:block font-body text-body-sm text-light-on-surface-variant truncate">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Right: Sync Status + Demo Badge + Actions + User */}
      <div className="flex items-center gap-gutter-sm shrink-0">
        {demoModeActive && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-warning-container text-on-warning-container border border-warning/30 font-mono text-mono-sm font-semibold whitespace-nowrap shrink-0">
            <span>MODO DEMO</span>
            {onExitDemo && (
              <button
                type="button"
                onClick={onExitDemo}
                className="px-1.5 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-sans text-xs transition-colors shadow-sm cursor-pointer"
                title="Sair do Modo Demo"
              >
                Sair
              </button>
            )}
          </div>
        )}

        {/* Live Sync Status Indicator */}
        <div
          className={`inline-flex items-center gap-gutter-xs px-gutter-sm py-1.5 rounded-full font-label text-label-sm whitespace-nowrap shrink-0 ${statusClasses}`}
          role="status"
          aria-live="polite"
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} aria-hidden="true" />
          <span className="hidden sm:inline">{statusLabel}</span>
          <span className="sm:hidden">{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Manual Sync Button */}
        <button
          type="button"
          onClick={onSyncNow}
          disabled={isSyncing}
          className="inline-flex items-center justify-center gap-gutter-xs px-gutter-sm lg:px-gutter-md py-1.5 min-h-[36px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container-low disabled:opacity-60 font-label text-label-lg text-light-on-surface whitespace-nowrap shrink-0 transition-colors duration-state-change"
          title="Sincronizar alterações locais"
        >
          <RefreshCw
            className={`w-4 h-4 shrink-0 ${isSyncing ? 'animate-spin text-light-primary dark:text-red-400' : ''}`}
            aria-hidden="true"
          />
          <span className="hidden md:inline">Sincronizar Agora</span>
        </button>

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
          title={isDark ? 'Modo Claro' : 'Modo Escuro'}
          className="inline-flex items-center justify-center gap-gutter-xs px-gutter-sm py-1.5 min-h-[36px] min-w-[36px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container-low font-label text-label-lg text-light-on-surface whitespace-nowrap shrink-0 transition-colors duration-state-change"
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          ) : (
            <Moon className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
        </button>

        {/* PWA Install Trigger */}
        <PWAInstallButton variant="compact" onNotify={onNotify} />

        {/* Active User Profile & Logout */}
        <div className="hidden xl:flex items-center gap-gutter-sm pl-gutter-sm border-l border-light-outline-variant">
          <div className="w-8 h-8 rounded bg-accent text-on-accent border border-on-accent/15 flex items-center justify-center font-label text-label-sm shrink-0">
            {getInitials(currentUser.name)}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-label text-label-lg text-light-on-surface leading-tight whitespace-nowrap">
              {currentUser.name}
            </span>
            <span className="font-body text-body-sm text-light-on-surface-variant leading-tight whitespace-nowrap">
              {currentUser.role}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          title="Terminar Sessão"
          aria-label="Terminar Sessão"
          className="inline-flex items-center justify-center gap-gutter-xs px-gutter-sm py-1.5 min-h-[36px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-error-container hover:text-light-on-error-container hover:border-light-error/30 font-label text-label-lg text-light-on-surface-variant whitespace-nowrap shrink-0 transition-colors duration-state-change"
        >
          <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="hidden 2xl:inline">Terminar Sessão</span>
        </button>
      </div>
    </header>
  );
}
