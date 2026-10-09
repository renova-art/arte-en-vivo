export interface PricingTier {
  minGuests: number;
  maxGuests: number | null; // null = sin límite superior
  pricePerHour: number;
}

export interface ProviderInfo {
  name: string;
  cifNif: string;
  email: string;
  phone: string;
  address: string;
  bankAccount: string;
}

export interface AppSettings {
  initialQuoteNumber: number;
  currentYear: number;
  provider: ProviderInfo;
  pricingTiers: PricingTier[];
  pdfObservations: string;
}

export type EventType = 'boda' | 'bautizo' | 'comunion' | 'cumpleanos' | 'especial';
export type QuoteStatus = 'pendiente' | 'aceptado' | 'rechazado';

export interface ClientData {
  fullName: string;
  phone: string;
  email: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
}

export interface EventDetails {
  type: EventType;
  customTypeDescription?: string;
  date: string; // YYYY-MM-DD
  location: string;
  durationHours: number;
  guestCount: number;
  extraPostIllustrations: boolean;
  description?: string;
}

export interface Quote {
  id?: string;
  quoteNumber: string;
  createdAt: Date | string;
  client: ClientData;
  event: EventDetails;
  appliedHourlyRate: number;
  subtotalHours: number;
  travelCost: number;
  totalAmount: number;
  status: QuoteStatus;
}
