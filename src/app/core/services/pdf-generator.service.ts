import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EVENT_TYPE_LABELS } from '../config/defaults';
import { AppSettings, Quote } from '../models';

const ROSE: [number, number, number] = [228, 143, 134];
const INK: [number, number, number] = [43, 38, 34];
const MUTED: [number, number, number] = [107, 98, 89];

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

@Injectable({ providedIn: 'root' })
export class PdfGeneratorService {
  generate(quote: Quote, settings: AppSettings): void {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const M = 18;
    const p = settings.provider;

    // Logo (monograma dibujado) + datos del proveedor
    doc.setFillColor(...ROSE);
    doc.circle(M + 8, 24, 8, 'F');
    doc.setTextColor(255, 255, 255).setFont('times', 'bolditalic').setFontSize(16);
    doc.text(p.name.trim().charAt(0).toUpperCase() || 'A', M + 8, 26.5, { align: 'center' });

    doc.setTextColor(...INK).setFont('times', 'bold').setFontSize(15);
    doc.text(p.name, M + 20, 22);
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED);
    doc.text([`CIF/NIF: ${p.cifNif}`, p.address, `${p.email} · ${p.phone}`], M + 20, 27);

    // Nº y fecha
    doc.setTextColor(...ROSE).setFont('times', 'bold').setFontSize(20);
    doc.text('PRESUPUESTO', W - M, 20, { align: 'right' });
    doc.setTextColor(...INK).setFont('helvetica', 'normal').setFontSize(9);
    doc.text(`Nº ${quote.quoteNumber}`, W - M, 27, { align: 'right' });
    doc.text(`Fecha de emisión: ${fmtDate(quote.createdAt)}`, W - M, 32, { align: 'right' });

    doc.setDrawColor(...ROSE).setLineWidth(0.5).line(M, 40, W - M, 40);

    // Cliente y evento
    const e = quote.event;
    const typeLabel =
      e.type === 'especial' && e.customTypeDescription
        ? `${EVENT_TYPE_LABELS.especial} (${e.customTypeDescription})`
        : EVENT_TYPE_LABELS[e.type];

    const block = (title: string, rows: [string, string][], x: number, w: number) => {
      doc.setFont('times', 'bold').setFontSize(12).setTextColor(...INK);
      doc.text(title, x, 49);
      doc.setFontSize(9);
      let y = 55;
      for (const [k, v] of rows) {
        doc.setFont('helvetica', 'bold').setTextColor(...MUTED).text(`${k}:`, x, y);
        doc.setFont('helvetica', 'normal').setTextColor(...INK);
        const lines = doc.splitTextToSize(v, w - 24);
        doc.text(lines, x + 24, y);
        y += 5 * lines.length;
      }
    };
    const half = (W - 2 * M) / 2;
    block('Cliente', [
      ['Nombre', quote.client.fullName],
      ['Teléfono', quote.client.phone],
      ['Email', quote.client.email],
    ], M, half);
    block('Evento', [
      ['Tipo', typeLabel],
      ['Fecha', fmtDate(e.date)],
      ['Lugar', e.location],
      ['Invitados', String(e.guestCount)],
      ['Duración', `${e.durationHours} horas`],
    ], M + half + 4, half - 4);

    // Tabla de conceptos
    const body: string[][] = [
      [
        `Servicio de ilustración en vivo\n${e.durationHours} h × ${eur(quote.appliedHourlyRate)}/h`,
        eur(quote.subtotalHours),
      ],
    ];
    if (e.extraPostIllustrations) {
      body.push(['Extra: ilustraciones a posteriori', 'A consultar']);
    }
    body.push(['Desplazamiento', eur(quote.travelCost)]);

    autoTable(doc, {
      startY: 90,
      head: [['Concepto', 'Importe']],
      body,
      foot: [['Total presupuesto', eur(quote.totalAmount)]],
      theme: 'plain',
      styles: { fontSize: 9.5, cellPadding: 3, textColor: INK },
      headStyles: { fillColor: ROSE, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [251, 234, 232], textColor: INK, fontStyle: 'bold', fontSize: 11 },
      columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
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
      `• Cuenta bancaria para la transferencia: ${p.bankAccount}`,
    ]);
    if (settings.pdfObservations?.trim()) {
      section('Observaciones', [settings.pdfObservations]);
    }

    doc.save(`${quote.quoteNumber}.pdf`);
  }
}
