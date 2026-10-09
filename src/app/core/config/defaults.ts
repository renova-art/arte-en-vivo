import { AppSettings, EventType, PricingTier, Tariff } from '../models';

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
// Mención de exención que se añade al PDF cuando la opción está marcada.
export const VAT_EXEMPTION_TEXT =
  'Operación exenta de IVA en virtud del artículo 20.Uno.26.º de la Ley 37/1992, de 28 de diciembre, del Impuesto sobre el Valor Añadido (servicios profesionales prestados por artistas plásticos).';

// Plus de nocturnidad: horas de servicio entre las 22:00 y las 06:00.
export const NIGHT_START_HOUR = 22;
export const NIGHT_END_HOUR = 6;

export const MIN_HOURS = 2;
export const MAX_HOURS = 6;
export const MAX_ILLUSTRATIONS_PER_HOUR = 10;

const DEFAULT_TIERS: PricingTier[] = [
  { minGuests: 0, maxGuests: 100, pricePerHour: 150 },
  { minGuests: 101, maxGuests: 150, pricePerHour: 160 },
  { minGuests: 151, maxGuests: null, pricePerHour: 170 },
];

/** Tarifas iniciales a partir de unos tramos: bodas, bautizos y comuniones por un lado y cumpleaños por otro. */
export function defaultTariffs(tiers: PricingTier[]): Tariff[] {
  return [
    { id: 'general', name: 'Bodas, bautizos y comuniones', eventTypes: ['boda', 'bautizo', 'comunion'], tiers: structuredClone(tiers) },
    { id: 'cumpleanos', name: 'Cumpleaños', eventTypes: ['cumpleanos'], tiers: structuredClone(tiers) },
  ];
}

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
  nightSurcharge: 20,
  vatExempt: true,
  tariffs: defaultTariffs(DEFAULT_TIERS),
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
