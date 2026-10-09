# CLAUDE.md - Proyecto: App de Gestión de Eventos e Ilustraciones en Vivo

## 1. Visión General del Proyecto
Aplicación Web Frontend para un servicio profesional de **ilustraciones en vivo para eventos** (bodas, bautizos, comuniones, cumpleaños, etc.). 

La plataforma consta de 3 secciones principales:
1. **Landing Page:** Presentación de servicios, portafolio e información general.
2. **Formulario de Solicitud de Presupuesto:** Captura interactiva de los datos del evento y cliente.
3. **Panel de Administración (Protegido):** Gestión de presupuestos recibidos, configuración de tarifas/proveedor y generación instantánea de PDFs comerciales.

---

## 2. Stack Tecnológico & Arquitectura
- **Framework Frontend:** Angular (versión 17+ utilizando Standalone Components, Control Flow sintaxis `@if`, `@for`, y Signals para reactividad).
- **Estilos:** Tailwind CSS.
- **Backend / Base de Datos:** Firebase (Firestore para persistencia de datos, Firebase Auth para el panel de administración, Firebase Hosting para despliegue).
- **Generación de PDF:** Puramente en cliente/browser mediante `jspdf` + `jspdf-autotable` (o `pdfmake`).
- **Arquitectura:** Single Page Application (SPA) 100% Frontend Serverless.

---

## 3. Estructura del Proyecto (Angular Layout)
src/
├── app/
│   ├── core/
│   │   ├── guards/          # AuthGuard para el panel de administración
│   │   ├── models/          # Interfaces TypeScript (Quote, Event, Settings, Client)
│   │   ├── services/        # Firebase Service, Quote Calculator Service, PDF Generator Service
│   │   └── config/          # Constantes y valores por defecto
│   ├── features/
│   │   ├── landing/         # Landing Page pública
│   │   ├── form/            # Formulario de solicitud de presupuesto
│   │   └── admin/           # Panel de administración
│   │       ├── dashboard/   # Lista/Tabla de presupuestos
│   │       ├── detail/      # Vista detallada y edición (desplazamiento)
│   │       ├── settings/    # Configuración de tarifas, datos proveedor, numeración
│   │       └── login/       # Login para administradores
│   ├── shared/
│   │   ├── components/      # UI components reusable (Header, Footer, Inputs, Badges, Modals)
│   │   └── pipes/           # EuroCurrencyPipe, EventTypePipe
│   ├── app.routes.ts        # Enrutado con Lazy Loading por Feature
│   └── app.config.ts        # Firebase Init, Providers

---

## 4. Modelo de Datos (TypeScript Models)

