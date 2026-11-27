import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type {InventoryAdjustmentAppliedItem} from '../db/dexie';
import type {
  Client,
  CurrencyCode,
  PaymentRecord,
  StockItem,
  StockMovement,
  Supplier,
  Vehicle,
  WorkOrder,
  WorkshopSettings,
} from '../types/database';
import {convertAmount, formatCurrency, formatNumberPT, formatTodayPT} from './formatters';

type AutoTableDoc = jsPDF & {
  lastAutoTable?: {
    finalY?: number;
  };
};

export interface XlsxSheetInput {
  name: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}

function triggerBlobDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, ' ').trim();
  return (cleaned || 'Dados').slice(0, 31);
}

function roundForCurrency(amountAOA: number, currency: CurrencyCode): number {
  const converted = convertAmount(amountAOA, currency);
  return currency === 'EUR' ? Math.round(converted * 100) / 100 : Math.round(converted);
}

export function downloadXlsxWorkbook(filename: string, sheets: XlsxSheetInput[]): void {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const aoa: Array<Array<string | number>> = [sheet.headers, ...sheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    ws['!cols'] = sheet.headers.map((header, colIdx) => {
      let maxLen = header.length;
      for (const row of sheet.rows) {
        const cell = row[colIdx];
        const len = cell === undefined || cell === null ? 0 : String(cell).length;
        if (len > maxLen) maxLen = len;
      }
      return {wch: Math.min(44, Math.max(12, maxLen + 3))};
    });

    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheet.name));
  }

  const arrayBuffer = XLSX.write(wb, {bookType: 'xlsx', type: 'array'}) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, blob);
}

