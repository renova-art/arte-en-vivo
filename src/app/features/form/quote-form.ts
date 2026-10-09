import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { startWith } from 'rxjs';
import { DEFAULT_SETTINGS, EVENT_TYPE_LABELS, MAX_HOURS, MIN_HOURS } from '../../core/config/defaults';
import { AppSettings, EventType } from '../../core/models';
import { FirebaseService } from '../../core/services/firebase.service';
import { QuoteCalculatorService } from '../../core/services/quote-calculator.service';
import { Footer, Header, Modal } from '../../shared/components/layout';
import { LegalKind, LegalModal } from '../../shared/components/legal-modal';
import { EuroCurrencyPipe } from '../../shared/pipes/pipes';

const todayIso = () => new Date().toISOString().slice(0, 10);

function futureDate(c: AbstractControl): ValidationErrors | null {
  return c.value && c.value < todayIso() ? { past: true } : null;
}

@Component({
  selector: 'app-quote-form',
  standalone: true,
  imports: [ReactiveFormsModule, Header, Footer, Modal, LegalModal, EuroCurrencyPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-header />
    <main class="mx-auto max-w-3xl px-4 py-10">
      <h1 class="text-3xl font-semibold sm:text-4xl">Solicita tu presupuesto</h1>
      <p class="mt-2 text-ink-500">Cuéntanos cómo será tu evento y te enviaremos una propuesta.</p>

      <form [formGroup]="form" (ngSubmit)="submit()" class="mt-8 space-y-8" novalidate>
        <section class="card space-y-5">
          <h2 class="text-2xl font-semibold">Tu evento</h2>

          <div>
            <label class="label" for="type">Tipo de evento</label>
            <select id="type" class="input" formControlName="type">
              @for (t of types; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
            </select>
          </div>

          @if (isSpecial()) {
            <div>
              <label class="label" for="custom">Describe el tipo de evento *</label>
              <input id="custom" class="input" [class.invalid]="bad('customTypeDescription')" formControlName="customTypeDescription" placeholder="Ej: aniversario, graduación…" />
              @if (bad('customTypeDescription')) { <p class="error">Este campo es obligatorio.</p> }
            </div>
          }

          <div class="grid gap-5 sm:grid-cols-2">
            <div>
              <label class="label" for="date">Fecha del evento *</label>
              <input id="date" type="date" class="input" [class.invalid]="bad('date')" [min]="today" formControlName="date" />
              @if (bad('date')) { <p class="error">{{ form.controls.date.errors?.['past'] ? 'La fecha no puede ser pasada.' : 'Indica la fecha.' }}</p> }
            </div>
            <div>
              <label class="label" for="guests">Número de invitados *</label>
              <input id="guests" type="number" min="1" class="input" [class.invalid]="bad('guestCount')" formControlName="guestCount" />
              @if (bad('guestCount')) { <p class="error">Indica al menos 1 invitado.</p> }
            </div>
          </div>

          <div>
            <label class="label" for="location">Lugar del evento *</label>
            <input id="location" class="input" [class.invalid]="bad('location')" formControlName="location" placeholder="Ciudad / finca / restaurante" />
            @if (bad('location')) { <p class="error">Indica el lugar.</p> }
          </div>

          <div>
            <label class="label" for="duration">Duración: <strong>{{ duration() }} horas</strong></label>
            <input id="duration" type="range" [min]="minH" [max]="maxH" step="1" class="w-full accent-blush-400" formControlName="durationHours" />
            <div class="flex justify-between text-xs text-ink-500"><span>{{ minH }} h</span><span>{{ maxH }} h</span></div>
          </div>

          <div class="rounded-xl border border-sage-200 bg-sage-50 p-4 text-sm text-ink-700">
            <strong>Capacidad máxima: 10 ilustraciones/hora.</strong> Las ilustraciones pueden ser individuales, en pareja o en grupos de máximo 4 personas.
          </div>

          <label class="flex items-start gap-3 text-sm">
            <input type="checkbox" class="mt-1 accent-blush-400" formControlName="extraPostIllustrations" />
            <span>Me interesan ilustraciones adicionales a posteriori (extra opcional).</span>
          </label>

          <div>
            <label class="label" for="desc">Cuéntanos más (opcional)</label>
            <textarea id="desc" rows="3" class="input" formControlName="description"></textarea>
          </div>
        </section>

        <section class="card space-y-5">
          <h2 class="text-2xl font-semibold">Tus datos</h2>
          <div>
            <label class="label" for="name">Nombre y apellidos *</label>
            <input id="name" class="input" autocomplete="name" [class.invalid]="bad('fullName')" formControlName="fullName" />
            @if (bad('fullName')) { <p class="error">Indica tu nombre y apellidos.</p> }
          </div>
          <div class="grid gap-5 sm:grid-cols-2">
            <div>
              <label class="label" for="phone">Teléfono *</label>
              <input id="phone" type="tel" class="input" autocomplete="tel" [class.invalid]="bad('phone')" formControlName="phone" />
              @if (bad('phone')) { <p class="error">Introduce un teléfono válido.</p> }
            </div>
            <div>
              <label class="label" for="email">Correo electrónico *</label>
              <input id="email" type="email" class="input" autocomplete="email" [class.invalid]="bad('email')" formControlName="email" />
              @if (bad('email')) { <p class="error">Introduce un correo válido.</p> }
            </div>
          </div>

          <div class="space-y-3 text-sm">
            <label class="flex items-start gap-3">
              <input type="checkbox" class="mt-1 accent-blush-400" formControlName="termsAccepted" />
              <span>Acepto los <button type="button" class="text-blush-500 underline hover:text-blush-400" (click)="openLegal('terms', $event)">Términos y Condiciones</button>. *</span>
            </label>
            <label class="flex items-start gap-3">
              <input type="checkbox" class="mt-1 accent-blush-400" formControlName="privacyAccepted" />
              <span>Acepto la <button type="button" class="text-blush-500 underline hover:text-blush-400" (click)="openLegal('privacy', $event)">política de protección de datos (LOPD y RGPD)</button>. *</span>
            </label>
            @if (bad('termsAccepted') || bad('privacyAccepted')) {
              <p class="error">Debes aceptar ambas casillas para continuar.</p>
            }
          </div>
        </section>

        <section class="rounded-2xl bg-blush-100 p-6 text-center">
          <p class="text-sm text-ink-500">Estimación orientativa ({{ rate() }} €/h)</p>
          <p class="font-serif text-4xl font-semibold text-ink-900">{{ estimate() | euro }}</p>
          <p class="mt-1 text-xs text-ink-500">Sin incluir desplazamiento. El presupuesto definitivo lo confirmaremos nosotros.</p>
        </section>

        @if (error()) { <p class="error text-center text-sm">{{ error() }}</p> }
        <button type="submit" class="btn-primary w-full !py-3" [disabled]="sending()">
          {{ sending() ? 'Enviando…' : 'Enviar solicitud' }}
        </button>
      </form>
    </main>
    <app-footer />

    @if (legal(); as kind) {
      <app-legal-modal [kind]="kind" [provider]="settings().provider" (closed)="legal.set(null)" />
    }

    @if (sentNumber()) {
      <app-modal buttonLabel="Volver al inicio" (closed)="finish()">
        <div class="text-4xl">💌</div>
        <h2 class="mt-2 text-2xl font-semibold">¡Gracias!</h2>
        <p class="mt-2 text-sm text-ink-500">
          Hemos recibido tu solicitud <strong>{{ sentNumber() }}</strong>. Nos pondremos en contacto contigo muy pronto.
        </p>
      </app-modal>
    }
  `,
})
export class QuoteForm {
  private readonly fb = inject(FormBuilder);
  private readonly firebase = inject(FirebaseService);
  private readonly calc = inject(QuoteCalculatorService);
  private readonly router = inject(Router);

  readonly minH = MIN_HOURS;
  readonly maxH = MAX_HOURS;
  readonly today = todayIso();
  readonly types = (Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((value) => ({ value, label: EVENT_TYPE_LABELS[value] }));

  readonly settings = signal<AppSettings>(DEFAULT_SETTINGS);
  readonly sending = signal(false);
  readonly error = signal('');
  readonly sentNumber = signal('');
  readonly legal = signal<LegalKind | null>(null);

  readonly form = this.fb.nonNullable.group({
    type: ['boda' as EventType],
    customTypeDescription: [''],
    date: ['', [Validators.required, futureDate]],
    location: ['', Validators.required],
    durationHours: [MIN_HOURS, [Validators.required, Validators.min(MIN_HOURS), Validators.max(MAX_HOURS)]],
    guestCount: [50, [Validators.required, Validators.min(1)]],
    extraPostIllustrations: [false],
    description: [''],
    fullName: ['', [Validators.required, Validators.pattern(/^\S+(\s+\S+)+$/)]],
    phone: ['', [Validators.required, Validators.pattern(/^\+?[0-9][0-9 ()-]{7,16}$/)]],
    email: ['', [Validators.required, Validators.email]],
    termsAccepted: [false, Validators.requiredTrue],
    privacyAccepted: [false, Validators.requiredTrue],
  });

  private readonly value = toSignal(this.form.valueChanges.pipe(startWith(this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  readonly isSpecial = computed(() => this.value().type === 'especial');
  readonly duration = computed(() => Number(this.value().durationHours ?? MIN_HOURS));
  private readonly pricing = computed(() =>
    this.calc.calculate(this.duration(), Number(this.value().guestCount) || 0, 0, this.settings().pricingTiers),
  );
  readonly rate = computed(() => this.pricing().appliedHourlyRate);
  readonly estimate = computed(() => this.pricing().totalAmount);

  constructor() {
    this.firebase.getSettings().then((s) => this.settings.set(s));
    this.form.controls.type.valueChanges.subscribe((t) => {
      const c = this.form.controls.customTypeDescription;
      c.setValidators(t === 'especial' ? Validators.required : null);
      c.updateValueAndValidity();
    });
  }

  openLegal(kind: LegalKind, event: Event) {
    event.preventDefault(); // evita marcar/desmarcar el checkbox del label
    this.legal.set(kind);
  }

  bad(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  async submit() {
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.sending.set(true);
    try {
      const number = await this.firebase.createQuote(
        {
          fullName: v.fullName.trim(),
          phone: v.phone.trim(),
          email: v.email.trim(),
          termsAccepted: v.termsAccepted,
          privacyAccepted: v.privacyAccepted,
        },
        {
          type: v.type,
          customTypeDescription: v.type === 'especial' ? v.customTypeDescription.trim() : undefined,
          date: v.date,
          location: v.location.trim(),
          durationHours: Number(v.durationHours),
          guestCount: Number(v.guestCount),
          extraPostIllustrations: v.extraPostIllustrations,
          description: v.description.trim() || undefined,
        },
        this.settings(),
      );
      this.sentNumber.set(number);
    } catch {
      this.error.set('No hemos podido enviar la solicitud. Inténtalo de nuevo en unos minutos.');
    } finally {
      this.sending.set(false);
    }
  }

  finish() {
    this.router.navigateByUrl('/');
  }
}