### `Settings` (`configuracion`)
```typescript
export interface PricingTier {
  minGuests: number;
  maxGuests: number | null; // null representa sin límite superior (ej: >150)
  pricePerHour: number;     // Por defecto: <=100 -> 150€, 101-150 -> 160€, >150 -> 170€
}

/** Datos comunes del estudio (aparecen una sola vez en el PDF). */
export interface StudioInfo {
  name: string;
  address: string; // Dirección genérica y única (la del estudio)
  email: string;   // Email común de contacto
}

/** Cada proveedora (son dos, trabajan juntas). */
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
  days: number;    // Días de validez desde la emisión (por defecto 30)
}

export interface AppSettings {
  initialQuoteNumber: number; // Ej: 1 (se reinicia o formatea según año ej: PRES-2026-001)
  currentYear: number;
  studio: StudioInfo;
  providers: ProviderPerson[]; // Las dos proveedoras
  pricingTiers: PricingTier[];
  earlyBooking: EarlyBookingDefaults;
  logo?: string;           // Data URL para el PDF (opcional, se guarda en settings/private)
  pdfObservations: string;   // Texto libre de observaciones legales o informativas
}

export type EventType = 'boda' | 'bautizo' | 'comunion' | 'cumpleanos' | 'especial';

export interface ClientData {
  fullName: string;
  phone: string;
  email: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
}

export interface EventDetails {
  type: EventType;
  customTypeDescription?: string; // Requerido si type === 'especial'
  date: string;                   // ISO Format YYYY-MM-DD
  location: string;
  durationHours: number;          // Mínimo 2h, Máximo 6h (pasos de 1h)
  guestCount: number;
  extraPostIllustrations: boolean; // Extra opcional
  description?: string;           // Descripción opcional del evento
}

export interface Quote {
  id?: string;
  quoteNumber: string;            // Identificador único (ej: PRES-2026-001)
  createdAt: Date | string;
  client: ClientData;
  event: EventDetails;
  earlyBooking?: { percent: number; deadline: string } | null; // Reserva temprana (activa por defecto; null = desactivada)
  
  // Cálculo económico
  appliedHourlyRate: number;      // Calculado según tramo de invitados
  subtotalHours: number;          // durationHours * appliedHourlyRate
  travelCost: number;             // Desplazamiento (por defecto 0 €)
  totalAmount: number;            // subtotalHours + travelCost
  status: 'pendiente' | 'aceptado' | 'rechazado';
}

5. Reglas de Negocio & Funcionalidades Clave
5.1. Formulario de Contacto Públicos
Tipo de evento:

Valores: boda (por defecto), bautizo, comunion, cumpleanos, especial.

Si se selecciona especial, el campo customTypeDescription pasa a ser obligatorio.

Duración del evento:

Selector/Slider de 2h a 6h en tramos de 1h (min: 2, max: 6, step: 1).

Aviso Informativo en Formulario:

Mostrar bloque destacado aclarando: "Capacidad máxima: 10 ilustraciones/hora. Las ilustraciones pueden ser individuales, en pareja o en grupos de máximo 4 personas."

Datos obligatorios del cliente:

Nombre y apellidos.

Teléfono de contacto válido.

Correo electrónico válido.

Checkboxes obligatorios: Aceptación de Términos y Condiciones + Aceptación de LOPD y RGPD.

Acción al enviar:

Crea el documento en Firestore con estado pendiente.

Muestra modal o pantalla de confirmación/agradecimiento al cliente.

Fechas bloqueadas (disponibilidad):

Un presupuesto aceptado bloquea el día de su evento; el bloqueo se libera si cambia a otro estado o cambia la fecha.

Desde /admin/configuracion se pueden bloquear fechas a mano, también rangos (Navidades, vacaciones...), con un título opcional visible solo para el admin.

Los días bloqueados viven en la colección pública blockedDates/{YYYY-MM-DD} (solo origen, sin datos de clientes); los títulos de los rangos, en blockedRanges (solo admin). El formulario público no permite elegir esos días y las reglas de Firestore rechazan crear presupuestos para ellos.

5.2. Lógica de Precios por Hora (Configurable)
El cálculo de la tarifa por hora es automático en función del número de invitados:

Hasta 100 invitados: 150 €/h

De 101 a 150 invitados: 160 €/h

A partir de 151 invitados: 170 €/h
Nota: Estos valores deben leerse dinámicamente desde la colección/documento de Settings en Firebase.

5.3. Panel de Administración
Pestaña de Configuración (/admin/configuracion):

Ajuste del contador inicial de presupuesto del año.

Edición de los datos de contacto/fiscales del proveedor (que aparecerán en la cabecera del PDF).

Edición de observaciones fijas para el PDF.

Modificación de los tramos de precio/hora según el rango de invitados.

Tabla de Presupuestos (/admin/presupuestos):

Muestra columnas mínimas: Nº Presupuesto, Cliente, Fecha Evento, Tipo, Nº Invitados, Total €, Estado.

Filtro por estado o fecha.

Detalle de Presupuesto:

Visualización completa de los datos del cliente y evento.

Edición del concepto Desplazamiento (por defecto a 0 €).

Recálculo automático del total ((Horas * Tarifa/h) + Desplazamiento).

Botón Generar / Descargar PDF.

6. Especificaciones de Generación de PDF
El PDF se genera en el navegador a partir de los datos del presupuesto guardado:

Encabezado:

Logo de la marca/empresa.

Datos fiscales y de contacto del proveedor.

Nº de Presupuesto y Fecha de emisión.

Datos del Cliente y Evento:

Nombre cliente, teléfono, email.

Tipo de evento, fecha, lugar, nº de invitados, duración (horas).

Desglose de Conceptos (Tabla):

Servicio de ilustración en vivo (X horas x Tarifa €/h = Subtotal).

Extra de ilustraciones a posterior (si aplica).

Desplazamiento (X €).

Total Presupuesto (€).

Condiciones de Reserva y Pago (Texto obligatorio al pie):

Pago del 40% por adelantado para confirmación de la reserva.

Pago del 60% restante la semana anterior al evento, o en efectivo el mismo día del evento (bajo petición previa).

Cuenta bancaria para la transferencia.

Observaciones: Texto configurado dinámicamente desde el panel de admin.

7. Estándares de Desarrollo & Buenas Prácticas
Angular Best Practices:

Usar componentes Standalone.

Utilizar Signals para manejo de estado local y de UI.

Formularios reactivos (ReactiveFormsModule) con validaciones estrictas (Validators.required, Validators.email, Validators.min, etc.).

Diseño & UI (Tailwind):

Usar un diseño elegante, cálido y minimalista acorde a un evento social o boda (paletas pastel, tipografía cuidada).

Componentes totalmente responsivos (Mobile-first en Landing y Formulario).

Seguridad en Firebase:

Firestore Rules:

quotes: create permitido para todos (público); read, update, delete permitido solo a usuarios autenticados (request.auth != null).

settings: read público o autenticado; write solo usuarios autenticados.

# Servidor de desarrollo local
ng serve

# Compilar para producción
ng build --configuration production

# Despliegue en Firebase Hosting
firebase deploy

---

### ¿Siguientes pasos opcionales?
- Puedo ayudarte a inicializar los componentes en Angular (ej. el formulario reactivo con validaciones).
- Puedo redactar el servicio en TypeScript para la generación del PDF con `jspdf`.
- Puedo preparar las reglas de seguridad (`firestore.rules`) para Firebase.