async function loadLogoPngDataUrl(logoPath?: string): Promise<string | null> {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const src =
    logoPath && (logoPath.startsWith('data:') || logoPath.startsWith('http'))
      ? logoPath
      : `${normalizedBase}${(logoPath || 'logo-zerca.png').replace(/^\/+/, '')}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    const res = await fetch(src, {signal: controller.signal});
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Falha ao carregar imagem do logotipo'));
        el.src = objectUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 120;
      canvas.height = img.naturalHeight || 120;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

async function applyPdfWorkshopHeader(
  doc: jsPDF,
  settings: WorkshopSettings,
  documentTitle: string,
  documentSubtitle: string
): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Top ZercAuto Crimson Accent Bar
  doc.setFillColor(153, 27, 27);
  doc.rect(0, 0, pageWidth, 4, 'F');

  const logoDataUrl = await loadLogoPngDataUrl(settings.logoUrl);
  let textStartX = 14;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', 14, 9, 16, 16);
      textStartX = 34;
    } catch {
      textStartX = 14;
    }
  }

  // Workshop Details (Left)
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(settings.workshopName || 'ZercAuto Oficina Central', textStartX, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`NIF: ${settings.nif || '-'}  |  Tel: ${settings.phone || '-'}`, textStartX, 19);
  doc.text(`${settings.address || 'Luanda, Angola'}  |  ${settings.email || ''}`, textStartX, 23.5);

  // Document Title (Right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(153, 27, 27);
  const splitTitle = doc.splitTextToSize(documentTitle, 80);
  doc.text(splitTitle, pageWidth - 14, 12, {align: 'right'});

  const titleHeight = splitTitle.length * 4.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(documentSubtitle, pageWidth - 14, 12 + titleHeight + 0.5, {align: 'right'});
  doc.text(`Emitido em: ${formatTodayPT()}`, pageWidth - 14, 12 + titleHeight + 5, {align: 'right'});

  // Divider line
  const dividerY = Math.max(29, 12 + titleHeight + 8);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.35);
  doc.line(14, dividerY, pageWidth - 14, dividerY);

  return dividerY + 5;
}

function applyPdfPageFooters(doc: jsPDF, footerText?: string): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const leftText =
      footerText?.trim() || 'ZercAuto Gest - Documento processado por computador';
    doc.text(leftText, 14, pageHeight - 9, {maxWidth: pageWidth - 55});
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 9, {align: 'right'});
  }
}

export async function exportWorkOrderPdf(
  order: WorkOrder,
  settings: WorkshopSettings,
  currency: CurrencyCode
): Promise<void> {
  const doc = new jsPDF({orientation: 'portrait', unit: 'mm', format: 'a4'}) as AutoTableDoc;
  const pageWidth = doc.internal.pageSize.getWidth();

  let cursorY = await applyPdfWorkshopHeader(
    doc,
    settings,
    `FOLHA DE OBRA ${order.code}`,
    `Estado: ${order.status}  |  Abertura: ${order.openedAt}`
  );

  // Client & Vehicle Summary Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, cursorY, pageWidth - 28, 24, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('CLIENTE', 18, cursorY + 5.5);
  doc.text('VIATURA & MATRÍCULA', 96, cursorY + 5.5);
  doc.text('PAGAMENTO', 162, cursorY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(order.clientName, 18, cursorY + 11.5, {maxWidth: 74});
  doc.text(`${order.vehiclePlate} - ${order.vehicleLabel}`, 96, cursorY + 11.5, {maxWidth: 62});
  doc.text(order.paymentStatus, 162, cursorY + 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Quilometragem: ${formatNumberPT(order.mileage)} km`, 96, cursorY + 17.5);
  doc.text(`Método: ${order.paymentMethod ?? 'Por definir'}`, 162, cursorY + 17.5, {maxWidth: 32});
  if (order.paymentLink) {
    doc.text(`Ref. Online: ${order.paymentLink}`, 18, cursorY + 17.5, {maxWidth: 74});
  }

  cursorY += 29;

  // Diagnosis Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('DIAGNÓSTICO & TRABALHOS DESCRITOS', 14, cursorY);
  cursorY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const diagLines = doc.splitTextToSize(
    order.diagnosis || 'Sem notas de diagnóstico registadas.',
    pageWidth - 28
  );
  doc.text(diagLines, 14, cursorY);
  cursorY += diagLines.length * 4.2 + 4;

  // Parts & Labor Table
  const itemRows: Array<Array<string>> = [
    ...order.parts.map((p) => [
      'Peça',
      p.sku,
      p.name,
      `${formatNumberPT(p.quantity)} ${p.unit}`,
      formatCurrency(p.unitPrice, currency, {decimals: currency === 'EUR' ? 2 : 0}),
      formatCurrency(p.totalPrice, currency, {decimals: currency === 'EUR' ? 2 : 0}),
    ]),
    ...order.labor.map((l) => [
      'Mão de Obra',
      l.technicianName || '-',
      l.description,
      `${formatNumberPT(l.hours, 1)} h`,
      formatCurrency(l.hourlyRate, currency, {decimals: currency === 'EUR' ? 2 : 0}),
      formatCurrency(l.totalPrice, currency, {decimals: currency === 'EUR' ? 2 : 0}),
    ]),
  ];

  autoTable(doc, {
    startY: cursorY,
    head: [['Tipo', 'SKU / Técnico', 'Descrição', 'Qtd / Horas', 'Preço Unit.', 'Total']],
    body:
      itemRows.length > 0
        ? itemRows
        : [['-', '-', 'Sem peças ou mão de obra registadas', '-', '-', '-']],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: {cellWidth: 23},
      1: {cellWidth: 30},
      2: {cellWidth: 'auto'},
      3: {cellWidth: 22, halign: 'right'},
      4: {cellWidth: 28, halign: 'right'},
      5: {cellWidth: 30, halign: 'right', fontStyle: 'bold'},
    },
    margin: {left: 14, right: 14},
  });

  const tableEndY = doc.lastAutoTable?.finalY ?? cursorY + 30;
  let summaryY = tableEndY + 8;
  if (summaryY > 250) {
    doc.addPage();
    summaryY = 20;
  }

  // Totals Summary Box (Right aligned)
  const boxWidth = 82;
  const boxX = pageWidth - 14 - boxWidth;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(boxX, summaryY, boxWidth, 25, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal:', boxX + 4, summaryY + 6.5);
  doc.text(formatCurrency(order.subtotal, currency, {decimals: 2}), boxX + boxWidth - 4, summaryY + 6.5, {
    align: 'right',
  });

  doc.text(`IVA (${order.ivaRate}%):`, boxX + 4, summaryY + 12.5);
  doc.text(
    formatCurrency(order.ivaAmount, currency, {decimals: 2}),
    boxX + boxWidth - 4,
    summaryY + 12.5,
    {align: 'right'}
  );

  doc.setDrawColor(203, 213, 225);
  doc.line(boxX + 4, summaryY + 15.5, boxX + boxWidth - 4, summaryY + 15.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(153, 27, 27);
  doc.text('Total c/ IVA:', boxX + 4, summaryY + 21.5);
  doc.text(
    formatCurrency(order.total, currency, {decimals: 2}),
    boxX + boxWidth - 4,
    summaryY + 21.5,
    {align: 'right'}
  );

  applyPdfPageFooters(doc, settings.invoiceFooter);
  doc.save(`${order.code}.pdf`);
}

export async function exportFinancialReportPdf(
  periodKey: string,
  periodLabel: string,
  orders: WorkOrder[],
  payments: PaymentRecord[],
  settings: WorkshopSettings,
  currency: CurrencyCode
): Promise<void> {
  const doc = new jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4'}) as AutoTableDoc;
  const pageWidth = doc.internal.pageSize.getWidth();

  let cursorY = await applyPdfWorkshopHeader(
    doc,
    settings,
    'RELATÓRIO FINANCEIRO & FATURAÇÃO',
    `Período: ${periodLabel}  |  Moeda: ${currency}`
  );

  const totalBilled = orders.reduce((acc, w) => acc + w.total, 0);
  const totalPaid = orders
    .filter((w) => w.paymentStatus === 'Liquidado')
    .reduce((acc, w) => acc + w.total, 0);
  const totalPending = totalBilled - totalPaid;
  const totalCmv = orders.reduce((acc, w) => acc + w.cmvTotal, 0);
  const totalGrossMargin = orders.reduce((acc, w) => acc + w.subtotal, 0) - totalCmv;

  // 4 KPI Cards
  const cardGap = 4;
  const cardWidth = (pageWidth - 28 - cardGap * 3) / 4;
  const kpis = [
    {label: 'Total Faturado', value: formatCurrency(totalBilled, currency)},
    {label: 'Recebido / Liquidado', value: formatCurrency(totalPaid, currency)},
    {label: 'Por Receber', value: formatCurrency(totalPending, currency)},
    {label: 'Margem Bruta Estimada', value: formatCurrency(totalGrossMargin, currency)},
  ];

  kpis.forEach((kpi, idx) => {
    const x = 14 + idx * (cardWidth + cardGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, cursorY, cardWidth, 16, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(kpi.label, x + 3.5, cursorY + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.value, x + 3.5, cursorY + 12.5);
  });

  cursorY += 22;

  // Work Orders Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Folhas de Obra (${orders.length})`, 14, cursorY);
  cursorY += 3;

  autoTable(doc, {
    startY: cursorY,
    head: [
      [
        'FO',
        'Data',
        'Cliente',
        'Matrícula',
        'Peças',
        'Mão de Obra',
        'IVA',
        'Total',
        'Pagamento',
        'Método',
      ],
    ],
    body:
      orders.length > 0
        ? orders.map((wo) => [
            wo.code,
            wo.openedAt,
            wo.clientName,
            wo.vehiclePlate,
            formatCurrency(
              wo.parts.reduce((a, p) => a + p.totalPrice, 0),
              currency
            ),
            formatCurrency(
              wo.labor.reduce((a, l) => a + l.totalPrice, 0),
              currency
            ),
            formatCurrency(wo.ivaAmount, currency),
            formatCurrency(wo.total, currency),
            wo.paymentStatus,
            wo.paymentMethod ?? '-',
          ])
        : [['-', '-', 'Sem folhas de obra neste período', '-', '-', '-', '-', '-', '-', '-']],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {fillColor: [248, 250, 252]},
    columnStyles: {
      4: {halign: 'right'},
      5: {halign: 'right'},
      6: {halign: 'right'},
      7: {halign: 'right', fontStyle: 'bold'},
    },
    margin: {left: 14, right: 14},
  });

  if (payments.length > 0) {
    const nextY = (doc.lastAutoTable?.finalY ?? cursorY + 30) + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`Liquidações Registadas (${payments.length})`, 14, nextY);

    autoTable(doc, {
      startY: nextY + 3,
      head: [['Data', 'FO', 'Cliente', 'Método', 'Referência', 'Estado', 'Valor']],
      body: payments.map((p) => [
        p.paidAt,
        p.workOrderCode,
        p.clientName,
        p.method,
        p.reference,
        p.status,
        formatCurrency(p.amount, currency),
      ]),
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [153, 27, 27],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {fillColor: [248, 250, 252]},
      columnStyles: {
        6: {halign: 'right', fontStyle: 'bold'},
      },
      margin: {left: 14, right: 14},
    });
  }

  applyPdfPageFooters(doc, settings.invoiceFooter);
  doc.save(`zercauto-relatorio-${periodKey}.pdf`);
}

export async function exportStockPdf(
  stockItems: StockItem[],
  suppliers: Supplier[],
  settings: WorkshopSettings,
  currency: CurrencyCode
): Promise<void> {
  const doc = new jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4'}) as AutoTableDoc;

  const cursorY = await applyPdfWorkshopHeader(
    doc,
    settings,
    'INVENTÁRIO DE STOCK & PEÇAS',
    `Total Referências: ${stockItems.length}  |  Moeda: ${currency}`
  );

  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

  autoTable(doc, {
    startY: cursorY,
    head: [
      [
        'SKU',
        'Peça / Referência',
        'Categoria',
        'Fornecedor',
        'Stock Atual',
        'Mínimo',
        'Custo Unit.',
        'PVP Unit.',
        'Valor Stock',
      ],
    ],
    body:
      stockItems.length > 0
        ? stockItems.map((item) => [
            item.sku,
            item.name,
            item.category,
            supplierMap.get(item.supplierId) ?? '-',
            `${formatNumberPT(item.quantity)} ${item.unit}`,
            `${formatNumberPT(item.minQuantity)} ${item.unit}`,
            formatCurrency(item.costPrice, currency),
            formatCurrency(item.salePrice, currency),
            formatCurrency(item.costPrice * item.quantity, currency),
          ])
        : [['-', 'Sem peças no catálogo', '-', '-', '-', '-', '-', '-', '-']],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {fillColor: [248, 250, 252]},
    columnStyles: {
      4: {halign: 'right'},
      5: {halign: 'right'},
      6: {halign: 'right'},
      7: {halign: 'right'},
      8: {halign: 'right', fontStyle: 'bold'},
    },
    margin: {left: 14, right: 14},
  });

  applyPdfPageFooters(doc, settings.invoiceFooter);
  doc.save(`zercauto-stock-${formatTodayPT().replace(/\//g, '-')}.pdf`);
}

export function exportWorkOrdersXlsx(
  orders: WorkOrder[],
  currency: CurrencyCode,
  filename = `zercauto-folhas-obra-${formatTodayPT().replace(/\//g, '-')}.xlsx`
): void {
  const unitLabel = currency;

  const ordersRows = orders.map((wo) => {
    const partsTotal = wo.parts.reduce((a, p) => a + p.totalPrice, 0);
    const laborTotal = wo.labor.reduce((a, l) => a + l.totalPrice, 0);
    return [
      wo.code,
      wo.openedAt,
      wo.clientName,
      wo.vehiclePlate,
      wo.vehicleLabel,
      wo.mileage,
      wo.status,
      roundForCurrency(partsTotal, currency),
      roundForCurrency(laborTotal, currency),
      roundForCurrency(wo.subtotal, currency),
      wo.ivaRate,
      roundForCurrency(wo.ivaAmount, currency),
      roundForCurrency(wo.total, currency),
      roundForCurrency(wo.cmvTotal, currency),
      wo.paymentStatus,
      wo.paymentMethod ?? '-',
      wo.diagnosis,
    ];
  });

  const itemRows: Array<Array<string | number>> = [];
  for (const wo of orders) {
    for (const part of wo.parts) {
      itemRows.push([
        wo.code,
        'Peça',
        part.sku,
        part.name,
        part.quantity,
        part.unit,
        roundForCurrency(part.unitCost, currency),
        roundForCurrency(part.unitPrice, currency),
        roundForCurrency(part.totalPrice, currency),
      ]);
    }
    for (const lab of wo.labor) {
      itemRows.push([
        wo.code,
        'Mão de Obra',
        lab.technicianName || '-',
        lab.description,
        lab.hours,
        'h',
        0,
        roundForCurrency(lab.hourlyRate, currency),
        roundForCurrency(lab.totalPrice, currency),
      ]);
    }
  }

  downloadXlsxWorkbook(filename, [
    {
      name: 'Folhas de Obra',
      headers: [
        'Folha de Obra',
        'Data Abertura',
        'Cliente',
        'Matrícula',
        'Viatura',
        'Quilometragem',
        'Estado',
        `Peças (${unitLabel})`,
        `Mão de Obra (${unitLabel})`,
        `Subtotal (${unitLabel})`,
        'IVA (%)',
        `Valor IVA (${unitLabel})`,
        `Total (${unitLabel})`,
        `CMV Peças (${unitLabel})`,
        'Estado Pagamento',
        'Método',
        'Diagnóstico',
      ],
      rows: ordersRows,
    },
    {
      name: 'Peças e Mão de Obra',
      headers: [
        'Folha de Obra',
        'Tipo',
        'SKU / Técnico',
        'Descrição',
        'Qtd / Horas',
        'Unidade',
        `Custo Unit. (${unitLabel})`,
        `Preço Unit. (${unitLabel})`,
        `Total (${unitLabel})`,
      ],
      rows: itemRows,
    },
  ]);
}

export function exportFinancialReportXlsx(
  periodKey: string,
  periodLabel: string,
  orders: WorkOrder[],
  payments: PaymentRecord[],
  currency: CurrencyCode
): void {
  const unitLabel = currency;
  const totalBilled = orders.reduce((acc, w) => acc + w.total, 0);
  const totalPaid = orders
    .filter((w) => w.paymentStatus === 'Liquidado')
    .reduce((acc, w) => acc + w.total, 0);
  const totalPending = totalBilled - totalPaid;
  const totalParts = orders.reduce(
    (acc, w) => acc + w.parts.reduce((pAcc, p) => pAcc + p.totalPrice, 0),
    0
  );
  const totalLabor = orders.reduce(
    (acc, w) => acc + w.labor.reduce((lAcc, l) => lAcc + l.totalPrice, 0),
    0
  );
  const totalIva = orders.reduce((acc, w) => acc + w.ivaAmount, 0);
  const totalCmv = orders.reduce((acc, w) => acc + w.cmvTotal, 0);
  const totalGrossMargin = orders.reduce((acc, w) => acc + w.subtotal, 0) - totalCmv;

  downloadXlsxWorkbook(`zercauto-relatorio-${periodKey}.xlsx`, [
    {
      name: 'Resumo Financeiro',
      headers: ['Indicador', `Valor (${unitLabel})`],
      rows: [
        ['Período Analisado', periodLabel],
        ['Nº Folhas de Obra', orders.length],
        ['Total Faturado (c/ IVA)', roundForCurrency(totalBilled, currency)],
        ['Total Recebido / Liquidado', roundForCurrency(totalPaid, currency)],
        ['Saldo Pendente', roundForCurrency(totalPending, currency)],
        ['Receita de Peças', roundForCurrency(totalParts, currency)],
        ['Receita de Mão de Obra', roundForCurrency(totalLabor, currency)],
        ['IVA Liquidado', roundForCurrency(totalIva, currency)],
        ['CMV Peças (Custo)', roundForCurrency(totalCmv, currency)],
        ['Margem Bruta Estimada', roundForCurrency(totalGrossMargin, currency)],
      ],
    },
    {
      name: 'Folhas de Obra',
      headers: [
        'Folha de Obra',
        'Data',
        'Cliente',
        'Matrícula',
        'Estado',
        `Peças (${unitLabel})`,
        `Mão de Obra (${unitLabel})`,
        `IVA (${unitLabel})`,
        `Total (${unitLabel})`,
        `CMV Peças (${unitLabel})`,
        'Estado Pagamento',
        'Método',
      ],
      rows: orders.map((wo) => [
        wo.code,
        wo.openedAt,
        wo.clientName,
        wo.vehiclePlate,
        wo.status,
        roundForCurrency(
          wo.parts.reduce((a, p) => a + p.totalPrice, 0),
          currency
        ),
        roundForCurrency(
          wo.labor.reduce((a, l) => a + l.totalPrice, 0),
          currency
        ),
        roundForCurrency(wo.ivaAmount, currency),
        roundForCurrency(wo.total, currency),
        roundForCurrency(wo.cmvTotal, currency),
        wo.paymentStatus,
        wo.paymentMethod ?? '-',
      ]),
    },
    {
      name: 'Pagamentos',
      headers: ['Data', 'Folha de Obra', 'Cliente', 'Método', 'Referência', 'Estado', `Valor (${unitLabel})`],
      rows: payments.map((p) => [
        p.paidAt,
        p.workOrderCode,
        p.clientName,
        p.method,
        p.reference,
        p.status,
        roundForCurrency(p.amount, currency),
      ]),
    },
  ]);
}

export function exportStockXlsx(
  stockItems: StockItem[],
  movements: StockMovement[],
  suppliers: Supplier[],
  currency: CurrencyCode
): void {
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const unitLabel = currency;

  downloadXlsxWorkbook(`zercauto-stock-${formatTodayPT().replace(/\//g, '-')}.xlsx`, [
    {
      name: 'Inventário de Peças',
      headers: [
        'SKU',
        'Peça',
        'Categoria',
        'Fornecedor',
        'Stock Atual',
        'Stock Mínimo',
        'Unidade',
        'Estado',
        `Custo Unit. (${unitLabel})`,
        `PVP Unit. (${unitLabel})`,
        `Valor Stock Custo (${unitLabel})`,
      ],
      rows: stockItems.map((item) => [
        item.sku,
        item.name,
        item.category,
        supplierMap.get(item.supplierId) ?? '-',
        item.quantity,
        item.minQuantity,
        item.unit,
        item.quantity <= item.minQuantity ? 'Stock Crítico' : 'Normal',
        roundForCurrency(item.costPrice, currency),
        roundForCurrency(item.salePrice, currency),
        roundForCurrency(item.costPrice * item.quantity, currency),
      ]),
    },
    {
      name: 'Movimentos de Stock',
      headers: ['Data', 'Tipo', 'SKU', 'Peça', 'Quantidade', 'Unidade', 'Referência'],
      rows: movements.map((m) => [
        m.createdAt,
        m.type === 'entrada' ? 'Entrada' : 'Saída',
        m.sku,
        m.itemName,
        m.quantity,
        m.unit,
        m.reference,
      ]),
    },
    {
      name: 'Fornecedores',
      headers: ['Nome', 'Especialidade', 'Telefone', 'Email', 'Prazo Entrega'],
      rows: suppliers.map((s) => [s.name, s.specialty, s.phone, s.email, s.deliveryEta]),
    },
  ]);
}

export function exportClientsVehiclesXlsx(clients: Client[], vehicles: Vehicle[]): void {
  const clientMap = new Map(clients.map((c) => [c.id, c.name]));

  downloadXlsxWorkbook(`zercauto-clientes-viaturas-${formatTodayPT().replace(/\//g, '-')}.xlsx`, [
    {
      name: 'Clientes',
      headers: ['Nome', 'NIF', 'Telefone', 'Email', 'Morada', 'Data Registo', 'Notas'],
      rows: clients.map((c) => [
        c.name,
        c.nif,
        c.phone,
        c.email,
        c.address,
        c.createdAt,
        c.notes ?? '',
      ]),
    },
    {
      name: 'Viaturas',
      headers: ['Matrícula', 'Cliente', 'Marca', 'Modelo', 'Ano', 'VIN / Chassis', 'Quilometragem (km)'],
      rows: vehicles.map((v) => [
        v.plate,
        clientMap.get(v.clientId) ?? '-',
        v.brand,
        v.model,
        v.year,
        v.vin,
        v.mileage,
      ]),
    },
  ]);
}

// ----------------------------------------------------------------------------
// Inventário Físico & Relatório de Alterações (Acertos de Stock)
// ----------------------------------------------------------------------------

export interface InventoryCountImportResult {
  matchedCounts: Record<string, string>;
  matchedNotes: Record<string, string>;
  matchedTotal: number;
  blankRows: number;
  unknownSkus: string[];
  invalidRows: string[];
}

export interface InventoryAdjustmentReportData {
  reference: string;
  executedAt: string;
  responsibleName: string;
  totalCatalogItems: number;
  totalCountedItems: number;
  adjustments: InventoryAdjustmentAppliedItem[];
}

function normalizeHeaderKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function exportInventoryCountSheetXlsx(
  stockItems: StockItem[],
  suppliers: Supplier[]
): void {
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const sortedItems = [...stockItems].sort((a, b) => a.sku.localeCompare(b.sku));

  downloadXlsxWorkbook(`zercauto-mapa-inventario-${formatTodayPT().replace(/\//g, '-')}.xlsx`, [
    {
      name: 'Mapa Inventário',
      headers: [
        'SKU',
        'Peça / Descrição',
        'Categoria',
        'Fornecedor',
        'Unidade',
        'Stock Sistema',
        'Contagem Física',
        'Observações',
      ],
      rows: sortedItems.map((item) => [
        item.sku,
        item.name,
        item.category,
        supplierMap.get(item.supplierId) ?? item.supplierName ?? '-',
        item.unit,
        item.quantity,
        '',
        '',
      ]),
    },
    {
      name: 'Instruções',
      headers: ['Passo', 'Descrição do Procedimento'],
      rows: [
        ['1', 'Efetue a contagem física no armazém e preencha apenas a coluna "Contagem Física".'],
        ['2', 'Não altere a coluna "SKU", pois é usada para identificar cada peça na importação.'],
        ['3', 'Linhas com "Contagem Física" vazia serão ignoradas (sem alteração de stock).'],
        ['4', 'Pode usar a coluna "Observações" para registar motivos (ex: quebra, devolução, erro).'],
        ['5', 'Guarde o ficheiro (.xlsx) e importe-o em Stock & Fornecedores > Inventário.'],
      ],
    },
  ]);
}

export async function exportInventoryCountSheetPdf(
  stockItems: StockItem[],
  suppliers: Supplier[],
  settings: WorkshopSettings
): Promise<void> {
  const doc = new jsPDF({orientation: 'portrait', unit: 'mm', format: 'a4'}) as AutoTableDoc;
  const pageWidth = doc.internal.pageSize.getWidth();
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const sortedItems = [...stockItems].sort((a, b) => a.sku.localeCompare(b.sku));

  const cursorY = await applyPdfWorkshopHeader(
    doc,
    settings,
    'MAPA DE CONTAGEM PARA INVENTÁRIO',
    `Referências: ${sortedItems.length}  |  Conferência Física de Armazém`
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Responsável pela contagem: ______________________________________   Data contagem: ____/____/______',
    14,
    cursorY
  );

  autoTable(doc, {
    startY: cursorY + 5,
    head: [['SKU', 'Peça / Descrição', 'Fornecedor', 'Un.', 'Stock Sist.', 'Contagem Física', 'Observações']],
    body:
      sortedItems.length > 0
        ? sortedItems.map((item) => [
            item.sku,
            item.name,
            supplierMap.get(item.supplierId) ?? item.supplierName ?? '-',
            item.unit,
            formatNumberPT(item.quantity),
            '',
            '',
          ])
        : [['-', 'Sem peças no catálogo', '-', '-', '-', '-', '-']],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.6,
      textColor: [15, 23, 42],
      lineColor: [148, 163, 184],
      lineWidth: 0.25,
      minCellHeight: 8,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {fillColor: [248, 250, 252]},
    columnStyles: {
      0: {cellWidth: 23, fontStyle: 'bold'},
      1: {cellWidth: 50},
      2: {cellWidth: 32},
      3: {cellWidth: 11, halign: 'center'},
      4: {cellWidth: 19, halign: 'right'},
      5: {cellWidth: 24, halign: 'center'},
      6: {cellWidth: 'auto'},
    },
    margin: {left: 14, right: 14},
  });

  const finalY = Math.min(272, (doc.lastAutoTable?.finalY ?? cursorY + 40) + 12);
  if (finalY < 275) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Assinatura Conferente: ____________________________', 14, finalY);
    doc.text('Aprovação Direção: ____________________________', pageWidth - 14, finalY, {
      align: 'right',
    });
  }

  applyPdfPageFooters(doc, settings.invoiceFooter);
  doc.save(`zercauto-mapa-inventario-${formatTodayPT().replace(/\//g, '-')}.pdf`);
}

