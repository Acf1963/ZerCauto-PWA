import {X} from 'lucide-react';
import {useEffect, type ReactNode} from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'md',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const widthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  }[maxWidth];

  return (
    <div
      className="fixed inset-0 z-50 bg-accent/60 flex items-center justify-center p-gutter-md no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${widthClass} bg-light-surface-container-lowest border border-light-outline-variant rounded-lg overflow-hidden max-h-[90vh] flex flex-col`}
      >
        <header className="px-gutter-md py-gutter-sm bg-light-surface-container-low border-b border-light-outline-variant flex items-center justify-between gap-gutter-sm shrink-0">
          <div className="flex flex-col min-w-0">
            <h3 id="modal-title" className="font-headline text-headline-md text-light-on-surface truncate">
              {title}
            </h3>
            {subtitle && (
              <p className="font-body text-body-sm text-light-on-surface-variant truncate">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="min-w-[40px] min-h-[40px] rounded border border-transparent hover:border-light-outline-variant hover:bg-light-surface-container flex items-center justify-center text-light-on-surface-variant transition-colors duration-state-change shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>
        <div className="p-gutter-md overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
