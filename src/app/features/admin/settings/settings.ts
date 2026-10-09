import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppSettings, ProviderPerson } from '../../../core/models';
import { FirebaseService } from '../../../core/services/firebase.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1 class="text-3xl font-semibold">Configuración</h1>

    @if (loading()) {
      <p class="mt-6 text-sm text-ink-500">Cargando…</p>
    } @else {
      <form [formGroup]="form" (ngSubmit)="save()" class="mt-6 space-y-6">
        <section class="card grid gap-4 sm:grid-cols-2">
          <h2 class="text-xl font-semibold sm:col-span-2">Numeración</h2>
          <div>
            <label class="label" for="ini">Contador inicial del año</label>
            <input id="ini" type="number" min="1" class="input" formControlName="initialQuoteNumber" />
          </div>
          <div>
            <label class="label" for="yr">Año al que aplica</label>
            <input id="yr" type="number" min="2000" class="input" formControlName="currentYear" />
          </div>
          <p class="text-xs text-ink-500 sm:col-span-2">Formato: PRES-AÑO-NNN. El contador inicial solo se usa si el año coincide con el año en curso.</p>
        </section>

        <section class="card grid gap-4 sm:grid-cols-3" formGroupName="studio">
          <h2 class="text-xl font-semibold sm:col-span-3">Estudio (datos comunes del PDF)</h2>
          <div>
            <label class="label" for="st-name">Nombre del estudio</label>
            <input id="st-name" class="input" formControlName="name" />
          </div>
          <div>
            <label class="label" for="st-addr">Dirección del estudio</label>
            <input id="st-addr" class="input" formControlName="address" />
          </div>
          <div>
            <label class="label" for="st-email">Email del estudio</label>
            <input id="st-email" type="email" class="input" formControlName="email" />
          </div>
        </section>

        <div formArrayName="providers" class="grid gap-6 lg:grid-cols-2">
          @for (g of providers.controls; track g; let i = $index) {
            <section class="card grid gap-4 sm:grid-cols-2" [formGroupName]="i">
              <h2 class="text-xl font-semibold sm:col-span-2">Proveedora {{ i + 1 }}</h2>
              <div class="sm:col-span-2">
                <label class="label" [for]="'pv-name-' + i">Nombre y apellidos</label>
                <input [id]="'pv-name-' + i" class="input" formControlName="name" />
              </div>
              <div>
                <label class="label" [for]="'pv-nif-' + i">NIF <span class="font-normal text-ink-500">· solo aparece en el PDF del presupuesto</span></label>
                <input [id]="'pv-nif-' + i" class="input" formControlName="nif" />
              </div>
              <div>
                <label class="label" [for]="'pv-phone-' + i">Teléfono <span class="font-normal text-ink-500">· solo para Bizum</span></label>
                <input [id]="'pv-phone-' + i" type="tel" class="input" formControlName="phone" />
              </div>
              <label class="flex items-center gap-2 self-end pb-2.5 text-sm">
                <input type="checkbox" class="accent-blush-400" formControlName="bizum" />
                Bizum en este teléfono
              </label>
              <div class="sm:col-span-2">
                <label class="label" [for]="'pv-iban-' + i">Cuenta bancaria (IBAN) <span class="font-normal text-ink-500">· opcional</span></label>
                <input [id]="'pv-iban-' + i" class="input" formControlName="bankAccount" />
              </div>
            </section>
          }
        </div>

        <section class="card space-y-3">
          <h2 class="text-xl font-semibold">Tarifas por hora según invitados</h2>
          <div formArrayName="pricingTiers" class="space-y-3">
            @for (t of tiers.controls; track t; let i = $index) {
              <div [formGroupName]="i" class="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <div><label class="label">Desde (invitados)</label><input type="number" min="0" class="input" formControlName="minGuests" /></div>
                <div><label class="label">Hasta (vacío = sin límite)</label><input type="number" min="0" class="input" formControlName="maxGuests" /></div>
                <div><label class="label">€/hora</label><input type="number" min="0" step="0.01" class="input" formControlName="pricePerHour" /></div>
                <button type="button" class="btn-secondary" (click)="removeTier(i)" [disabled]="tiers.length <= 1">Quitar</button>
              </div>
            }
          </div>
          <button type="button" class="btn-secondary" (click)="addTier()">+ Añadir tramo</button>
        </section>

        <section class="card">
          <h2 class="text-xl font-semibold">Observaciones del PDF</h2>
          <textarea rows="4" class="input mt-3" formControlName="pdfObservations"></textarea>
        </section>

        <div class="flex items-center gap-3">
          <button class="btn-primary" [disabled]="form.invalid || saving()">{{ saving() ? 'Guardando…' : 'Guardar configuración' }}</button>
          @if (message()) { <span class="text-sm" [class.text-sage-500]="!isError()" [class.text-red-600]="isError()">{{ message() }}</span> }
        </div>
      </form>
    }
  `,
})
export class Settings {
  private readonly fb = inject(FormBuilder);
  private readonly firebase = inject(FirebaseService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly message = signal('');
  readonly isError = signal(false);

  readonly form = this.fb.nonNullable.group({
    initialQuoteNumber: [1, [Validators.required, Validators.min(1)]],
    currentYear: [new Date().getFullYear(), [Validators.required, Validators.min(2000)]],
    studio: this.fb.nonNullable.group({
      name: ['', Validators.required],
      address: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
    }),
    providers: this.fb.array([this.providerGroup(), this.providerGroup()]),
    pricingTiers: this.fb.array([this.tierGroup(0, null, 0)]),
    pdfObservations: [''],
  });

  get providers(): FormArray {
    return this.form.controls.providers as unknown as FormArray;
  }

  get tiers(): FormArray {
    return this.form.controls.pricingTiers as unknown as FormArray;
  }

  constructor() {
    this.firebase.getSettings().then((s) => {
      this.providers.clear();
      s.providers.forEach((p) => this.providers.push(this.providerGroup(p)));
      this.tiers.clear();
      s.pricingTiers.forEach((t) => this.tiers.push(this.tierGroup(t.minGuests, t.maxGuests, t.pricePerHour)));
      this.form.patchValue({
        initialQuoteNumber: s.initialQuoteNumber,
        currentYear: s.currentYear,
        studio: s.studio,
        pdfObservations: s.pdfObservations,
      });
      this.loading.set(false);
    });
  }

  private providerGroup(p?: ProviderPerson) {
    return this.fb.nonNullable.group({
      name: [p?.name ?? '', Validators.required],
      nif: [p?.nif ?? '', Validators.required],
      phone: [p?.phone ?? ''], // no se publica; solo se usa para Bizum
      bizum: [p?.bizum ?? false],
      bankAccount: [p?.bankAccount ?? ''], // opcional
    });
  }

  private tierGroup(min: number, max: number | null, price: number) {
    return this.fb.group({
      minGuests: [min, [Validators.required, Validators.min(0)]],
      maxGuests: [max as number | null],
      pricePerHour: [price, [Validators.required, Validators.min(0)]],
    });
  }

  addTier() {
    const last = this.tiers.at(this.tiers.length - 1)?.value;
    const min = last?.maxGuests != null ? last.maxGuests + 1 : 0;
    this.tiers.push(this.tierGroup(min, null, last?.pricePerHour ?? 0));
  }

  removeTier(i: number) {
    this.tiers.removeAt(i);
  }

  async save() {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const settings: AppSettings = {
      ...v,
      providers: (v.providers as ProviderPerson[]).map((p) => ({ ...p, bankAccount: p.bankAccount.trim() })),
      pricingTiers: (v.pricingTiers as any[])
        .map((t) => ({
          minGuests: Number(t.minGuests),
          maxGuests: t.maxGuests === null || t.maxGuests === '' ? null : Number(t.maxGuests),
          pricePerHour: Number(t.pricePerHour),
        }))
        .sort((a, b) => a.minGuests - b.minGuests),
    };
    this.saving.set(true);
    this.message.set('');
    try {
      await this.firebase.saveSettings(settings);
      this.isError.set(false);
      this.message.set('Configuración guardada.');
    } catch {
      this.isError.set(true);
      this.message.set('No se pudo guardar.');
    } finally {
      this.saving.set(false);
    }
  }
}
