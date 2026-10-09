import { Component, HostListener, inject } from '@angular/core';
import { ConfirmService } from '../../core/services/confirm.service';

/** Modal de confirmación. Se coloca una vez en el layout de administración. */
@Component({
  selector: 'app-confirm-host',
  standalone: true,
  template: `
    @if (confirm.pending(); as c) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" (click)="confirm.answer(false)">
        <div
          class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-message"
          (click)="$event.stopPropagation()"
        >
          <h2 id="confirm-title" class="text-2xl font-semibold">{{ c.title }}</h2>
          <p id="confirm-message" class="mt-2 text-sm text-ink-500">{{ c.message }}</p>
          <div class="mt-6 flex flex-wrap justify-end gap-3">
            <button type="button" class="btn-secondary" autofocus (click)="confirm.answer(false)">{{ c.cancelLabel }}</button>
            <button type="button" class="btn bg-red-500 text-white hover:bg-red-600" (click)="confirm.answer(true)">{{ c.confirmLabel }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmHost {
  protected readonly confirm = inject(ConfirmService);

  /** Esc equivale a "seguir editando": la opción segura. */
  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.confirm.pending()) this.confirm.answer(false);
  }
}
