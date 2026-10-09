import { Injectable } from '@angular/core';
import { PricingTier } from '../models';

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
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
