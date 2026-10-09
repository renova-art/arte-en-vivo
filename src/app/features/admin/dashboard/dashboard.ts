import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Quote, QuoteStatus } from '../../../core/models';
import { DateBlockedError, FirebaseService } from '../../../core/services/firebase.service';
import { DatePicker } from '../../../shared/components/date-picker';
import { EuroCurrencyPipe, EventTypePipe } from '../../../shared/pipes/pipes';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePicker, EuroCurrencyPipe, EventTypePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1 class="text-3xl font-semibold">Presupuestos</h1>

    <div class="mt-5 flex flex-wrap items-end gap-4">
      <div>
        <label class="label" for="st">Estado</label>
        <select id="st" class="input" [ngModel]="status()" (ngModelChange)="status.set($event)">
          <option value="">Todos</option>
          <option value="pendiente">Pendiente</option>
          <option value="aceptado">Aceptado</option>
          <option value="rechazado">Rechazado</option>
        </select>
      </div>
      <div>
        <label class="label" for="from">Evento desde</label>
        <app-date-picker inputId="from" placeholder="Cualquiera" [clearable]="true" [ngModel]="from()" (ngModelChange)="from.set($event)" />
      </div>
      <div>
        <label class="label" for="to">Evento hasta</label>
        <app-date-picker inputId="to" placeholder="Cualquiera" [clearable]="true" [min]="from()" [ngModel]="to()" (ngModelChange)="to.set($event)" />
      </div>
      <button type="button" class="btn-secondary" (click)="clear()">Limpiar</button>
    </div>

    @if (statusError()) { <p class="error mt-3">{{ statusError() }}</p> }

    <div class="card mt-6 overflow-x-auto !p-0">
      @if (loading()) {
        <p class="p-6 text-sm text-ink-500">Cargando…</p>
      } @else if (error()) {
        <p class="error p-6">{{ error() }}</p>
      } @else if (!filtered().length) {
        <p class="p-6 text-sm text-ink-500">No hay presupuestos que mostrar.</p>
      } @else {
        <table class="w-full min-w-[720px] text-left text-sm">
          <thead class="bg-cream-100 text-xs uppercase text-ink-500">
            <tr>
              <th class="px-4 py-3">Nº</th><th class="px-4 py-3">Cliente</th><th class="px-4 py-3">Fecha evento</th>
              <th class="px-4 py-3">Tipo</th><th class="px-4 py-3 text-right">Invitados</th>
              <th class="px-4 py-3 text-right">Total</th><th class="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            @for (q of filtered(); track q.id) {
              <tr class="border-t border-cream-200 hover:bg-blush-50">
                <td class="px-4 py-3 font-medium"><a [routerLink]="['/admin/presupuestos', q.id]" class="text-blush-500 hover:underline">{{ q.quoteNumber }}</a></td>
                <td class="px-4 py-3">{{ q.client.fullName }}</td>
                <td class="px-4 py-3">{{ q.event.date }}</td>
                <td class="px-4 py-3">{{ q.event.type | eventType }}</td>
                <td class="px-4 py-3 text-right">{{ q.event.guestCount }}</td>
                <td class="px-4 py-3 text-right">{{ q.totalAmount | euro }}</td>
                <td class="px-4 py-3">
                  <select
                    class="rounded-full border-0 py-1 pl-3 pr-7 text-xs font-medium focus:ring-2 focus:ring-blush-200"
                    [class]="statusClass[q.status]"
                    [attr.aria-label]="'Estado de ' + q.quoteNumber"
                    [disabled]="updating() === q.id"
                    [ngModel]="q.status"
                    (ngModelChange)="changeStatus(q, $event)"
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="aceptado">Aceptado</option>
                    <option value="rechazado">Rechazado</option>
                  </select>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
})
export class Dashboard {
  private readonly firebase = inject(FirebaseService);

  readonly quotes = signal<Quote[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly status = signal<QuoteStatus | ''>('');
  readonly updating = signal<string | null>(null);
  readonly statusError = signal('');
  readonly statusClass: Record<QuoteStatus, string> = {
    pendiente: 'bg-amber-100 text-amber-800',
    aceptado: 'bg-sage-100 text-sage-500',
    rechazado: 'bg-red-100 text-red-700',
  };
  readonly from = signal('');
  readonly to = signal('');

  readonly filtered = computed(() =>
    this.quotes().filter(
      (q) =>
        (!this.status() || q.status === this.status()) &&
        (!this.from() || q.event.date >= this.from()) &&
        (!this.to() || q.event.date <= this.to()),
    ),
  );

  constructor() {
    this.firebase
      .getQuotes()
      .then((q) => {
        this.quotes.set(q);
        this.firebase.syncAcceptedBlocks(q).catch(() => {}); // asegura el bloqueo de los aceptados previos
      })
      .catch(() => this.error.set('No se pudieron cargar los presupuestos.'))
      .finally(() => this.loading.set(false));
  }

  async changeStatus(q: Quote, status: QuoteStatus) {
    if (!q.id || status === q.status) return;
    const previous = q.status;
    this.setStatus(q.id, status);
    this.updating.set(q.id);
    this.statusError.set('');
    try {
      await this.firebase.updateStatus(q, status);
    } catch (err) {
      this.setStatus(q.id, previous); // revierte si Firestore rechaza el cambio
      this.statusError.set(
        err instanceof DateBlockedError
          ? 'No se puede aceptar: esa fecha ya está bloqueada por otro presupuesto aceptado o por un bloqueo manual.'
          : 'No se pudo actualizar el estado.',
      );
    } finally {
      this.updating.set(null);
    }
  }

  private setStatus(id: string, status: QuoteStatus) {
    this.quotes.update((list) => list.map((x) => (x.id === id ? { ...x, status } : x)));
  }

  clear() {
    this.status.set('');
    this.from.set('');
    this.to.set('');
  }
}
