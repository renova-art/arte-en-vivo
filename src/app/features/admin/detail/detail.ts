import { Component, computed, inject, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Quote, QuoteStatus } from '../../../core/models';
import { FirebaseService } from '../../../core/services/firebase.service';
import { PdfGeneratorService } from '../../../core/services/pdf-generator.service';
import { StatusBadge } from '../../../shared/components/layout';
import { EuroCurrencyPipe, EventTypePipe } from '../../../shared/pipes/pipes';

@Component({
  selector: 'app-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, StatusBadge, EuroCurrencyPipe, EventTypePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <a routerLink="/admin/presupuestos" class="text-sm text-ink-500 hover:text-ink-900">← Volver a presupuestos</a>

    @if (loading()) {
      <p class="mt-6 text-sm text-ink-500">Cargando…</p>
    } @else if (!quote()) {
      <p class="error mt-6">Presupuesto no encontrado.</p>
    } @else {
      @let q = quote()!;
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-3xl font-semibold">{{ q.quoteNumber }} <app-status-badge [status]="status()" /></h1>
        <button type="button" class="btn-primary" (click)="pdf()">Descargar PDF</button>
      </div>

      <div class="mt-6 grid gap-6 md:grid-cols-2">
        <section class="card space-y-1 text-sm">
          <h2 class="mb-2 text-xl font-semibold">Cliente</h2>
          <p><span class="text-ink-500">Nombre:</span> {{ q.client.fullName }}</p>
          <p><span class="text-ink-500">Teléfono:</span> <a [href]="'tel:' + q.client.phone">{{ q.client.phone }}</a></p>
          <p><span class="text-ink-500">Email:</span> <a [href]="'mailto:' + q.client.email">{{ q.client.email }}</a></p>
          <p><span class="text-ink-500">T&C / RGPD:</span> {{ q.client.termsAccepted && q.client.privacyAccepted ? 'Aceptados' : 'No aceptados' }}</p>
          <p><span class="text-ink-500">Recibido:</span> {{ created() }}</p>
        </section>

        <section class="card space-y-1 text-sm">
          <h2 class="mb-2 text-xl font-semibold">Evento</h2>
          <p><span class="text-ink-500">Tipo:</span> {{ q.event.type | eventType }}@if (q.event.customTypeDescription) { — {{ q.event.customTypeDescription }} }</p>
          <p><span class="text-ink-500">Fecha:</span> {{ q.event.date }}</p>
          <p><span class="text-ink-500">Lugar:</span> {{ q.event.location }}</p>
          <p><span class="text-ink-500">Invitados:</span> {{ q.event.guestCount }}</p>
          <p><span class="text-ink-500">Duración:</span> {{ q.event.durationHours }} h</p>
          <p><span class="text-ink-500">Extra a posteriori:</span> {{ q.event.extraPostIllustrations ? 'Sí' : 'No' }}</p>
          @if (q.event.description) { <p><span class="text-ink-500">Descripción:</span> {{ q.event.description }}</p> }
        </section>
      </div>

      <section class="card mt-6 max-w-xl space-y-4 text-sm">
        <h2 class="text-xl font-semibold">Economía</h2>
        <p>{{ q.event.durationHours }} h × {{ q.appliedHourlyRate | euro }}/h = <strong>{{ q.subtotalHours | euro }}</strong></p>
        <div>
          <label class="label" for="travel">Desplazamiento (€)</label>
          <input id="travel" type="number" min="0" step="0.01" class="input max-w-[10rem]" [ngModel]="travel()" (ngModelChange)="travel.set(+$event || 0)" />
        </div>
        <p class="text-lg">Total: <strong class="font-serif text-2xl">{{ total() | euro }}</strong></p>
        <div>
          <label class="label" for="status">Estado</label>
          <select id="status" class="input max-w-[12rem]" [ngModel]="status()" (ngModelChange)="status.set($event)">
            <option value="pendiente">Pendiente</option>
            <option value="aceptado">Aceptado</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </div>
        <div class="flex items-center gap-3">
          <button type="button" class="btn-primary" [disabled]="saving()" (click)="save()">{{ saving() ? 'Guardando…' : 'Guardar cambios' }}</button>
          @if (message()) { <span class="text-xs" [class.text-sage-500]="!isError()" [class.text-red-600]="isError()">{{ message() }}</span> }
        </div>
      </section>
    }
  `,
})
export class Detail {
  readonly id = input.required<string>(); // desde la ruta (withComponentInputBinding)

  private readonly firebase = inject(FirebaseService);
  private readonly pdfService = inject(PdfGeneratorService);

  readonly quote = signal<Quote | null>(null);
  readonly loading = signal(true);
  readonly travel = signal(0);
  readonly status = signal<QuoteStatus>('pendiente');
  readonly saving = signal(false);
  readonly message = signal('');
  readonly isError = signal(false);

  readonly total = computed(() => {
    const q = this.quote();
    return q ? Math.round((q.subtotalHours + this.travel()) * 100) / 100 : 0;
  });
  readonly created = computed(() => {
    const q = this.quote();
    return q ? new Date(q.createdAt).toLocaleString('es-ES') : '';
  });

  async ngOnInit() {
    try {
      const q = await this.firebase.getQuote(this.id());
      this.quote.set(q);
      if (q) {
        this.travel.set(q.travelCost);
        this.status.set(q.status);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async save() {
    const q = this.quote();
    if (!q?.id) return;
    this.saving.set(true);
    this.message.set('');
    try {
      const changes = { travelCost: this.travel(), totalAmount: this.total(), status: this.status() };
      await this.firebase.updateQuote(q.id, changes);
      this.quote.set({ ...q, ...changes });
      this.isError.set(false);
      this.message.set('Guardado.');
    } catch {
      this.isError.set(true);
      this.message.set('No se pudo guardar.');
    } finally {
      this.saving.set(false);
    }
  }

  async pdf() {
    const q = this.quote();
    if (!q) return;
    const settings = await this.firebase.getSettings();
    this.pdfService.generate({ ...q, travelCost: this.travel(), totalAmount: this.total(), status: this.status() }, settings);
  }
}
