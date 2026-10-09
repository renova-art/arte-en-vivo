import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DEFAULT_SETTINGS, EVENT_TYPE_LABELS } from '../../../core/config/defaults';
import { AppSettings, EventDetails, EventType, Quote, QuoteLineItem, QuoteStatus } from '../../../core/models';
import { FirebaseService } from '../../../core/services/firebase.service';
import { PdfGeneratorService } from '../../../core/services/pdf-generator.service';
import { QuoteCalculatorService } from '../../../core/services/quote-calculator.service';
import { StatusBadge } from '../../../shared/components/layout';
import { EuroCurrencyPipe } from '../../../shared/pipes/pipes';

@Component({
  selector: 'app-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, StatusBadge, EuroCurrencyPipe],
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
          <p><span class="text-ink-500">Teléfono:</span> <a [href]="'tel:' + q.client.phone">{{ q.client.phone }}</a></p>
          <p><span class="text-ink-500">Email:</span> <a [href]="'mailto:' + q.client.email">{{ q.client.email }}</a></p>
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
            <input id="ev-date" type="date" class="input" [ngModel]="ev.date" (ngModelChange)="patchEvent({ date: $event })" />
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
                <th class="w-44 px-2 py-2">Descuento</th>
                <th class="w-28 px-2 py-2 text-right">Importe</th>
                <th class="w-10 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              @for (i of items(); track i.id) {
                <tr class="border-t border-cream-200 align-top">
                  <td class="px-2 py-2"><input class="input" aria-label="Concepto" [ngModel]="i.concept" (ngModelChange)="setItem(i.id, { concept: $event })" /></td>
                  <td class="px-2 py-2"><input type="number" min="0" step="any" class="input" aria-label="Unidades" [ngModel]="i.units" (ngModelChange)="setItem(i.id, { units: +$event || 0 })" /></td>
                  <td class="px-2 py-2"><input type="number" min="0" step="1" class="input" aria-label="Precio unitario" [ngModel]="i.unitPrice" (ngModelChange)="setItem(i.id, { unitPrice: +$event || 0 })" /></td>
                  <td class="px-2 py-2">
                    <div class="flex gap-1">
                      <input type="number" min="0" step="1" class="input" aria-label="Descuento" [ngModel]="i.discount" (ngModelChange)="setItem(i.id, { discount: +$event || 0 })" />
                      <select class="input !w-16 !px-2" aria-label="Tipo de descuento" [ngModel]="i.discountType" (ngModelChange)="setItem(i.id, { discountType: $event })">
                        <option value="percent">%</option>
                        <option value="amount">€</option>
                      </select>
                    </div>
                  </td>
                  <td class="px-2 py-3 text-right">
                    @if (calc.lineDiscount(i) > 0) {
                      <span class="block text-xs text-ink-500 line-through">{{ calc.lineGross(i) | euro }}</span>
                    }
                    <strong>{{ calc.lineTotal(i) | euro }}</strong>
                  </td>
                  <td class="px-2 py-2 text-right">
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
            @if (discountTotal() > 0) {
              <p class="text-xs text-ink-500">Descuentos aplicados: −{{ discountTotal() | euro }}</p>
            }
            <p class="text-lg">Total: <strong class="font-serif text-2xl">{{ total() | euro }}</strong></p>
          </div>
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
  readonly saving = signal(false);
  readonly message = signal('');
  readonly isError = signal(false);

  readonly total = computed(() => this.calc.itemsTotal(this.items()));
  readonly discountTotal = computed(() => this.items().reduce((s, i) => s + this.calc.lineDiscount(i), 0));
  /** True si el formulario difiere de lo último guardado. */
  readonly dirty = computed(() => {
    const q = this.quote();
    if (!q) return false;
    const current = { event: this.event(), items: this.items(), status: this.status() };
    const saved = { event: q.event, items: this.calc.getLineItems(q), status: q.status };
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

  // ---- Conceptos ----
  setItem(id: string, patch: Partial<QuoteLineItem>) {
    this.items.update((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  addItem() {
    this.items.update((list) => [
      ...list,
      { id: crypto.randomUUID(), concept: '', units: 1, unitPrice: 0, discount: 0, discountType: 'percent' },
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
      subtotalHours: service ? this.calc.lineGross(service) : q.subtotalHours,
      travelCost: travel ? this.calc.lineTotal(travel) : 0,
      totalAmount: this.calc.itemsTotal(items),
      status: this.status(),
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
    this.saving.set(true);
    this.message.set('');
    try {
      const updated = this.buildQuote(q);
      const { id, ...data } = updated;
      await this.firebase.updateQuote(q.id, data);
      this.quote.set(updated);
      this.isError.set(false);
      this.message.set('Guardado.');
    } catch {
      this.message.set('No se pudo guardar.');
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
