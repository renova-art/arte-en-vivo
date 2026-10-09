import { Injectable } from '@angular/core';
import { DEPOSIT_PERCENT } from '../config/defaults';
import { PricingTier, Quote, QuoteLineItem } from '../models';

/** Importe total y su reparto entre la reserva y el resto. */
export interface PaymentSplit {
  amount: number;
  deposit: number;
  remainder: number;
}

@Injectable({ providedIn: 'root' })
export class QuoteCalculatorService {
  getHourlyRate(guests: number, tiers: PricingTier[]): number {
    const sorted = [...tiers].sort((a, b) => a.minGuests - b.minGuests);
    const tier =
      sorted.find((t) => guests >= t.minGuests && (t.maxGuests === null || guests <= t.maxGuests)) ??
      sorted[sorted.length - 1];
    return tier?.pricePerHour ?? 0;
  }

  calculate(hours: number, guests: number, travelCost: number, tiers: PricingTier[]) {
    const appliedHourlyRate = this.getHourlyRate(guests, tiers);
    const subtotalHours = round2(hours * appliedHourlyRate);
    const totalAmount = round2(subtotalHours + (travelCost || 0));
    return { appliedHourlyRate, subtotalHours, totalAmount };
  }

  // ---- Líneas de concepto ----
  /** Importe de la línea (unidades × precio unitario), en euros enteros. */
  lineTotal(i: QuoteLineItem): number {
    return Math.round((i.units || 0) * (i.unitPrice || 0));
  }

  itemsTotal(items: QuoteLineItem[]): number {
    return items.reduce((sum, i) => sum + this.lineTotal(i), 0);
  }

  /** Fecha límite (YYYY-MM-DD) del descuento: `days` días a partir de la emisión. */
  earlyBookingDeadline(issued: Date | string, days: number): string {
    const d = new Date(issued);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** ¿El concepto entra en el descuento por reserva temprana? Por defecto, solo el servicio de ilustración. */
  appliesEarly(i: QuoteLineItem): boolean {
    return i.earlyDiscount ?? i.id === 'service';
  }

  /** Importe del descuento: el % se aplica solo a los conceptos marcados (euros enteros). */
  earlyBookingDiscount(items: QuoteLineItem[], percent: number): number {
    const base = items.filter((i) => this.appliesEarly(i)).reduce((sum, i) => sum + this.lineTotal(i), 0);
    return Math.round((base * Math.min(Math.max(percent, 0), 100)) / 100);
  }

  /** Precio final con el descuento por reserva temprana. */
  earlyBookingPrice(items: QuoteLineItem[], percent: number): number {
    return this.itemsTotal(items) - this.earlyBookingDiscount(items, percent);
  }

  /** Reserva (40 %) y resto (60 %) de un importe; juntos suman exactamente el importe. */
  split(amount: number): PaymentSplit {
    const deposit = Math.round((amount * DEPOSIT_PERCENT) / 100);
    return { amount, deposit, remainder: amount - deposit };
  }

  /** Reparto de pagos según se reserve dentro o fuera de plazo. */
  paymentPlan(items: QuoteLineItem[], earlyPercent: number | null): { early: PaymentSplit | null; regular: PaymentSplit } {
    const total = this.itemsTotal(items);
    return {
      early: earlyPercent === null ? null : this.split(this.earlyBookingPrice(items, earlyPercent)),
      regular: this.split(total),
    };
  }

  /** Líneas guardadas o, en presupuestos nuevos, las derivadas de los campos económicos. */
  getLineItems(q: Quote): QuoteLineItem[] {
    // Se normaliza cada línea: se descartan campos antiguos (p. ej. el descuento por concepto, ya eliminado).
    if (q.lineItems?.length) {
      return q.lineItems.map((i) => ({ id: i.id, concept: i.concept, units: i.units, unitPrice: i.unitPrice, earlyDiscount: this.appliesEarly(i) }));
    }
    const items: QuoteLineItem[] = [
      {
        id: 'service',
        concept: 'Servicio de ilustración en vivo (horas)',
        units: q.event.durationHours,
        unitPrice: q.appliedHourlyRate,
        earlyDiscount: true,
      },
    ];
    items.push({ id: 'travel', concept: 'Desplazamiento', units: 1, unitPrice: q.travelCost, earlyDiscount: false });
    return items;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
