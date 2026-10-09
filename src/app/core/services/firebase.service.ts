import { Injectable, inject } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection,
  deleteField,
  getFirestore,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import {
  BLOCKED_DATES_COLLECTION,
  BLOCKED_RANGES_COLLECTION,
  MAX_BLOCK_RANGE_DAYS,
  COUNTERS_COLLECTION,
  DEFAULT_SETTINGS,
  QUOTES_COLLECTION,
  SETTINGS_COLLECTION,
  SETTINGS_DOC,
  SETTINGS_PRIVATE_DOC,
} from '../config/defaults';
import { AppSettings, BlockedDate, BlockedRange, ClientData, EventDetails, ProviderPerson, Quote, QuoteStatus } from '../models';
import { QuoteCalculatorService } from './quote-calculator.service';

/** La fecha ya está bloqueada por otro presupuesto aceptado o por un bloqueo manual. */
export class DateBlockedError extends Error {
  constructor(readonly date: string | string[]) {
    super('DATE_BLOCKED');
  }
}

@Injectable({ providedIn: 'root' })
export class FirebaseService {
  private readonly app = initializeApp(environment.firebase);
  private readonly db = getFirestore(this.app);
  private readonly auth = getAuth(this.app);
  private readonly calculator = inject(QuoteCalculatorService);

  // ---- Auth ----
  login(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  logout() {
    return signOut(this.auth);
  }

  async isLoggedIn(): Promise<boolean> {
    await this.auth.authStateReady();
    return !!this.auth.currentUser;
  }

  // ---- Settings ----
  async getSettings(): Promise<AppSettings> {
    try {
      const snap = await getDoc(doc(this.db, SETTINGS_COLLECTION, SETTINGS_DOC));
      if (!snap.exists()) return structuredClone(DEFAULT_SETTINGS);
      const { provider: legacy, ...data } = snap.data() as Partial<AppSettings> & { provider?: LegacyProvider };
      const defaults = structuredClone(DEFAULT_SETTINGS);
      // Migración: antes había un único proveedor con la dirección dentro.
      const providers = data.providers?.length
        ? data.providers
        : legacy
          ? [{ ...defaults.providers[0], name: legacy.name, nif: legacy.cifNif, phone: legacy.phone, bankAccount: legacy.bankAccount ?? '' }, defaults.providers[1]]
          : defaults.providers;
      const merged: AppSettings = {
        ...defaults,
        ...data,
        earlyBooking: { ...defaults.earlyBooking, ...data.earlyBooking },
        signature: { ...defaults.signature, ...data.signature },
        studio: { ...defaults.studio, ...(legacy && { address: legacy.address, email: legacy.email }), ...data.studio },
        providers: providers.map(({ name, nif, cifNif, phone, bizum, bankAccount }: ProviderPerson & { cifNif?: string }) => ({ name, nif: nif ?? cifNif ?? '', phone, bizum: !!bizum, bankAccount: bankAccount ?? '' })),
        pricingTiers: data.pricingTiers?.length ? data.pricingTiers : DEFAULT_SETTINGS.pricingTiers,
      };
      return await this.withPrivateData(merged);
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  /** Añade NIF, teléfono e IBAN desde el documento privado (solo si hay sesión de admin). */
  private async withPrivateData(settings: AppSettings): Promise<AppSettings> {
    await this.auth.authStateReady();
    if (!this.auth.currentUser) return settings;
    try {
      const snap = await getDoc(doc(this.db, SETTINGS_COLLECTION, SETTINGS_PRIVATE_DOC));
      const priv = (snap.data()?.['providers'] ?? []) as Partial<ProviderPerson>[];
      return {
        ...settings,
        logo: (snap.data()?.['logo'] as string | undefined) || undefined,
        providers: settings.providers.map((p, i) => ({
          ...p,
          nif: priv[i]?.nif ?? p.nif ?? '', // p.*: formato anterior, aún público
          phone: priv[i]?.phone ?? p.phone ?? '',
          bankAccount: priv[i]?.bankAccount ?? p.bankAccount ?? '',
        })),
      };
    } catch {
      return settings;
    }
  }

  /** NIF, teléfono e IBAN van a un documento privado; el público nunca los lee. */
  async saveSettings(settings: AppSettings) {
    const publicProviders = settings.providers.map((p) => ({ ...p, nif: '', phone: '', bankAccount: '' }));
    const { logo, ...general } = settings;
    await setDoc(doc(this.db, SETTINGS_COLLECTION, SETTINGS_PRIVATE_DOC), {
      providers: settings.providers.map((p) => ({ nif: p.nif, phone: p.phone, bankAccount: p.bankAccount })),
      ...(logo && { logo }), // sin logo: el campo se elimina
    });
    await setDoc(doc(this.db, SETTINGS_COLLECTION, SETTINGS_DOC), { ...general, providers: publicProviders });
  }

  // ---- Quotes ----
  /** Crea un presupuesto público con número correlativo (contador por año en transacción). */
  async createQuote(client: ClientData, event: EventDetails, settings: AppSettings): Promise<string> {
    const year = new Date().getFullYear();
    const counterRef = doc(this.db, COUNTERS_COLLECTION, String(year));
    const quoteRef = doc(collection(this.db, QUOTES_COLLECTION));
    const calc = this.calculator.calculate(event.durationHours, event.guestCount, 0, settings.pricingTiers);

    return runTransaction(this.db, async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const last = counterSnap.exists() ? (counterSnap.data()['value'] as number) : 0;
      const floor = settings.currentYear === year ? settings.initialQuoteNumber : 1;
      const next = Math.max(floor, last + 1);
      const quoteNumber = `PRES-${year}-${String(next).padStart(3, '0')}`;

      const quote: Quote = {
        quoteNumber,
        createdAt: new Date().toISOString(),
        client,
        event: stripUndefined(event),
        ...calc,
        earlyBooking:
          settings.earlyBooking.percent > 0
            ? { percent: settings.earlyBooking.percent, deadline: this.calculator.earlyBookingDeadline(new Date(), settings.earlyBooking.days) }
            : null,
        travelCost: 0,
        status: 'pendiente',
      };
      tx.set(counterRef, { value: next });
      tx.set(quoteRef, quote);
      return quoteNumber;
    });
  }

  async getQuotes(): Promise<Quote[]> {
    const snap = await getDocs(query(collection(this.db, QUOTES_COLLECTION), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Quote) }));
  }

