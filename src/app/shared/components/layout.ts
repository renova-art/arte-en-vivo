import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SHOW_PORTFOLIO } from '../../core/config/defaults';
import { QuoteStatus } from '../../core/models';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <header class="sticky top-0 z-30 border-b border-cream-200 bg-cream-50/90 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <a routerLink="/" class="font-serif text-2xl font-semibold text-ink-900">Arte <span class="text-blush-400">en vivo</span></a>
        <nav class="flex items-center gap-5 text-sm">
          <a routerLink="/" fragment="servicios" class="hidden text-ink-500 hover:text-ink-900 sm:inline">Servicios</a>
          @if (showPortfolio) {
            <a routerLink="/" fragment="portfolio" class="hidden text-ink-500 hover:text-ink-900 sm:inline">Portafolio</a>
          }
          <a routerLink="/solicitar-presupuesto" class="btn-primary !py-2">Pedir presupuesto</a>
        </nav>
      </div>
    </header>
  `,
})
export class Header {
  readonly showPortfolio = SHOW_PORTFOLIO;
}

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <footer class="mt-16 border-t border-cream-200 bg-cream-100 py-8 text-center text-sm text-ink-500">
      <p class="font-serif text-lg text-ink-900">Arte en vivo</p>
      <p class="mt-1">Ilustraciones en directo para tus momentos especiales.</p>
      <p class="mt-3"><a routerLink="/admin" class="text-xs hover:text-ink-900">Acceso administración</a></p>
    </footer>
  `,
})
export class Footer {}

@Component({
  selector: 'app-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<span class="inline-block rounded-full px-3 py-0.5 text-xs font-medium" [class]="cls()">{{ status() }}</span>`,
})
export class StatusBadge {
  status = input.required<QuoteStatus>();
  cls() {
    return {
      pendiente: 'bg-amber-100 text-amber-800',
      aceptado: 'bg-sage-100 text-sage-500',
      rechazado: 'bg-red-100 text-red-700',
    }[this.status()];
  }
}

@Component({
  selector: 'app-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" role="dialog" aria-modal="true">
      <div class="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <ng-content />
        <button type="button" class="btn-primary mt-6" (click)="closed.emit()">{{ buttonLabel() }}</button>
      </div>
    </div>
  `,
})
export class Modal {
  buttonLabel = input('Cerrar');
  closed = output<void>();
}
