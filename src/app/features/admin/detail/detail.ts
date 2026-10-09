import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DEFAULT_SETTINGS, DEPOSIT_PERCENT, EVENT_TYPE_LABELS } from '../../../core/config/defaults';
import { AppSettings, EventDetails, EventType, Quote, QuoteLineItem, QuoteStatus } from '../../../core/models';
import { DateBlockedError, FirebaseService } from '../../../core/services/firebase.service';
import { PdfGeneratorService } from '../../../core/services/pdf-generator.service';
import { QuoteCalculatorService } from '../../../core/services/quote-calculator.service';
import { DatePicker } from '../../../shared/components/date-picker';
import { StatusBadge } from '../../../shared/components/layout';
import { EuroCurrencyPipe } from '../../../shared/pipes/pipes';

@Component({
  selector: 'app-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePicker, StatusBadge, EuroCurrencyPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <a routerLink="/admin/presupuestos" class="text-sm text-ink-500 hover:text-ink-900">← Volver a presupuestos</a>

    @if (loading()) {
      <p class="mt-6 text-sm text-ink-500">Cargando…</p>
    } @else if (!quote()) {
      <p class="error mt-6">Presupuesto no encontrado.</p>
    } @else {
      @let q = quote()!;
      @let ev = event();
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-3xl font-semibold">{{ q.quoteNumber }} <app-status-badge [status]="status()" /></h1>
        <div class="flex items-center gap-3">
          <button type="button" class="btn-secondary" (click)="previewPdf()">Previsualizar PDF</button>
          <button type="button" class="btn-secondary" (click)="downloadPdf()">Descargar PDF</button>
        </div>
      </div>

      <div class="mt-5 grid gap-5 lg:grid-cols-3">
        <section class="card space-y-1 text-sm">
          <h2 class="mb-2 text-xl font-semibold">Cliente</h2>
          <p><span class="text-ink-500">Nombre:</span> {{ q.client.fullName }}</p>
          <p><span class="text-ink-500">Teléfono:</span>&ngsp;<a [href]="'tel:' + q.client.phone">{{ q.client.phone }}</a></p>
          <p><span class="text-ink-500">Email:</span>&ngsp;<a [href]="'mailto:' + q.client.email">{{ q.client.email }}</a></p>
          <p><span class="text-ink-500">T&C / RGPD:</span> {{ q.client.termsAccepted && q.client.privacyAccepted ? 'Aceptados' : 'No aceptados' }}</p>
          <p><span class="text-ink-500">Recibido:</span> {{ created() }}</p>
          <div class="!mt-4">
            <label class="label" for="status">Estado</label>
            <select id="status" class="input" [ngModel]="status()" (ngModelChange)="status.set($event)">
              <option value="pendiente">Pendiente</option>
              <option value="aceptado">Aceptado</option>
              <option value="rechazado">Rechazado</option>
            </select>
          </div>
        </section>

        <section class="card grid gap-3 text-sm sm:grid-cols-2 lg:col-span-2">
          <h2 class="text-xl font-semibold sm:col-span-2">Evento</h2>
          <div>
            <label class="label" for="ev-type">Tipo</label>
            <select id="ev-type" class="input" [ngModel]="ev.type" (ngModelChange)="setType($event)">
              @for (t of types; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
            </select>
          </div>
          @if (ev.type === 'especial') {
            <div>
              <label class="label" for="ev-custom">Descripción del tipo</label>
              <input id="ev-custom" class="input" [ngModel]="ev.customTypeDescription ?? ''" (ngModelChange)="patchEvent({ customTypeDescription: $event })" />
            </div>
          }
          <div>
            <label class="label" for="ev-date">Fecha</label>
            <app-date-picker inputId="ev-date" [ngModel]="ev.date" (ngModelChange)="patchEvent({ date: $event })" />
          </div>
          <div>
            <label class="label" for="ev-loc">Lugar</label>
            <input id="ev-loc" class="input" [ngModel]="ev.location" (ngModelChange)="patchEvent({ location: $event })" />
          </div>
          <div>
            <label class="label" for="ev-guests">Invitados</label>
            <input id="ev-guests" type="number" min="1" class="input" [ngModel]="ev.guestCount" (ngModelChange)="setGuests(+$event || 0)" />
          </div>
          <div>
            <label class="label" for="ev-hours">Duración (horas)</label>
            <input id="ev-hours" type="number" min="1" step="1" class="input" [ngModel]="ev.durationHours" (ngModelChange)="setDuration(+$event || 0)" />
          </div>
          <label class="flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" class="accent-blush-400" [ngModel]="ev.extraPostIllustrations" (ngModelChange)="patchEvent({ extraPostIllustrations: $event })" />
            Extra: ilustraciones a posteriori <span class="text-xs text-ink-500">(solo uso interno, no aparece en el PDF)</span>
          </label>
          <div class="sm:col-span-2">
            <label class="label" for="ev-desc">Descripción</label>
            <textarea id="ev-desc" rows="2" class="input" [ngModel]="ev.description ?? ''" (ngModelChange)="patchEvent({ description: $event })"></textarea>
          </div>
        </section>
      </div>

      <section class="card mt-5 text-sm">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-xl font-semibold">Economía</h2>
          <button type="button" class="btn-secondary !py-1.5" (click)="addItem()">+ Añadir concepto</button>
        </div>

        <div class="mt-3 overflow-x-auto">
          <table class="w-full min-w-[760px] text-left">
            <thead class="text-xs uppercase text-ink-500">
              <tr>
                <th class="px-2 py-2">Concepto</th>
                <th class="w-24 px-2 py-2">Unidades</th>
                <th class="w-32 px-2 py-2">Precio unit. (€)</th>
                @if (early()) { <th class="w-24 px-2 py-2 text-center" title="El descuento por reserva temprana se aplica a este concepto">Reserva temprana</th> }
                <th class="w-28 px-2 py-2 text-right">Importe</th>
                <th class="w-10 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              @for (i of items(); track i.id) {
                <tr class="border-t border-cream-200 align-middle">
                  <td class="align-middle px-2 py-2"><input class="input" aria-label="Concepto" [ngModel]="i.concept" (ngModelChange)="setItem(i.id, { concept: $event })" /></td>
                  <td class="align-middle px-2 py-2"><input type="number" min="0" step="any" class="input" aria-label="Unidades" [ngModel]="i.units" (ngModelChange)="setItem(i.id, { units: +$event || 0 })" /></td>
                  <td class="align-middle px-2 py-2"><input type="number" min="0" step="1" class="input" aria-label="Precio unitario" [ngModel]="i.unitPrice" (ngModelChange)="setItem(i.id, { unitPrice: +$event || 0 })" /></td>
                  @if (early()) {
                    <td class="align-middle px-2 py-2 text-center">
                      <input type="checkbox" class="h-4 w-4 accent-blush-400" aria-label="Aplicar descuento por reserva temprana a este concepto" [ngModel]="i.earlyDiscount" (ngModelChange)="setItem(i.id, { earlyDiscount: $event })" />
                    </td>
                  }
                  <td class="align-middle px-2 py-2 text-right">
                    <strong>{{ calc.lineTotal(i) | euro }}</strong>
                  </td>
                  <td class="align-middle px-2 py-2 text-right">
                    <button type="button" class="px-2 py-2 text-lg leading-none text-ink-500 hover:text-red-600" aria-label="Quitar concepto" (click)="removeItem(i.id)">×</button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="px-2 py-4 text-ink-500">Sin conceptos. Añade uno.</td></tr>
              }
            </tbody>
          </table>
        </div>

        <div class="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 pt-3">
          <button type="button" class="text-xs text-ink-500 underline hover:text-ink-900" (click)="resetItems()">Restablecer conceptos desde el evento</button>
          <div class="text-right">
            <p class="text-lg">Total: <strong class="font-serif text-2xl">{{ total() | euro }}</strong></p>
          </div>
        </div>

        <div class="mt-4 rounded-xl border border-blush-200 bg-blush-50 p-4">
          <label class="flex items-center gap-2 font-medium">
            <input type="checkbox" class="accent-blush-400" [ngModel]="early() !== null" (ngModelChange)="toggleEarly($event)" />
            Descuento por reserva temprana
          </label>
          @if (early(); as e) {
            <div class="mt-3 grid items-end gap-3 sm:grid-cols-3">
              <div>
                <label class="label" for="eb-pct">Descuento (%)</label>
                <input id="eb-pct" type="number" min="0" max="100" step="1" class="input" [ngModel]="e.percent" (ngModelChange)="patchEarly({ percent: +$event || 0 })" />
              </div>
              <div>
                <label class="label" for="eb-date">Válido hasta el (incluido)</label>
                <app-date-picker inputId="eb-date" [ngModel]="e.deadline" (ngModelChange)="patchEarly({ deadline: $event })" />
              </div>
              <p class="pb-2 text-right text-sm">
                Ahorro: <strong>{{ total() - earlyPrice()! | euro }}</strong>
                <span class="block text-xs text-ink-500">Solo en los conceptos marcados en la tabla</span>
              </p>
            </div>
          }
        </div>

        <div class="mt-4 overflow-x-auto rounded-xl border border-cream-200">
          <table class="w-full min-w-[520px] text-sm">
            <thead class="bg-cream-100 text-xs uppercase text-ink-500">
              <tr>
                <th class="px-3 py-2 text-left">{{ early() ? 'Confirmación de la reserva' : 'Importes de pago' }}</th>
                <th class="px-3 py-2 text-right">Total</th>
                <th class="px-3 py-2 text-right">Reserva ({{ depositPct }} %)</th>
                <th class="px-3 py-2 text-right">Resto ({{ 100 - depositPct }} %)</th>
              </tr>
            </thead>
            <tbody>
              @for (row of paymentRows(); track row.label) {
                <tr class="border-t border-cream-200">
                  <td class="px-3 py-2">{{ row.label }}</td>
                  <td class="px-3 py-2 text-right font-semibold">{{ row.amount | euro }}</td>
                  <td class="px-3 py-2 text-right">{{ row.deposit | euro }}</td>
                  <td class="px-3 py-2 text-right">{{ row.remainder | euro }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-cream-200 pt-4">
          @if (message() && (isError() || !dirty())) {
            <span class="mr-auto text-sm" [class.text-sage-500]="!isError()" [class.text-red-600]="isError()">{{ message() }}</span>
          } @else if (dirty()) {
            <span class="mr-auto text-xs text-amber-700">Tienes cambios sin guardar.</span>
          }
          <button type="button" class="btn-secondary" [disabled]="!dirty() || saving()" (click)="discard()">Descartar cambios</button>
          <button type="button" class="btn-primary" [disabled]="!dirty() || saving()" (click)="save()">{{ saving() ? 'Guardando…' : 'Guardar cambios' }}</button>
        </div>
      </section>
    }
  `,
})
export class Detail {
  readonly id = input.required<string>(); // desde la ruta (withComponentInputBinding)

  private readonly firebase = inject(FirebaseService);
  private readonly pdfService = inject(PdfGeneratorService);
  protected readonly calc = inject(QuoteCalculatorService);

  readonly types = (Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((value) => ({ value, label: EVENT_TYPE_LABELS[value] }));

  readonly quote = signal<Quote | null>(null);
  readonly settings = signal<AppSettings>(DEFAULT_SETTINGS);
  readonly loading = signal(true);
  readonly event = signal<EventDetails>({} as EventDetails);
  readonly items = signal<QuoteLineItem[]>([]);
  readonly status = signal<QuoteStatus>('pendiente');
  readonly early = signal<{ percent: number; deadline: string } | null>(null);
  readonly saving = signal(false);
  readonly message = signal('');
  readonly isError = signal(false);

  readonly total = computed(() => this.calc.itemsTotal(this.items()));
  readonly earlyPrice = computed(() => {
    const e = this.early();
    return e ? this.calc.earlyBookingPrice(this.items(), e.percent) : null;
  });
  readonly depositPct = DEPOSIT_PERCENT;
  /** Cuánto se paga (reserva y resto) según se reserve dentro o fuera del plazo del descuento. */
  readonly paymentRows = computed(() => {
    const e = this.early();
    const plan = this.calc.paymentPlan(this.items(), e ? e.percent : null);
    return [
      ...(e && plan.early ? [{ label: `Hasta el ${this.fmt(e.deadline)} (incluido)`, ...plan.early }] : []),
      { label: e ? `A partir del ${this.fmt(this.dayAfter(e.deadline))}` : 'Total del presupuesto', ...plan.regular },
    ];
  });
  /** True si el formulario difiere de lo último guardado. */
  readonly dirty = computed(() => {
    const q = this.quote();
    if (!q) return false;
    const current = { event: this.event(), items: this.items(), status: this.status(), early: this.early() };
    const saved = { event: q.event, items: this.calc.getLineItems(q), status: q.status, early: this.initialEarly(q) };
    return JSON.stringify(current) !== JSON.stringify(saved);
  });
  readonly created = computed(() => {
    const q = this.quote();
    return q ? new Date(q.createdAt).toLocaleString('es-ES') : '';
  });

  async ngOnInit() {
    try {
      const [q, settings] = await Promise.all([this.firebase.getQuote(this.id()), this.firebase.getSettings()]);
      this.settings.set(settings);
      this.quote.set(q);
      if (q) this.load(q);
    } finally {
      this.loading.set(false);
    }
  }

  private load(q: Quote) {
    this.event.set({ ...q.event });
    this.items.set(this.calc.getLineItems(q).map((i) => ({ ...i })));
    this.status.set(q.status);
    this.early.set(this.initialEarly(q));
  }

  /** Reserva temprana guardada; en presupuestos antiguos (sin el campo) se aplica la configuración por defecto. */
  private initialEarly(q: Quote): { percent: number; deadline: string } | null {
    if (q.earlyBooking === undefined) {
      const { percent, days } = this.settings().earlyBooking;
      return percent > 0 ? { percent, deadline: this.calc.earlyBookingDeadline(q.createdAt, days) } : null;
    }
    return q.earlyBooking ? { ...q.earlyBooking } : null;
  }

  /** Vuelve al último estado guardado. */
  discard() {
    const q = this.quote();
    if (!q) return;
    this.load(q);
    this.isError.set(false);
    this.message.set('Cambios descartados.');
  }

  // ---- Evento ----
  patchEvent(patch: Partial<EventDetails>) {
    this.event.update((e) => ({ ...e, ...patch }));
  }

  setType(type: EventType) {
    this.patchEvent({ type, ...(type !== 'especial' && { customTypeDescription: undefined }) });
  }

  /** Mantiene sincronizada la línea de servicio mientras no se haya editado a mano. */
  setDuration(hours: number) {
    const prev = this.event().durationHours;
    this.patchEvent({ durationHours: hours });
    this.items.update((list) => list.map((i) => (i.id === 'service' && i.units === prev ? { ...i, units: hours } : i)));
  }

  setGuests(guests: number) {
    const tiers = this.settings().pricingTiers;
    const prevRate = this.calc.getHourlyRate(this.event().guestCount, tiers);
    const newRate = this.calc.getHourlyRate(guests, tiers);
    this.patchEvent({ guestCount: guests });
    this.items.update((list) => list.map((i) => (i.id === 'service' && i.unitPrice === prevRate ? { ...i, unitPrice: newRate } : i)));
  }

  fmt(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return y ? new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  }

  private dayAfter(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return this.calc.earlyBookingDeadline(new Date(y, m - 1, d), 1);
  }

  // ---- Descuento por reserva temprana ----
  toggleEarly(on: boolean) {
    const q = this.quote();
    if (!on || !q) return this.early.set(null);
    const { percent, days } = this.settings().earlyBooking;
    this.early.set({ percent, deadline: this.calc.earlyBookingDeadline(q.createdAt, days) });
  }

  patchEarly(patch: Partial<{ percent: number; deadline: string }>) {
    this.early.update((e) => (e ? { ...e, ...patch } : e));
  }

  // ---- Conceptos ----
  setItem(id: string, patch: Partial<QuoteLineItem>) {
    this.items.update((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  addItem() {
    this.items.update((list) => [
      ...list,
      { id: crypto.randomUUID(), concept: '', units: 1, unitPrice: 0, earlyDiscount: false },
    ]);
  }

  removeItem(id: string) {
    this.items.update((list) => list.filter((i) => i.id !== id));
  }

  resetItems() {
    const q = this.quote();
    if (!q) return;
    const ev = this.event();
    const rate = this.calc.getHourlyRate(ev.guestCount, this.settings().pricingTiers);
    const travel = this.items().find((i) => i.id === 'travel')?.unitPrice ?? q.travelCost;
    this.items.set(
      this.calc.getLineItems({ ...q, lineItems: undefined, event: ev, appliedHourlyRate: rate, travelCost: travel }).map((i) => ({ ...i })),
    );
  }

  // ---- Guardado / PDF ----
  private buildQuote(q: Quote): Quote {
    const items = this.items().map((i) => ({ ...i, concept: i.concept.trim() }));
    const service = items.find((i) => i.id === 'service');
    const travel = items.find((i) => i.id === 'travel');
    return {
      ...q,
      event: this.event(),
      lineItems: items,
      appliedHourlyRate: service?.unitPrice ?? q.appliedHourlyRate,
      subtotalHours: service ? this.calc.lineTotal(service) : q.subtotalHours,
      travelCost: travel ? this.calc.lineTotal(travel) : 0,
      totalAmount: this.calc.itemsTotal(items),
      status: this.status(),
      earlyBooking: this.early(), // null = desactivado
    };
  }

  async save() {
    const q = this.quote();
    if (!q?.id) return;
    const ev = this.event();
    this.isError.set(true);
    if (!ev.date || !ev.location?.trim() || ev.guestCount < 1 || ev.durationHours < 1) {
      this.message.set('Revisa los datos del evento: fecha, lugar, invitados y horas son obligatorios.');
      return;
    }
    if (this.items().some((i) => !i.concept.trim())) {
      this.message.set('Todos los conceptos necesitan un nombre.');
      return;
    }
    const eb = this.early();
    if (eb && (!eb.deadline || eb.percent <= 0 || eb.percent > 100)) {
      this.message.set('Descuento por reserva temprana: indica un porcentaje entre 1 y 100 y la fecha límite.');
      return;
    }
    this.saving.set(true);
    this.message.set('');
    try {
      const updated = this.buildQuote(q);
      const { id, ...data } = updated;
      await this.firebase.updateQuote(q.id, data, q);
      this.quote.set(updated);
      this.isError.set(false);
      this.message.set('Guardado.');
    } catch (err) {
      this.message.set(
        err instanceof DateBlockedError
          ? 'No se puede guardar como aceptado: esa fecha ya está bloqueada por otro presupuesto aceptado o por un bloqueo manual.'
          : 'No se pudo guardar.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  downloadPdf() {
    const q = this.quote();
    if (q) this.pdfService.download(this.buildQuote(q), this.settings());
  }

  previewPdf() {
    const q = this.quote();
    if (q) this.pdfService.preview(this.buildQuote(q), this.settings());
  }
}
