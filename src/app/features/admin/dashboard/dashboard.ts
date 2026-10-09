import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Quote, QuoteStatus } from '../../../core/models';
import { FirebaseService } from '../../../core/services/firebase.service';
import { StatusBadge } from '../../../shared/components/layout';
import { EuroCurrencyPipe, EventTypePipe } from '../../../shared/pipes/pipes';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, RouterLink, StatusBadge, EuroCurrencyPipe, EventTypePipe],
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
        <input id="from" type="date" class="input" [ngModel]="from()" (ngModelChange)="from.set($event)" />
      </div>
      <div>
        <label class="label" for="to">Evento hasta</label>
        <input id="to" type="date" class="input" [ngModel]="to()" (ngModelChange)="to.set($event)" />
      </div>
      <button type="button" class="btn-secondary" (click)="clear()">Limpiar</button>
    </div>

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
                <td class="px-4 py-3"><app-status-badge [status]="q.status" /></td>
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
      .then((q) => this.quotes.set(q))
      .catch(() => this.error.set('No se pudieron cargar los presupuestos.'))
      .finally(() => this.loading.set(false));
  }

  clear() {
    this.status.set('');
    this.from.set('');
    this.to.set('');
  }
}
