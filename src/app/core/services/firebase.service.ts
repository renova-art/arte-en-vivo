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
} from '../config/defaults';
import { AppSettings, ClientData, EventDetails, Quote, QuoteStatus } from '../models';
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
      const data = snap.data() as Partial<AppSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...data,
        provider: { ...DEFAULT_SETTINGS.provider, ...data.provider },
        pricingTiers: data.pricingTiers?.length ? data.pricingTiers : DEFAULT_SETTINGS.pricingTiers,
      };
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  saveSettings(settings: AppSettings) {
    return setDoc(doc(this.db, SETTINGS_COLLECTION, SETTINGS_DOC), settings);
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

  updateQuote(id: string, changes: { travelCost: number; totalAmount: number; status: QuoteStatus }) {
    return updateDoc(doc(this.db, QUOTES_COLLECTION, id), changes);
  }

  updateStatus(id: string, status: QuoteStatus) {
    return updateDoc(doc(this.db, QUOTES_COLLECTION, id), { status });
  }
}

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}
