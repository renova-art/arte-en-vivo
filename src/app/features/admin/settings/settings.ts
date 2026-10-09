import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppSettings, BlockedDate, BlockedRange, ProviderPerson } from '../../../core/models';
import { DatePicker } from '../../../shared/components/date-picker';
import { MAX_BLOCK_RANGE_DAYS } from '../../../core/config/defaults';
import { DateBlockedError, FirebaseService, daysBetween } from '../../../core/services/firebase.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DatePicker],
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

        <section class="card space-y-3">
          <h2 class="text-xl font-semibold">Logo del PDF</h2>
          <div class="flex flex-wrap items-center gap-4">
            <div class="flex h-24 w-40 items-center justify-center rounded-xl border border-dashed border-cream-200 bg-cream-50 p-2">
              @if (logo(); as src) {
                <img [src]="src" alt="Logo del estudio" class="max-h-full max-w-full object-contain" />
              } @else {
                <span class="text-center text-xs text-ink-500">Sin logo: se usa el monograma</span>
              }
            </div>
            <div class="space-y-2">
              <div class="flex flex-wrap gap-2">
                <label class="btn-secondary cursor-pointer !py-1.5">
                  {{ logo() ? 'Cambiar logo' : 'Subir logo' }}
                  <input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" (change)="onLogoSelected($event)" />
                </label>
                @if (logo()) {
                  <button type="button" class="btn-secondary !py-1.5" (click)="removeLogo()">Eliminar logo</button>
                }
              </div>
              <p class="text-xs text-ink-500">PNG, JPG o WEBP. Sustituye al círculo con la inicial en la esquina superior izquierda del PDF. Se aplica al guardar la configuración.</p>
              @if (logoError()) { <p class="error">{{ logoError() }}</p> }
            </div>
          </div>
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
                <label class="label" [for]="'pv-nif-' + i">NIF</label>
                <input [id]="'pv-nif-' + i" class="input" formControlName="nif" />
              </div>
              <div>
                <div class="mb-1 flex items-center justify-between">
                  <label class="text-sm font-medium text-ink-700" [for]="'pv-phone-' + i">Teléfono</label>
                  <label class="flex items-center gap-1.5 text-sm font-medium text-ink-700">
                    <input type="checkbox" class="accent-blush-400" formControlName="bizum" />
                    Bizum
                  </label>
                </div>
                <input [id]="'pv-phone-' + i" type="tel" class="input" formControlName="phone" />
              </div>
              <div class="sm:col-span-2">
                <label class="label" [for]="'pv-iban-' + i">Cuenta bancaria (IBAN) <span class="font-normal text-ink-500">· opcional</span></label>
                <input [id]="'pv-iban-' + i" class="input" formControlName="bankAccount" />
              </div>
            </section>
          }
        </div>

        <section class="card grid gap-4 sm:grid-cols-2" formGroupName="earlyBooking">
          <h2 class="text-xl font-semibold sm:col-span-2">Descuento por reserva temprana</h2>
          <div>
            <label class="label" for="eb-pct">Descuento por defecto (%)</label>
            <input id="eb-pct" type="number" min="0" max="100" step="1" class="input" formControlName="percent" />
          </div>
          <div>
            <label class="label" for="eb-days">Días de validez desde la emisión</label>
            <input id="eb-days" type="number" min="1" step="1" class="input" formControlName="days" />
          </div>
          <p class="text-xs text-ink-500 sm:col-span-2">Son los valores iniciales al activar el descuento en un presupuesto; en cada presupuesto se pueden ajustar el porcentaje y la fecha límite.</p>
        </section>

        <section class="card space-y-4">
          <div>
            <h2 class="text-xl font-semibold">Fechas bloqueadas</h2>
            <p class="mt-1 text-xs text-ink-500">Los clientes no podrán solicitar presupuesto para estos días. Los presupuestos aceptados bloquean su fecha automáticamente. Los cambios de esta sección se aplican al momento.</p>
          </div>

          <div class="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
            <div>
              <label class="label" for="bl-from">Desde</label>
              <app-date-picker inputId="bl-from" [min]="today" [formControl]="blockFrom" />
            </div>
            <div>
              <label class="label" for="bl-to">Hasta <span class="font-normal text-ink-500">· opcional</span></label>
              <app-date-picker inputId="bl-to" [min]="blockFrom.value || today" [clearable]="true" placeholder="Solo ese día" [formControl]="blockTo" />
            </div>
            <div>
              <label class="label" for="bl-label">Título <span class="font-normal text-ink-500">· opcional, solo lo ves tú</span></label>
              <input id="bl-label" class="input" placeholder="Navidades, vacaciones de verano…" [formControl]="blockLabel" />
            </div>
            <button type="button" class="btn-primary" [disabled]="blocking()" (click)="addRange()">Bloquear</button>
          </div>
          @if (blockMessage()) {
            <p class="text-sm" [class.text-sage-500]="!blockIsError()" [class.text-red-600]="blockIsError()">{{ blockMessage() }}</p>
          }

          @if (upcomingRanges().length) {
            <ul class="divide-y divide-cream-200 rounded-xl border border-cream-200">
              @for (r of upcomingRanges(); track r.id) {
                <li class="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span>
                    <strong class="font-medium text-ink-900">{{ r.label || 'Sin título' }}</strong>
                    <span class="block text-xs text-ink-500">{{ rangeText(r) }} · {{ dayCount(r) }} {{ dayCount(r) === 1 ? 'día' : 'días' }}</span>
                  </span>
                  <button type="button" class="btn-secondary !py-1.5" (click)="removeRange(r)">Quitar</button>
                </li>
              }
            </ul>
          } @else {
            <p class="text-sm text-ink-500">No hay fechas bloqueadas a mano.</p>
          }

          @if (quoteDays().length) {
            <div>
              <h3 class="font-sans text-sm font-semibold text-ink-900">Ocupadas por presupuestos aceptados</h3>
              <ul class="mt-1 flex flex-wrap gap-2 text-xs">
                @for (b of quoteDays(); track b.date) {
                  <li><a [routerLink]="['/admin/presupuestos', b.quoteId]" class="inline-block rounded-full bg-sage-100 px-3 py-1 text-sage-500 hover:underline">{{ fmt(b.date) }} · {{ b.quoteNumber }}</a></li>
                }
              </ul>
            </div>
          }
        </section>

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
  readonly today = new Date().toISOString().slice(0, 10);
  readonly logo = signal<string | null>(null);

  // ---- Fechas bloqueadas (se guardan al momento, sin el botón de guardar) ----
  readonly blockFrom = new FormControl('', { nonNullable: true });
  readonly blockTo = new FormControl('', { nonNullable: true });
  readonly blockLabel = new FormControl('', { nonNullable: true });
  readonly ranges = signal<BlockedRange[]>([]);
  readonly blockedDays = signal<BlockedDate[]>([]);
  readonly blocking = signal(false);
  readonly blockMessage = signal('');
  readonly blockIsError = signal(false);
  readonly upcomingRanges = computed(() => this.ranges().filter((r) => r.to >= this.today).sort((a, b) => a.from.localeCompare(b.from)));
  readonly quoteDays = computed(() => this.blockedDays().filter((b) => b.source === 'quote' && b.date >= this.today).sort((a, b) => a.date.localeCompare(b.date)));
  readonly logoError = signal('');

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
    earlyBooking: this.fb.nonNullable.group({
      percent: [10, [Validators.required, Validators.min(0), Validators.max(100)]],
      days: [30, [Validators.required, Validators.min(1)]],
    }),
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
        earlyBooking: s.earlyBooking,
        pdfObservations: s.pdfObservations,
      });
      this.logo.set(s.logo ?? null);
      this.loadBlocks();
      this.loading.set(false);
    });
  }

  fmt(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  rangeText(r: BlockedRange): string {
    return r.from === r.to ? this.fmt(r.from) : `${this.fmt(r.from)} – ${this.fmt(r.to)}`;
  }

  dayCount(r: BlockedRange): number {
    return daysBetween(r.from, r.to).length;
  }

  private async loadBlocks() {
    try {
      const [ranges, days] = await Promise.all([this.firebase.getBlockedRanges(), this.firebase.getBlockedDates()]);
      this.ranges.set(ranges);
      this.blockedDays.set(days);
    } catch {
      this.showBlock('No se pudieron cargar las fechas bloqueadas.', true);
    }
  }

  private showBlock(msg: string, error: boolean) {
    this.blockMessage.set(msg);
    this.blockIsError.set(error);
  }

  async addRange() {
    const from = this.blockFrom.value;
    const to = this.blockTo.value || from;
    if (!from) return this.showBlock('Indica la fecha de inicio.', true);
    if (to < from) return this.showBlock('La fecha final no puede ser anterior a la inicial.', true);
    this.blocking.set(true);
    try {
      await this.firebase.blockRange(from, to, this.blockLabel.value);
      this.blockFrom.reset();
      this.blockTo.reset();
      this.blockLabel.reset();
      await this.loadBlocks();
      this.showBlock('Fechas bloqueadas.', false);
    } catch (err) {
      if (err instanceof DateBlockedError) {
        const days = [err.date].flat();
        const shown = days.slice(0, 4).map((d) => this.fmt(d)).join(', ');
        this.showBlock(`No se ha bloqueado nada: ya están ocupadas ${shown}${days.length > 4 ? ` y ${days.length - 4} más` : ''}. Quita o ajusta primero esas fechas.`, true);
      } else if (err instanceof Error && err.message === 'INVALID_RANGE') {
        this.showBlock(`El rango no puede superar ${MAX_BLOCK_RANGE_DAYS} días.`, true);
      } else {
        this.showBlock('No se pudo bloquear.', true);
      }
    } finally {
      this.blocking.set(false);
    }
  }

  async removeRange(r: BlockedRange) {
    try {
      await this.firebase.unblockRange(r.id);
      await this.loadBlocks();
      this.showBlock('Fechas liberadas.', false);
    } catch {
      this.showBlock('No se pudo quitar el bloqueo.', true);
    }
  }

  async onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    this.logoError.set('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      this.logoError.set('Formato no válido. Usa PNG, JPG o WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.logoError.set('La imagen supera los 5 MB.');
      return;
    }
    try {
      this.logo.set(await shrinkImage(file));
    } catch {
      this.logoError.set('No se pudo procesar la imagen. Prueba con otra o con un archivo más ligero.');
    }
  }

  removeLogo() {
    this.logo.set(null);
    this.logoError.set('');
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
      logo: this.logo() ?? undefined,
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

const MAX_LOGO_CHARS = 700_000; // el documento de Firestore admite 1 MiB

/** Reduce el logo (máx. 500 px) y lo devuelve como data URL; conserva la transparencia salvo en JPG. */
async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  for (const max of [500, 300]) {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL(mime, 0.9);
    if (url.length <= MAX_LOGO_CHARS) return url;
  }
  throw new Error('logo demasiado pesado');
}
