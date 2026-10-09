import { Injectable, inject } from '@angular/core';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EVENT_TYPE_LABELS } from '../config/defaults';
import { AppSettings, ProviderPerson, Quote, QuoteLineItem } from '../models';
import { QuoteCalculatorService } from './quote-calculator.service';

const ROSE: [number, number, number] = [228, 143, 134];
const INK: [number, number, number] = [43, 38, 34];
const MUTED: [number, number, number] = [107, 98, 89];

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

@Injectable({ providedIn: 'root' })
export class PdfGeneratorService {
  private readonly calc = inject(QuoteCalculatorService);

  download(quote: Quote, settings: AppSettings): void {
    this.build(quote, settings).save(`${quote.quoteNumber}.pdf`);
  }

  /** Abre el PDF en una pestaña nueva sin descargarlo. */
  preview(quote: Quote, settings: AppSettings): void {
    const url = URL.createObjectURL(this.build(quote, settings).output('blob'));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  private build(quote: Quote, settings: AppSettings): jsPDF {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setProperties({ title: `Presupuesto ${quote.quoteNumber}` });
    const W = doc.internal.pageSize.getWidth();
    const M = 18;
    const { studio, providers } = settings;

    // Logo (monograma dibujado) + datos comunes del estudio
    doc.setFillColor(...ROSE);
    doc.circle(M + 8, 24, 8, 'F');
    doc.setTextColor(255, 255, 255).setFont('times', 'bolditalic').setFontSize(16);
    doc.text(studio.name.trim().charAt(0).toUpperCase() || 'A', M + 8, 26.5, { align: 'center' });

    doc.setTextColor(...INK).setFont('times', 'bold').setFontSize(15);
    doc.text(studio.name, M + 20, 23);
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED);
    doc.text([...doc.splitTextToSize(studio.address, W / 2 - M - 20), studio.email], M + 20, 28);

    // Nº y fecha
    doc.setTextColor(...ROSE).setFont('times', 'bold').setFontSize(20);
    doc.text('PRESUPUESTO', W - M, 20, { align: 'right' });
    doc.setTextColor(...INK).setFont('helvetica', 'normal').setFontSize(9);
    doc.text(`Nº ${quote.quoteNumber}`, W - M, 27, { align: 'right' });
    doc.text(`Fecha de emisión: ${fmtDate(quote.createdAt)}`, W - M, 32, { align: 'right' });

    doc.setDrawColor(...ROSE).setLineWidth(0.5).line(M, 40, W - M, 40);

    // Proveedoras (datos fiscales y de contacto de cada una)
    const colW = (W - 2 * M) / 2;
    let provBottom = 46;
    providers.forEach((pv, idx) => {
      const x = M + idx * colW;
      let y = 46;
      doc.setFont('times', 'bold').setFontSize(11).setTextColor(...INK).text(pv.name, x, y);
      y += 4.8;
      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED);
      for (const line of [`NIF: ${pv.nif}`, ...(pv.phone?.trim() ? [`Tel.: ${pv.phone.trim()}${pv.bizum ? ' (Bizum)' : ''}`] : [])]) {
        doc.text(line, x, y);
        y += 4.2;
      }
      provBottom = Math.max(provBottom, y);
    });
    doc.setDrawColor(228, 218, 205).setLineWidth(0.2).line(M, provBottom + 1, W - M, provBottom + 1);
    const top = provBottom + 8;

    // Cliente y evento
    const e = quote.event;
    const typeLabel =
      e.type === 'especial' && e.customTypeDescription
        ? `${EVENT_TYPE_LABELS.especial} (${e.customTypeDescription})`
        : EVENT_TYPE_LABELS[e.type];

    const block = (title: string, rows: [string, string][], x: number, w: number): number => {
      doc.setFont('times', 'bold').setFontSize(12).setTextColor(...INK);
      doc.text(title, x, top);
      doc.setFontSize(9);
      let y = top + 6;
      for (const [k, v] of rows) {
        doc.setFont('helvetica', 'bold').setTextColor(...MUTED).text(`${k}:`, x, y);
        doc.setFont('helvetica', 'normal').setTextColor(...INK);
        const lines = doc.splitTextToSize(v, w - 24);
        doc.text(lines, x + 24, y);
        y += 5 * lines.length;
      }
      return y;
    };
    const half = (W - 2 * M) / 2;
    const clientBottom = block('Cliente', [
      ['Nombre', quote.client.fullName],
      ['Teléfono', quote.client.phone],
      ['Email', quote.client.email],
    ], M, half);
    const eventBottom = block('Evento', [
      ['Tipo', typeLabel],
      ['Fecha', fmtDate(e.date)],
      ['Lugar', e.location],
      ['Invitados', String(e.guestCount)],
      ['Duración', `${e.durationHours} horas`],
    ], M + half, half);

