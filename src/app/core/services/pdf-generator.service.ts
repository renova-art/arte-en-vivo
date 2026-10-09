import { Injectable, inject } from '@angular/core';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DEPOSIT_PERCENT, EVENT_TYPE_LABELS, VAT_EXEMPTION_TEXT } from '../config/defaults';
import { AppSettings, ProviderPerson, Quote } from '../models';
import { defaultSignatureNames } from '../config/signature';
import { QuoteCalculatorService } from './quote-calculator.service';

const ROSE: [number, number, number] = [228, 143, 134];
const INK: [number, number, number] = [43, 38, 34];
const MUTED: [number, number, number] = [107, 98, 89];

/** Densidades del maquetado: se prueba la primera y, si el PDF pasa de una página, la siguiente (más compacta). */
const DENSITIES = [
  { pad: 1.8, planPad: 1.5, gap: 6.5, row: 4.2, font: 9, titleGap: 5.5 },
  { pad: 1.4, planPad: 1.2, gap: 5.5, row: 3.9, font: 8.5, titleGap: 5 },
  { pad: 1.1, planPad: 0.9, gap: 4.5, row: 3.6, font: 8, titleGap: 4.5 },
];

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    .format(n)
    .replace(/\u00A0/g, ' '); // el espacio duro de Intl se mide distinto en jsPDF y en los visores, y desalinea las columnas

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

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

  /** Firma sobria al pie, alineada a la izquierda: despedida y nombres en texto normal. */
  private drawSignature(doc: jsPDF, M: number, y: number, settings: AppSettings, d: (typeof DENSITIES)[number]): void {
    const greeting = settings.signature?.greeting?.trim() ?? '';
    const names = settings.signature?.names?.trim() || defaultSignatureNames(settings.providers);
    const lines = [greeting, names].filter(Boolean);
    if (!lines.length) return;
    const lineHeight = d.row + 0.8;
    if (y + lineHeight * lines.length > doc.internal.pageSize.getHeight() - 10) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', 'normal').setFontSize(d.font + 1).setTextColor(...INK);
    lines.forEach((line, i) => doc.text(line, M, y + lineHeight * i));
  }

  /** Dibuja el logo ajustado a la caja (sin deformarlo). Devuelve su tamaño o null si no se pudo usar. */
  private drawLogo(doc: jsPDF, dataUrl: string, x: number, y: number, maxW: number, maxH: number): { w: number; h: number } | null {
    try {
      const props = doc.getImageProperties(dataUrl);
      const ratio = props.width / props.height;
      let h = maxH;
      let w = h * ratio;
      if (w > maxW) {
        w = maxW;
        h = w / ratio;
      }
      doc.addImage(dataUrl, props.fileType, x, y + (maxH - h) / 2, w, h);
      return { w, h };
    } catch {
      return null; // imagen corrupta: se usa el monograma
    }
  }

  /** Genera el PDF en una sola página: prueba cada densidad hasta que cabe. */
  private build(quote: Quote, settings: AppSettings): jsPDF {
    let doc!: jsPDF;
    for (let level = 0; level < DENSITIES.length; level++) {
      doc = this.render(quote, settings, level);
      if (doc.getNumberOfPages() === 1) break;
    }
    return doc;
  }

  private render(quote: Quote, settings: AppSettings, level: number): jsPDF {
    const d = DENSITIES[level];
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setProperties({ title: `Presupuesto ${quote.quoteNumber}` });
    const W = doc.internal.pageSize.getWidth();
    const M = 18;
    const { studio, providers } = settings;

    // Logo configurado (caja de 64×22 mm centrada en la cabecera, sin deformarlo) o, si no hay, monograma
    const rightBlockX = W - M - 62; // a partir de aquí van "PRESUPUESTO", el número y la fecha
    const logoDrawn = settings.logo ? this.drawLogo(doc, settings.logo, M, 14, Math.min(64, rightBlockX - M - 4), 22) : null;
    if (!logoDrawn) {
      doc.setFillColor(...ROSE);
      doc.circle(M + 9, 25.5, 9, 'F');
      doc.setTextColor(255, 255, 255).setFont('times', 'bolditalic').setFontSize(16);
      doc.text(studio.name.trim().charAt(0).toUpperCase() || 'A', M + 9, 28, { align: 'center' });
    }

    // Nº y fecha
    doc.setTextColor(...ROSE).setFont('times', 'bold').setFontSize(20);
    doc.text('PRESUPUESTO', W - M, 21, { align: 'right' });
    doc.setTextColor(...INK).setFont('helvetica', 'normal').setFontSize(9);
    doc.text(`Nº ${quote.quoteNumber}`, W - M, 28.5, { align: 'right' });
    doc.text(`Fecha de emisión: ${fmtDate(quote.createdAt)}`, W - M, 34, { align: 'right' });

    doc.setDrawColor(...ROSE).setLineWidth(0.5).line(M, 40, W - M, 40);

    // Proveedoras (datos fiscales y de contacto de cada una)
    const colW = (W - 2 * M) / 2;
    // Datos del estudio bajo la línea: nombre en negrita y, a continuación, dirección y email
    let provTop = 46;
    doc.setFont('times', 'bold').setFontSize(11).setTextColor(...INK);
    const nameWidth = doc.getTextWidth(studio.name) + 1.5;
    doc.text(studio.name, M, provTop);
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED);
    const studioLines: string[] = doc.splitTextToSize(`· ${studio.address} · ${studio.email}`, W - 2 * M - nameWidth);
    doc.text(studioLines[0], M + nameWidth, provTop);
    studioLines.slice(1).forEach((l, i) => doc.text(l, M + nameWidth, provTop + 4 * (i + 1)));
    provTop += 4 * studioLines.length + 7;
    let provBottom = provTop;
    providers.forEach((pv, idx) => {
      const x = M + idx * colW;
      let y = provTop;
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
    const top = provBottom + d.gap;

    // Cliente y evento
    const e = quote.event;
    const typeLabel =
      e.type === 'especial' && e.customTypeDescription
        ? `${EVENT_TYPE_LABELS.especial} (${e.customTypeDescription})`
        : EVENT_TYPE_LABELS[e.type];

    const block = (title: string, rows: [string, string][], x: number, w: number): number => {
      doc.setFont('times', 'bold').setFontSize(12).setTextColor(...INK);
      doc.text(title, x, top);
      doc.setFontSize(d.font);
      let y = top + d.titleGap;
      for (const [k, v] of rows) {
        doc.setFont('helvetica', 'bold').setTextColor(...MUTED).text(`${k}:`, x, y);
        doc.setFont('helvetica', 'normal').setTextColor(...INK);
        const lines = doc.splitTextToSize(v, w - 24);
        doc.text(lines, x + 24, y);
        y += d.row * lines.length + 0.4;
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
      e.startTime
        ? (['Horario', `${e.startTime} a ${this.calc.endTime(e.startTime, e.durationHours)} (${e.durationHours} h)`] as [string, string])
        : (['Duración', `${e.durationHours} horas`] as [string, string]),
    ], M + half, half);

    // Tabla de conceptos (unidades × precio)
    const items = this.calc.getLineItems(quote);
    const num = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n);

    const labels = ['Concepto', 'Uds.', 'Precio ud.', 'Importe'];
    // Las columnas numéricas se alinean a la derecha también en cabecera y pie.
    const head = labels.map((content, i) => (i === 0 ? content : { content, styles: { halign: 'right' as const } }));
    const eb = quote.earlyBooking;
    // Con reserva temprana, los conceptos a los que se aplica llevan un asterisco.
    const body = items.map((i) => [
      eb && this.calc.appliesEarly(i) ? `${i.concept} *` : i.concept,
      num(i.units),
      eur(i.unitPrice),
      eur(this.calc.lineTotal(i)),
    ]);
    const footCells = head.length - 1;
    const plan = this.calc.paymentPlan(items, eb ? eb.percent : null);

    autoTable(doc, {
      startY: Math.max(clientBottom, eventBottom) + 4,
      head: [head],
      body,
      foot: [
        [{ content: 'Total presupuesto', colSpan: footCells, styles: { halign: 'right' } }, { content: eur(quote.totalAmount), styles: { halign: 'right' } }],
        ...(eb
          ? [[
              {
                content: `Con reserva temprana (-${num(eb.percent)} %), hasta el ${fmtDate(eb.deadline)} (incluido)`,
                colSpan: footCells,
                styles: { halign: 'right' as const, fillColor: ROSE, textColor: [255, 255, 255] as [number, number, number], fontSize: d.font + 1 },
              },
              { content: eur(plan.early!.amount), styles: { halign: 'right' as const, fillColor: ROSE, textColor: [255, 255, 255] as [number, number, number] } },
            ]]
          : []),
      ],
      theme: 'plain',
      styles: { fontSize: d.font + 0.5, cellPadding: d.pad, textColor: INK },
      headStyles: { fillColor: ROSE, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [251, 234, 232], textColor: INK, fontStyle: 'bold', fontSize: d.font + 2 },
      columnStyles: {
        1: { halign: 'right', cellWidth: 16 },
        2: { halign: 'right', cellWidth: 28 },
        [head.length - 1]: { halign: 'right', cellWidth: 30 },
      },
      margin: { left: M, right: M },
    });

    // Nota de los conceptos con descuento por reserva temprana
    let afterTable: number = (doc as any).lastAutoTable.finalY;
    if (eb) {
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
      doc.text('* Concepto incluido en el descuento por reserva temprana.', M, afterTable + 5);
      afterTable += 5;
    }
    // Mención de exención de IVA (si está marcada en la configuración)
    if (settings.vatExempt) {
      doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor(...INK);
      const vatLines: string[] = doc.splitTextToSize(VAT_EXEMPTION_TEXT, W - 2 * M);
      doc.text(vatLines, M, afterTable + 5);
      afterTable += 3.4 * vatLines.length + 2;
    }

    // Importes de pago: reserva (40 %) y resto (60 %), con y sin descuento por reserva temprana
    let planY = afterTable + d.gap + 2;
    if (planY > 235) { doc.addPage(); planY = 20; }
    doc.setFont('times', 'bold').setFontSize(12).setTextColor(...INK).text('Importes de pago', M, planY);
    const dayAfter = (iso: string) => {
      const [yy, mm, dd] = iso.split('-').map(Number);
      return this.calc.earlyBookingDeadline(new Date(yy, mm - 1, dd), 1);
    };
    const splitRow = (label: string, s: { amount: number; deposit: number; remainder: number }) => [label, eur(s.amount), eur(s.deposit), eur(s.remainder)];
    autoTable(doc, {
      startY: planY + 3,
      head: [[eb ? 'Confirmación de la reserva' : 'Concepto', ...['Total', `Reserva (${DEPOSIT_PERCENT} %)`, `Resto (${100 - DEPOSIT_PERCENT} %)`].map((content) => ({ content, styles: { halign: 'right' as const } }))]],
      body: [
        ...(eb && plan.early ? [splitRow(`Hasta el ${fmtDate(eb.deadline)} (incluido)`, plan.early)] : []),
        splitRow(eb ? `A partir del ${fmtDate(dayAfter(eb.deadline))}` : 'Total del presupuesto', plan.regular),
      ],
      theme: 'plain',
      styles: { fontSize: d.font + 0.5, cellPadding: d.planPad, textColor: INK },
      headStyles: { fillColor: [251, 234, 232], textColor: INK, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right', cellWidth: 28, fontStyle: 'bold' }, 2: { halign: 'right', cellWidth: 32 }, 3: { halign: 'right', cellWidth: 32 } },
      margin: { left: M, right: M },
    });

    // Condiciones de reserva y pago
    let y = (doc as any).lastAutoTable.finalY + d.gap + 4;
    const section = (title: string, lines: string[]) => {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont('times', 'bold').setFontSize(12).setTextColor(...INK).text(title, M, y);
      y += d.titleGap;
      doc.setFont('helvetica', 'normal').setFontSize(d.font).setTextColor(...INK);
      for (const l of lines) {
        const wrapped = doc.splitTextToSize(l, W - 2 * M);
        doc.text(wrapped, M, y);
        y += d.row * wrapped.length + 1;
      }
      y += d.gap / 2;
    };

    section('Condiciones de reserva y pago', [
      `• Pago del ${DEPOSIT_PERCENT}% por adelantado para la confirmación de la reserva.`,
      `• Pago del ${100 - DEPOSIT_PERCENT}% restante la semana anterior al evento, o en efectivo el mismo día del evento (bajo petición previa).`,
      ...(eb
        ? [`• Descuento por reserva temprana: ${num(eb.percent)} % de descuento sobre los conceptos marcados con * si la reserva se confirma (con el pago del ${DEPOSIT_PERCENT} %) hasta el ${fmtDate(eb.deadline)}, incluido. A partir del día siguiente se aplica el precio sin descuento.`]
        : []),
      ...paymentLines(providers),
    ]);
    if (settings.pdfObservations?.trim()) {
      section('Observaciones', [settings.pdfObservations]);
    }
    this.drawSignature(doc, M, y, settings, d);

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
