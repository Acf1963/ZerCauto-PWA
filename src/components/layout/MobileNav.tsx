import {Car, ClipboardList, CreditCard, Package} from 'lucide-react';
import type {NavSection} from '../../types/database';

interface MobileNavProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  criticalStockCount: number;
}

export function MobileNav({
  activeSection,
  onSelectSection,
  criticalStockCount,
}: MobileNavProps) {
  const items: Array<{
    id: NavSection;
    label: string;
    icon: typeof ClipboardList;
    badge?: number;
  }> = [
    {id: 'folhas-obra', label: 'Folhas', icon: ClipboardList},
    {id: 'clientes-viaturas', label: 'Clientes', icon: Car},
    {id: 'stock-fornecedores', label: 'Stock', icon: Package, badge: criticalStockCount},
    {id: 'pagamentos', label: 'Finanças', icon: CreditCard},
  ];

  return (
    <nav
      aria-label="Navegação rápida móvel"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-light-surface-container-lowest border-t border-light-outline-variant pb-safe no-print"
    >
      <div className="grid grid-cols-4 h-[52px]">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeSection === item.id ||
            (item.id === 'pagamentos' && activeSection === 'relatorios');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors duration-state-change ${
                isActive ? 'text-light-primary dark:text-red-400' : 'text-light-on-surface-variant'
              }`}
            >
              <div className="relative">
                <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 px-1 rounded bg-light-error text-light-on-error font-mono text-[9px] leading-tight tabular-nums">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="font-label text-[10px] leading-tight whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