export async function parseInventoryCountFile(
  file: File,
  stockItems: StockItem[]
): Promise<InventoryCountImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {type: 'array'});
  const targetSheetName =
    workbook.SheetNames.find((name) => !normalizeHeaderKey(name).includes('instru')) ??
    workbook.SheetNames[0];

  if (!targetSheetName) {
    throw new Error('O ficheiro não contém nenhuma folha de cálculo válida.');
  }

  const sheet = workbook.Sheets[targetSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {defval: ''});
  if (rawRows.length === 0) {
    throw new Error('A folha selecionada está vazia.');
  }

  const bySku = new Map<string, StockItem>();
  const byName = new Map<string, StockItem>();
  for (const item of stockItems) {
    bySku.set(item.sku.trim().toUpperCase(), item);
    byName.set(item.name.trim().toLowerCase(), item);
  }

  const matchedCounts: Record<string, string> = {};
  const matchedNotes: Record<string, string> = {};
  const unknownSkus: string[] = [];
  const invalidRows: string[] = [];
  let blankRows = 0;
  let matchedTotal = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const normalizedEntries = new Map<string, unknown>();
    for (const [k, v] of Object.entries(rawRow)) {
      normalizedEntries.set(normalizeHeaderKey(k), v);
    }

    const skuVal = String(
      normalizedEntries.get('sku') ??
        normalizedEntries.get('codigo sku') ??
        normalizedEntries.get('codigo') ??
        ''
    ).trim();
    const nameVal = String(
      normalizedEntries.get('peca descricao') ??
        normalizedEntries.get('peca') ??
        normalizedEntries.get('nome') ??
        normalizedEntries.get('descricao') ??
        ''
    ).trim();

    if (!skuVal && !nameVal) {
      continue;
    }

    const countRaw =
      normalizedEntries.get('contagem fisica') ??
      normalizedEntries.get('contagem') ??
      normalizedEntries.get('qtd contada') ??
      normalizedEntries.get('quantidade contada') ??
      normalizedEntries.get('quantidade fisica') ??
      normalizedEntries.get('stock contado') ??
      normalizedEntries.get('stock fisico');

    const countStr = String(countRaw ?? '').trim();
    if (!countStr) {
      blankRows++;
      continue;
    }

    const parsedNum = Number(countStr.replace(/\s+/g, '').replace(',', '.'));
    if (Number.isNaN(parsedNum) || parsedNum < 0) {
      invalidRows.push(skuVal || nameVal || `Linha ${i + 2}`);
      continue;
    }

    const matchedItem =
      (skuVal ? bySku.get(skuVal.toUpperCase()) : undefined) ??
      (nameVal ? byName.get(nameVal.toLowerCase()) : undefined);

    if (!matchedItem) {
      unknownSkus.push(skuVal || nameVal);
      continue;
    }

    matchedCounts[matchedItem.id] = String(Number(parsedNum.toFixed(2)));
    matchedTotal++;

    const noteRaw = String(
      normalizedEntries.get('observacoes') ??
        normalizedEntries.get('observacao') ??
        normalizedEntries.get('notas') ??
        ''
    ).trim();
    if (noteRaw) {
      matchedNotes[matchedItem.id] = noteRaw;
    }
  }

  return {
    matchedCounts,
    matchedNotes,
    matchedTotal,
    blankRows,
    unknownSkus,
    invalidRows,
  };
}

