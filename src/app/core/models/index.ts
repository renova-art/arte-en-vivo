export interface PricingTier {
  minGuests: number;
  maxGuests: number | null; // null = sin límite superior
  pricePerHour: number;
}

/** Datos comunes del estudio (aparecen una sola vez en el PDF). */
export interface StudioInfo {
  name: string;
  address: string;
  email: string; // Email común de contacto
}

/** Cada proveedora (persona) que presta el servicio. */
export interface ProviderPerson {
  name: string;
  nif: string;
  phone: string;
  bizum: boolean;      // El teléfono admite Bizum
  bankAccount: string; // Opcional ('' si no hay)
}

/** Valores por defecto del descuento por reserva temprana. */
export interface EarlyBookingDefaults {
  percent: number; // % de descuento
  days: number;    // Días de validez desde la emisión del presupuesto
}

export interface AppSettings {
  initialQuoteNumber: number;
  currentYear: number;
  studio: StudioInfo;
  providers: ProviderPerson[]; // Las dos proveedoras
  pricingTiers: PricingTier[];
  earlyBooking: EarlyBookingDefaults;
  logo?: string; // Data URL (PNG/JPEG) para el PDF; solo en el documento privado
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

export type DiscountType = 'percent' | 'amount';

/** Línea de concepto de un presupuesto: unidades × precio unitario, con descuento opcional. */
export interface QuoteLineItem {
  id: string;
  concept: string;
  units: number;
  unitPrice: number;
  discount: number; // % (0-100) o € según discountType
  discountType: DiscountType;
}

/** Fecha en la que no se aceptan nuevas solicitudes (documento público, sin datos de clientes). */
export interface BlockedDate {
  date: string; // YYYY-MM-DD (id del documento)
  source: 'quote' | 'manual';
  quoteId?: string;
  quoteNumber?: string;
  rangeId?: string; // bloqueo manual: rango al que pertenece
}

/** Rango de fechas bloqueado a mano (vacaciones, eventos propios…). Solo lo ve el admin. */
export interface BlockedRange {
  id: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD (igual a from si es un solo día)
  label: string;
}

export interface Quote {
  id?: string;
  quoteNumber: string;
  createdAt: Date | string;
  client: ClientData;
  event: EventDetails;
  // Descuento por reserva temprana (deadline: YYYY-MM-DD). undefined = presupuesto antiguo (se aplica el valor por defecto); null = desactivado.
  earlyBooking?: { percent: number; deadline: string } | null;
  lineItems?: QuoteLineItem[];    // Si falta, se derivan de los campos económicos
  appliedHourlyRate: number;
  subtotalHours: number;
  travelCost: number;
  totalAmount: number;
  status: QuoteStatus;
}
