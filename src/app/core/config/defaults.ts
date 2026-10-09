import { AppSettings, EventType } from '../models';

export const SETTINGS_COLLECTION = 'settings';
export const SETTINGS_DOC = 'general';
// Datos sensibles de las proveedoras (teléfono, IBAN): solo lectura para el admin.
export const SETTINGS_PRIVATE_DOC = 'private';
export const QUOTES_COLLECTION = 'quotes';
export const COUNTERS_COLLECTION = 'counters';
export const BLOCKED_DATES_COLLECTION = 'blockedDates';
export const BLOCKED_RANGES_COLLECTION = 'blockedRanges';
export const MAX_BLOCK_RANGE_DAYS = 366;

// Pon a true cuando haya fotos en el portafolio.
export const SHOW_PORTFOLIO = false;

export const DEPOSIT_PERCENT = 40; // Reserva; el resto (60 %) se paga antes del evento
export const MIN_HOURS = 2;
export const MAX_HOURS = 6;
export const MAX_ILLUSTRATIONS_PER_HOUR = 10;

export const DEFAULT_SETTINGS: AppSettings = {
  initialQuoteNumber: 1,
  currentYear: new Date().getFullYear(),
  studio: {
    name: 'Arte en vivo',
    address: 'Calle Ejemplo 1, 28000 Madrid',
    email: 'hola@ejemplo.com',
  },
  providers: [
    { name: 'Proveedora 1', nif: '00000000X', phone: '600 000 000', bizum: true, bankAccount: '' },
    { name: 'Proveedora 2', nif: '00000001R', phone: '600 000 001', bizum: false, bankAccount: '' },
  ],
  earlyBooking: { percent: 10, days: 30 },
  signature: { greeting: 'Atentamente,', names: '' },
  pricingTiers: [
    { minGuests: 0, maxGuests: 100, pricePerHour: 150 },
    { minGuests: 101, maxGuests: 150, pricePerHour: 160 },
    { minGuests: 151, maxGuests: null, pricePerHour: 170 },
  ],
  pdfObservations:
    'Este presupuesto tiene una validez de 30 días. Las ilustraciones se realizan en el formato y estilo acordados con el cliente.',
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  boda: 'Boda',
  bautizo: 'Bautizo',
  comunion: 'Comunión',
  cumpleanos: 'Cumpleaños',
  especial: 'Evento especial',
};