export async function exportInventoryAdjustmentsReportPdf(
  report: InventoryAdjustmentReportData,
  settings: WorkshopSettings,
  currency: CurrencyCode
): Promise<void> {
  const doc = new jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4'}) as AutoTableDoc;
  const pageWidth = doc.internal.pageSize.getWidth();

  let cursorY = await applyPdfWorkshopHeader(
    doc,
    settings,
    `RELATÓRIO DE ACERTO DE INVENTÁRIO`,
    `Ref.: ${report.reference}  |  Responsável: ${report.responsibleName}`
  );

  const surplusItems = report.adjustments.filter((a) => a.difference > 0);
  const shortageItems = report.adjustments.filter((a) => a.difference < 0);
  const surplusValue = surplusItems.reduce((acc, a) => acc + a.costImpact, 0);
  const shortageValue = shortageItems.reduce((acc, a) => acc + Math.abs(a.costImpact), 0);
  const netValue = report.adjustments.reduce((acc, a) => acc + a.costImpact, 0);

  const cardGap = 4;
  const cardWidth = (pageWidth - 28 - cardGap * 3) / 4;
  const kpis = [
    {
      label: 'SKUs Ajustados / Contados',
      value: `${report.adjustments.length} / ${report.totalCountedItems}`,
    },
    {
      label: `Sobras (+${surplusItems.length} SKUs)`,
      value: `+${formatCurrency(surplusValue, currency)}`,
    },
    {
      label: `Quebras (-${shortageItems.length} SKUs)`,
      value: `-${formatCurrency(shortageValue, currency)}`,
    },
    {
      label: 'Impacto Líquido (Custo)',
      value: `${netValue >= 0 ? '+' : '-'}${formatCurrency(Math.abs(netValue), currency)}`,
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = 14 + idx * (cardWidth + cardGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, cursorY, cardWidth, 16, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(kpi.label, x + 3.5, cursorY + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.value, x + 3.5, cursorY + 12.5);
  });

  cursorY += 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Alterações Aplicadas ao Stock (${report.adjustments.length}) · Executado em ${new Date(
      report.executedAt
    ).toLocaleString('pt-PT')}`,
    14,
    cursorY
  );

  autoTable(doc, {
    startY: cursorY + 3,
    head: [
      [
        'SKU',
        'Peça',
        'Stock Anterior',
        'Contagem Física',
        'Acerto',
        'Movimento',
        'Impacto Custo',
        'Observações',
      ],
    ],
    body:
      report.adjustments.length > 0
        ? report.adjustments.map((adj) => [
            adj.sku,
            adj.name,
            `${formatNumberPT(adj.previousQuantity)} ${adj.unit}`,
            `${formatNumberPT(adj.countedQuantity)} ${adj.unit}`,
            `${adj.difference > 0 ? '+' : ''}${formatNumberPT(adj.difference)} ${adj.unit}`,
            adj.movementType === 'entrada' ? 'Entrada (+)' : 'Saída (-)',
            `${adj.costImpact >= 0 ? '+' : '-'}${formatCurrency(Math.abs(adj.costImpact), currency)}`,
            adj.note || '-',
          ])
        : [['-', 'Sem divergências aplicadas', '-', '-', '-', '-', '-', '-']],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {fillColor: [248, 250, 252]},
    columnStyles: {
      2: {halign: 'right'},
      3: {halign: 'right'},
      4: {halign: 'right', fontStyle: 'bold'},
      6: {halign: 'right', fontStyle: 'bold'},
    },
    margin: {left: 14, right: 14},
  });

  applyPdfPageFooters(doc, settings.invoiceFooter);
  const safeRef = report.reference.replace(/[^a-zA-Z0-9_-]/g, '-');
  doc.save(`zercauto-relatorio-inventario-${safeRef}.pdf`);
}

export function exportInventoryAdjustmentsReportXlsx(
  report: InventoryAdjustmentReportData,
  currency: CurrencyCode
): void {
  const unitLabel = currency;
  const surplusItems = report.adjustments.filter((a) => a.difference > 0);
  const shortageItems = report.adjustments.filter((a) => a.difference < 0);
  const surplusValue = surplusItems.reduce((acc, a) => acc + a.costImpact, 0);
  const shortageValue = shortageItems.reduce((acc, a) => acc + Math.abs(a.costImpact), 0);
  const netValue = report.adjustments.reduce((acc, a) => acc + a.costImpact, 0);
  const safeRef = report.reference.replace(/[^a-zA-Z0-9_-]/g, '-');

  downloadXlsxWorkbook(`zercauto-relatorio-inventario-${safeRef}.xlsx`, [
    {
      name: 'Resumo Inventário',
      headers: ['Indicador', 'Valor'],
      rows: [
        ['Referência do Inventário', report.reference],
        ['Data / Hora Execução', new Date(report.executedAt).toLocaleString('pt-PT')],
        ['Responsável', report.responsibleName],
        ['Total SKUs em Catálogo', report.totalCatalogItems],
        ['Total SKUs Contados', report.totalCountedItems],
        ['Total SKUs Ajustados', report.adjustments.length],
        [`Sobras em Valor Custo (${unitLabel})`, roundForCurrency(surplusValue, currency)],
        [`Quebras em Valor Custo (${unitLabel})`, roundForCurrency(-shortageValue, currency)],
        [`Impacto Líquido Custo (${unitLabel})`, roundForCurrency(netValue, currency)],
      ],
    },
    {
      name: 'Alterações Aplicadas',
      headers: [
        'SKU',
        'Peça',
        'Unidade',
        'Stock Anterior',
        'Contagem Física',
        'Diferença (Acerto)',
        'Tipo Movimento',
        `Custo Unit. (${unitLabel})`,
        `Impacto Custo (${unitLabel})`,
        'Observações',
      ],
      rows: report.adjustments.map((adj) => [
        adj.sku,
        adj.name,
        adj.unit,
        adj.previousQuantity,
        adj.countedQuantity,
        adj.difference,
        adj.movementType === 'entrada' ? 'Entrada (Sobra)' : 'Saída (Quebra)',
        roundForCurrency(adj.costPrice, currency),
        roundForCurrency(adj.costImpact, currency),
        adj.note ?? '',
      ]),
    },
  ]);
}

export async function exportCustomTablePdf(
  title: string,
  subtitle: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  settings: WorkshopSettings,
  filename: string
): Promise<void> {
  const doc = new jsPDF() as AutoTableDoc;
  const startY = await applyPdfWorkshopHeader(doc, settings, title, subtitle);

  autoTable(doc, {
    startY: startY + 4,
    head: [headers],
    body: rows.length > 0 ? rows : [['-', 'Sem registos para exportar', '-']],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {fillColor: [248, 250, 252]},
    margin: {left: 14, right: 14},
  });

  applyPdfPageFooters(doc, settings.invoiceFooter);
  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}


