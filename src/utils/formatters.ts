import type {CurrencyCode, PaymentStatus, WorkOrderStatus} from '../types/database';

const EUR_EXCHANGE_RATE = 980; // 1 EUR ≈ 980 AOA when converting display if switched

export function convertAmount(amountAOA: number, currency: CurrencyCode): number {
  if (currency === 'EUR') {
    return amountAOA / EUR_EXCHANGE_RATE;
  }
  return amountAOA;
}

export function formatCurrency(
  amountAOA: number,
  currency: CurrencyCode = 'AOA',
  options?: {decimals?: number; compact?: boolean}
): string {
  const decimals = options?.decimals ?? (currency === 'EUR' ? 2 : 0);
  const value = convertAmount(amountAOA, currency);

  if (options?.compact && Math.abs(value) >= 1_000_000) {
    const millions = (value / 1_000_000).toLocaleString('pt-PT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return currency === 'EUR' ? `${millions}M €` : `${millions}M Kz`;
  }

  const formatted = value.toLocaleString('pt-PT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return currency === 'EUR' ? `${formatted} €` : `${formatted} Kz`;
}

export function formatNumberPT(value: number, decimals = 0): string {
  return value.toLocaleString('pt-PT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatTodayPT(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${d}/${m}/${y}`;
}

export function getCurrentPeriodKey(): string {
  return '2026-11';
}

export function formatPeriodLabel(periodKey: string): string {
  const map: Record<string, string> = {
    '2026-11': 'Novembro 2026',
    '2026-10': 'Outubro 2026',
    '2026-09': 'Setembro 2026',
    '2025-12': 'Dezembro 2025',
  };
  if (map[periodKey]) return map[periodKey];
  const [year, month] = periodKey.split('-');
  const months = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  const idx = Number(month) - 1;
  return `${months[idx] ?? month} ${year}`;
}

export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ZA';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function getWorkOrderStatusStyle(status: WorkOrderStatus): string {
  switch (status) {
    case 'Em Execução':
      return 'bg-warning-container text-on-warning-container';
    case 'Aguarda Peças':
      return 'bg-light-error-container text-light-on-error-container';
    case 'Pronta para Faturar':
    case 'Concluída':
      return 'bg-light-secondary-container text-light-on-secondary-container';
    case 'Faturada':
      return 'bg-success-container text-on-success-container';
    case 'Em Diagnóstico':
    case 'Aberta':
    default:
      return 'bg-light-surface-container text-light-on-surface-variant';
  }
}

export function getPaymentStatusStyle(status: PaymentStatus): string {
  switch (status) {
    case 'Liquidado':
      return 'bg-success-container text-on-success-container';
    case 'Parcial':
      return 'bg-warning-container text-on-warning-container';
    case 'Pendente':
    default:
      return 'bg-light-error-container text-light-on-error-container';
  }
}

export function downloadCSV(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCell).join(';'), ...rows.map((r) => r.map(escapeCell).join(';'))].join('\n');

  const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