  async getQuote(id: string): Promise<Quote | null> {
    const snap = await getDoc(doc(this.db, QUOTES_COLLECTION, id));
    return snap.exists() ? { id: snap.id, ...(snap.data() as Quote) } : null;
  }

  /**
   * Actualiza el presupuesto y mantiene el bloqueo de su fecha: un presupuesto aceptado bloquea el día del evento.
   * Lanza DateBlockedError si esa fecha ya está bloqueada por otra causa.
   */
  async updateQuote(id: string, changes: Partial<Omit<Quote, 'id'>>, previous: Quote) {
    // Los campos opcionales a undefined se eliminan del documento.
    const data: Record<string, unknown> = Object.fromEntries(
      Object.entries({ ...changes, ...(changes.event && { event: stripUndefined(changes.event) }) }).map(([k, v]) => [k, v === undefined ? deleteField() : v]),
    );
    const blockRef = (date: string) => doc(this.db, BLOCKED_DATES_COLLECTION, date);
    const prevDate = previous.status === 'aceptado' ? previous.event.date : null;
    const nextStatus = changes.status ?? previous.status;
    const nextDate = nextStatus === 'aceptado' ? (changes.event?.date ?? previous.event.date) : null;

    const batch = writeBatch(this.db);
    batch.update(doc(this.db, QUOTES_COLLECTION, id), data);
    if (prevDate && prevDate !== nextDate) {
      const snap = await getDoc(blockRef(prevDate));
      if (snap.exists() && snap.data()['quoteId'] === id) batch.delete(blockRef(prevDate)); // libera el día
    }
    if (nextDate) {
      const snap = await getDoc(blockRef(nextDate));
      if (snap.exists() && snap.data()['quoteId'] !== id) throw new DateBlockedError(nextDate);
      batch.set(blockRef(nextDate), { source: 'quote', quoteId: id, quoteNumber: previous.quoteNumber });
    }
    await batch.commit();
  }

