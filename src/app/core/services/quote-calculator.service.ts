import { Injectable } from '@angular/core';
import { DEPOSIT_PERCENT, NIGHT_END_HOUR, NIGHT_START_HOUR } from '../config/defaults';
import { EventDetails, EventType, PricingTier, Quote, QuoteLineItem, Tariff } from '../models';

/** Importe total y su reparto entre la reserva y el resto. */
export interface PaymentSplit {
  amount: number;
  deposit: number;
  remainder: number;
}

@Injectable({ providedIn: 'root' })
export class QuoteCalculatorService {
  /** Tramos de la tarifa que corresponde al tipo de evento; si ninguna lo incluye, los de la primera. */
  tiersFor(tariffs: Tariff[], type: EventType): PricingTier[] {
    return (tariffs.find((t) => t.eventTypes.includes(type)) ?? tariffs[0])?.tiers ?? [];
  }

  getHourlyRate(guests: number, tiers: PricingTier[]): number {
    const sorted = [...tiers].sort((a, b) => a.minGuests - b.minGuests);
    const tier =
      sorted.find((t) => guests >= t.minGuests && (t.maxGuests === null || guests <= t.maxGuests)) ??
      sorted[sorted.length - 1];
    return tier?.pricePerHour ?? 0;
  }

  calculate(hours: number, guests: number, travelCost: number, tiers: PricingTier[], nightCost = 0) {
    const appliedHourlyRate = this.getHourlyRate(guests, tiers);
    const subtotalHours = round2(hours * appliedHourlyRate);
    const totalAmount = round2(subtotalHours + (travelCost || 0) + nightCost);
    return { appliedHourlyRate, subtotalHours, totalAmount };
  }

  // ---- Horario y nocturnidad ----
  private minutesOf(time: string | undefined): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(time ?? '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  /** Hora de fin (HH:mm) = hora de inicio + horas contratadas. Vacío si no hay hora de inicio. */
  endTime(startTime: string | undefined, hours: number): string {
    const start = this.minutesOf(startTime);
    if (start === null) return '';
    const end = Math.round(start + hours * 60) % (24 * 60);
    return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  }

  /** Horas de servicio dentro de la franja nocturna (de las 22:00 a las 06:00 del día siguiente). */
  nightHours(startTime: string | undefined, hours: number): number {
    const start = this.minutesOf(startTime);
    if (start === null || !hours) return 0;
    const end = start + hours * 60;
    const overlap = (from: number, to: number) => Math.max(0, Math.min(end, to) - Math.max(start, from));
    const night = overlap(0, NIGHT_END_HOUR * 60) + overlap(NIGHT_START_HOUR * 60, (24 + NIGHT_END_HOUR) * 60);
    return round2(night / 60);
  }

  /** Concepto del plus de nocturnidad. */
  nightLine(units: number, hourlyRate: number): QuoteLineItem {
    return {
      id: 'night',
      concept: `Plus de nocturnidad (horas a partir de las ${NIGHT_START_HOUR}:00)`,
      units,
      unitPrice: hourlyRate,
      earlyDiscount: false,
    };
  }

  /** Conceptos iniciales de un presupuesto: servicio, plus de nocturnidad (si procede) y desplazamiento. */
  buildLineItems(event: EventDetails, hourlyRate: number, travelCost: number, nightRate: number): QuoteLineItem[] {
    const night = this.nightHours(event.startTime, event.durationHours);
    return [
      { id: 'service', concept: 'Servicio de ilustración en vivo (horas)', units: event.durationHours, unitPrice: hourlyRate, earlyDiscount: true },
      ...(night > 0 ? [this.nightLine(night, nightRate)] : []),
      { id: 'travel', concept: 'Desplazamiento', units: 1, unitPrice: travelCost, earlyDiscount: false },
    ];
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
