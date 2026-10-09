import { Injectable } from '@angular/core';
import { PricingTier, Quote, QuoteLineItem } from '../models';

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
  // Los importes de las líneas y los descuentos se redondean a euros enteros.
  lineGross(i: QuoteLineItem): number {
    return Math.round((i.units || 0) * (i.unitPrice || 0));
  }

  lineDiscount(i: QuoteLineItem): number {
    const gross = this.lineGross(i);
    const d = Math.max(0, i.discount || 0);
    return i.discountType === 'percent' ? Math.round((gross * Math.min(d, 100)) / 100) : Math.min(gross, Math.round(d));
  }

  lineTotal(i: QuoteLineItem): number {
    return this.lineGross(i) - this.lineDiscount(i);
  }

  itemsTotal(items: QuoteLineItem[]): number {
    return items.reduce((sum, i) => sum + this.lineTotal(i), 0);
  }

  /** Líneas guardadas o, en presupuestos nuevos, las derivadas de los campos económicos. */
  getLineItems(q: Quote): QuoteLineItem[] {
    if (q.lineItems?.length) return q.lineItems;
    const base = { discount: 0, discountType: 'percent' as const };
    const items: QuoteLineItem[] = [
      {
        id: 'service',
        concept: 'Servicio de ilustración en vivo (horas)',
        units: q.event.durationHours,
        unitPrice: q.appliedHourlyRate,
        ...base,
      },
    ];
    items.push({ id: 'travel', concept: 'Desplazamiento', units: 1, unitPrice: q.travelCost, ...base });
    return items;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