  updateStatus(q: Quote, status: QuoteStatus) {
    return this.updateQuote(q.id!, { status }, q);
  }

  // ---- Fechas bloqueadas ----
  async getBlockedDates(): Promise<BlockedDate[]> {
    const snap = await getDocs(collection(this.db, BLOCKED_DATES_COLLECTION));
    return snap.docs.map((d) => ({ date: d.id, ...(d.data() as Omit<BlockedDate, 'date'>) }));
  }

  async getBlockedRanges(): Promise<BlockedRange[]> {
    const snap = await getDocs(collection(this.db, BLOCKED_RANGES_COLLECTION));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BlockedRange, 'id'>) }));
  }

  /**
   * Bloquea todos los días de un rango (from y to incluidos). Si algún día ya está bloqueado
   * (otro rango o un presupuesto aceptado) no se bloquea nada y se lanza DateBlockedError con esos días.
   */
  async blockRange(from: string, to: string, label: string): Promise<void> {
    const days = daysBetween(from, to);
    if (!days.length || days.length > MAX_BLOCK_RANGE_DAYS) throw new Error('INVALID_RANGE');
    const taken = new Set((await this.getBlockedDates()).map((b) => b.date));
    const conflicts = days.filter((d) => taken.has(d));
    if (conflicts.length) throw new DateBlockedError(conflicts);

    const rangeRef = doc(collection(this.db, BLOCKED_RANGES_COLLECTION));
    const batch = writeBatch(this.db);
    batch.set(rangeRef, { from, to, label: label.trim() });
    for (const day of days) {
      batch.set(doc(this.db, BLOCKED_DATES_COLLECTION, day), { source: 'manual', rangeId: rangeRef.id });
    }
    await batch.commit();
  }

  /** Elimina un rango y libera sus días. */
  async unblockRange(rangeId: string): Promise<void> {
    const days = await getDocs(query(collection(this.db, BLOCKED_DATES_COLLECTION), where('rangeId', '==', rangeId)));
    const batch = writeBatch(this.db);
    days.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(this.db, BLOCKED_RANGES_COLLECTION, rangeId));
    await batch.commit();
  }

  /** Crea el bloqueo de los presupuestos aceptados que aún no lo tengan (p. ej. aceptados antes de existir esta función). */
  async syncAcceptedBlocks(quotes: Quote[]): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const taken = new Set((await this.getBlockedDates()).map((b) => b.date));
    const batch = writeBatch(this.db);
    let pending = 0;
    for (const q of quotes) {
      if (q.status !== 'aceptado' || !q.id || q.event.date < today || taken.has(q.event.date)) continue;
      taken.add(q.event.date);
      batch.set(doc(this.db, BLOCKED_DATES_COLLECTION, q.event.date), { source: 'quote', quoteId: q.id, quoteNumber: q.quoteNumber });
      pending++;
    }
    if (pending) await batch.commit();
  }
}

interface LegacyProvider {
  name: string;
  cifNif: string;
  email: string;
  phone: string;
  address: string;
  bankAccount?: string;
}

/** Días (YYYY-MM-DD) entre dos fechas, ambas incluidas. */
export function daysBetween(from: string, to: string): string[] {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const days: string[] = [];
  for (let d = new Date(fy, fm - 1, fd), end = new Date(ty, tm - 1, td); d <= end && days.length <= MAX_BLOCK_RANGE_DAYS; d.setDate(d.getDate() + 1)) {
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return days;
}

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}
