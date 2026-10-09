import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ConfirmHost } from '../../shared/components/confirm-host';
import { FirebaseService } from '../../core/services/firebase.service';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConfirmHost],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <header class="border-b border-cream-200 bg-white">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span class="font-serif text-xl font-semibold text-ink-900">Administración</span>
        <nav class="flex items-center gap-4 text-sm">
          <a routerLink="presupuestos" routerLinkActive="text-blush-500 font-semibold" class="text-ink-500 hover:text-ink-900">Presupuestos</a>
          <a routerLink="configuracion" routerLinkActive="text-blush-500 font-semibold" class="text-ink-500 hover:text-ink-900">Configuración</a>
          <a routerLink="/" class="text-ink-500 hover:text-ink-900">Ver web</a>
          <button type="button" class="btn-secondary !py-1.5" (click)="logout()">Salir</button>
        </nav>
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-4 py-8"><router-outlet /></main>
    <app-confirm-host />
  `,
})
export class AdminShell {
  private readonly firebase = inject(FirebaseService);
  private readonly router = inject(Router);

  async logout() {
    // Primero se navega: si el usuario cancela por cambios sin guardar, no se cierra la sesión.
    if (await this.router.navigateByUrl('/admin/login')) await this.firebase.logout();
  }
}