    // Tabla de conceptos (unidades × precio, con descuentos por línea)
    const items = this.calc.getLineItems(quote);
    const hasDiscount = items.some((i) => this.calc.lineDiscount(i) > 0);
    const num = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n);
    const discountLabel = (i: QuoteLineItem) =>
      this.calc.lineDiscount(i) > 0 ? (i.discountType === 'percent' ? `${num(i.discount)} %` : `-${eur(this.calc.lineDiscount(i))}`) : '';

    const labels = ['Concepto', 'Uds.', 'Precio ud.', ...(hasDiscount ? ['Dto.'] : []), 'Importe'];
    // Las columnas numéricas se alinean a la derecha también en cabecera y pie.
    const head = labels.map((content, i) => (i === 0 ? content : { content, styles: { halign: 'right' as const } }));
    const body = items.map((i) => [
      i.concept,
      num(i.units),
      eur(i.unitPrice),
      ...(hasDiscount ? [discountLabel(i)] : []),
      eur(this.calc.lineTotal(i)),
    ]);
    const footCells = head.length - 1;

    autoTable(doc, {
      startY: Math.max(clientBottom, eventBottom) + 4,
      head: [head],
      body,
      foot: [[{ content: 'Total presupuesto', colSpan: footCells, styles: { halign: 'right' } }, { content: eur(quote.totalAmount), styles: { halign: 'right' } }]],
      theme: 'plain',
      styles: { fontSize: 9.5, cellPadding: 3, textColor: INK },
      headStyles: { fillColor: ROSE, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [251, 234, 232], textColor: INK, fontStyle: 'bold', fontSize: 11 },
      columnStyles: {
        1: { halign: 'right', cellWidth: 16 },
        2: { halign: 'right', cellWidth: 28 },
        ...(hasDiscount ? { 3: { halign: 'right', cellWidth: 24 } } : {}),
        [head.length - 1]: { halign: 'right', cellWidth: 30 },
      },
      margin: { left: M, right: M },
    });

    // Condiciones de reserva y pago
    let y = (doc as any).lastAutoTable.finalY + 12;
    const section = (title: string, lines: string[]) => {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont('times', 'bold').setFontSize(12).setTextColor(...INK).text(title, M, y);
      y += 6;
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK);
      for (const l of lines) {
        const wrapped = doc.splitTextToSize(l, W - 2 * M);
        doc.text(wrapped, M, y);
        y += 4.6 * wrapped.length + 1;
      }
      y += 4;
    };

    section('Condiciones de reserva y pago', [
      '• Pago del 40% por adelantado para la confirmación de la reserva.',
      '• Pago del 60% restante la semana anterior al evento, o en efectivo el mismo día del evento (bajo petición previa).',
      ...paymentLines(providers),
    ]);
    if (settings.pdfObservations?.trim()) {
      section('Observaciones', [settings.pdfObservations]);
    }

    return doc;
  }
}

/** Líneas de pago: cuentas (opcionales) y Bizum, según los datos de cada proveedora. */
function paymentLines(providers: ProviderPerson[]): string[] {
  const accounts = providers.filter((p) => p.bankAccount?.trim());
  const lines: string[] = [];
  if (accounts.length === 1) {
    lines.push(`• Cuenta bancaria para la transferencia: ${accounts[0].bankAccount.trim()} (${accounts[0].name})`);
  } else if (accounts.length > 1) {
    lines.push('• Cuentas bancarias para la transferencia:');
    accounts.forEach((a) => lines.push(`    - ${a.bankAccount.trim()} (${a.name})`));
  } else {
    lines.push('• Los datos para realizar la transferencia se facilitarán al confirmar la reserva.');
  }
  const bizum = providers.filter((p) => p.bizum && p.phone?.trim());
  if (bizum.length) {
    lines.push(`• Bizum disponible en: ${bizum.map((p) => `${p.name} (${p.phone})`).join(' · ')}`);
  }
  return lines;
}
