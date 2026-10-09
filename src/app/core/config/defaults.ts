import { AppSettings, EventType } from '../models';

export const SETTINGS_COLLECTION = 'settings';
export const SETTINGS_DOC = 'general';
export const QUOTES_COLLECTION = 'quotes';
export const COUNTERS_COLLECTION = 'counters';

// Pon a true cuando haya fotos en el portafolio.
export const SHOW_PORTFOLIO = false;

export const MIN_HOURS = 2;
export const MAX_HOURS = 6;
export const MAX_ILLUSTRATIONS_PER_HOUR = 10;

export const DEFAULT_SETTINGS: AppSettings = {
  initialQuoteNumber: 1,
  currentYear: new Date().getFullYear(),
  provider: {
    name: 'Nombre del proveedor',
    cifNif: '00000000X',
    email: 'hola@ejemplo.com',
    phone: '600 000 000',
    address: 'Calle Ejemplo 1, 28000 Madrid',
    bankAccount: 'ES00 0000 0000 0000 0000 0000',
  },
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
