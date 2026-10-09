import { Injectable, inject } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection,
  getFirestore,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import {
  COUNTERS_COLLECTION,
  DEFAULT_SETTINGS,
  QUOTES_COLLECTION,
  SETTINGS_COLLECTION,
  SETTINGS_DOC,
  SETTINGS_PRIVATE_DOC,
} from '../config/defaults';
import { AppSettings, ClientData, EventDetails, ProviderPerson, Quote, QuoteStatus } from '../models';
import { QuoteCalculatorService } from './quote-calculator.service';

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
    await setDoc(doc(this.db, SETTINGS_COLLECTION, SETTINGS_PRIVATE_DOC), {
      providers: settings.providers.map((p) => ({ nif: p.nif, phone: p.phone, bankAccount: p.bankAccount })),
    });
    await setDoc(doc(this.db, SETTINGS_COLLECTION, SETTINGS_DOC), { ...settings, providers: publicProviders });
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

  updateQuote(id: string, changes: Partial<Omit<Quote, 'id'>>) {
    const data = { ...changes, ...(changes.event && { event: stripUndefined(changes.event) }) };
    return updateDoc(doc(this.db, QUOTES_COLLECTION, id), data);
  }

  updateStatus(id: string, status: QuoteStatus) {
    return updateDoc(doc(this.db, QUOTES_COLLECTION, id), { status });
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

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}
