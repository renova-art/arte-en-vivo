import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FirebaseService } from '../../../core/services/firebase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <main class="flex min-h-screen items-center justify-center bg-blush-50 px-4">
      <form [formGroup]="form" (ngSubmit)="submit()" class="card w-full max-w-sm space-y-4">
        <h1 class="text-center text-3xl font-semibold">Acceso admin</h1>
        <div>
          <label class="label" for="email">Correo electrónico</label>
          <input id="email" type="email" autocomplete="username" class="input" formControlName="email" />
        </div>
        <div>
          <label class="label" for="pw">Contraseña</label>
          <input id="pw" type="password" autocomplete="current-password" class="input" formControlName="password" />
        </div>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button class="btn-primary w-full" [disabled]="form.invalid || loading()">{{ loading() ? 'Entrando…' : 'Entrar' }}</button>
        <p class="text-center text-xs"><a routerLink="/" class="text-ink-500 hover:text-ink-900">← Volver a la web</a></p>
      </form>
    </main>
  `,
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly firebase = inject(FirebaseService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const { email, password } = this.form.getRawValue();
      await this.firebase.login(email, password);
      this.router.navigateByUrl('/admin/presupuestos');
    } catch {
      this.error.set('Credenciales incorrectas.');
    } finally {
      this.loading.set(false);
    }
  }
}
