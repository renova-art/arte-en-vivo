import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppSettings, BlockedDate, BlockedRange, EventType, ProviderPerson, Tariff } from '../../../core/models';
import { DatePicker } from '../../../shared/components/date-picker';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { defaultSignatureNames } from '../../../core/config/signature';
import { EVENT_TYPE_LABELS, MAX_BLOCK_RANGE_DAYS, VAT_EXEMPTION_TEXT, defaultTariffs } from '../../../core/config/defaults';
import { DateBlockedError, FirebaseService, daysBetween } from '../../../core/services/firebase.service';

type Domain = 'estudio' | 'presupuestos' | 'tarifas' | 'pdf';
type Tab = Domain | 'fechas';

/** Controles del formulario que guarda cada pestaña. */
const DOMAIN_CONTROLS: Record<Domain, string[]> = {
  estudio: ['studio', 'providers'],
  presupuestos: ['initialQuoteNumber', 'currentYear', 'earlyBooking', 'vatExempt'],
  tarifas: ['tariffs', 'nightSurcharge'],
  pdf: ['signature', 'pdfObservations'],
};

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
      <nav class="mt-5 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-cream-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Secciones de la configuración">
        @for (t of tabs; track t.id) {
          <button
            type="button"
            role="tab"
            class="whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition"
            [class]="tab() === t.id ? 'border-blush-400 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900'"
            [attr.aria-selected]="tab() === t.id"
            (click)="selectTab(t.id)"
          >
            {{ t.label }}
            @if (domainDirty(t.id)) { <span class="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500" title="Cambios sin guardar"></span> }
          </button>
        }
      </nav>

      <form [formGroup]="form" class="mt-6">
        @if (tab() === 'estudio') {
          <div class="space-y-6">
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

            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn-primary" [disabled]="!domainDirty('estudio') || !domainValid('estudio') || saving()" (click)="saveDomain('estudio')">{{ saving() && messageTab() === 'estudio' ? 'Guardando…' : 'Guardar estudio y proveedoras' }}</button>
              @if (!domainValid('estudio')) {
                <span class="text-xs text-red-600">Hay campos obligatorios sin rellenar.</span>
              } @else if (message() && messageTab() === 'estudio') {
                <span class="text-sm" [class.text-sage-500]="!isError()" [class.text-red-600]="isError()">{{ message() }}</span>
              } @else if (domainDirty('estudio')) {
                <span class="text-xs text-amber-700">Tienes cambios sin guardar en esta pestaña.</span>
              }
            </div>
          </div>
        }
        @if (tab() === 'presupuestos') {
          <div class="space-y-6">
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

            <section class="card space-y-3">
              <h2 class="text-xl font-semibold">IVA</h2>
              <label class="flex items-start gap-3 text-sm">
                <input type="checkbox" class="mt-1 accent-blush-400" formControlName="vatExempt" />
                <span>Operaciones exentas de IVA (art. 20.Uno.26.º, Ley 37/1992)</span>
              </label>
              <p class="text-xs text-ink-500">Si está marcado, el PDF de cada presupuesto incluye esta mención: «{{ vatText }}»</p>
            </section>

            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn-primary" [disabled]="!domainDirty('presupuestos') || !domainValid('presupuestos') || saving()" (click)="saveDomain('presupuestos')">{{ saving() && messageTab() === 'presupuestos' ? 'Guardando…' : 'Guardar presupuestos y precios' }}</button>
              @if (!domainValid('presupuestos')) {
                <span class="text-xs text-red-600">Hay campos obligatorios sin rellenar.</span>
              } @else if (message() && messageTab() === 'presupuestos') {
                <span class="text-sm" [class.text-sage-500]="!isError()" [class.text-red-600]="isError()">{{ message() }}</span>
              } @else if (domainDirty('presupuestos')) {
                <span class="text-xs text-amber-700">Tienes cambios sin guardar en esta pestaña.</span>
              }
            </div>
          </div>
        }
        @if (tab() === 'tarifas') {
          <div class="space-y-6">
            <section class="card grid gap-4 sm:grid-cols-2">
              <h2 class="text-xl font-semibold sm:col-span-2">Plus de nocturnidad</h2>
              <div>
                <label class="label" for="night">Importe por hora (€)</label>
                <input id="night" type="number" min="0" step="1" class="input" formControlName="nightSurcharge" />
              </div>
              <p class="self-end text-xs text-ink-500">Se suma por cada hora de servicio a partir de las 22:00 (hora de inicio + horas contratadas) y aparece como un concepto aparte en el presupuesto. Afecta a todas las tarifas.</p>
            </section>

            <p class="text-sm text-ink-500">Cada tarifa define el precio por hora según el número de invitados y se aplica a los tipos de evento que le asignes. Los tipos de evento que no estén en ninguna tarifa usan la primera. No afecta a los presupuestos ya creados.</p>

            <div formArrayName="tariffs" class="space-y-6">
              @for (t of tariffs.controls; track t; let i = $index) {
                <section class="card space-y-4" [formGroupName]="i">
                  <div class="flex flex-wrap items-end gap-3">
                    <div class="min-w-[14rem] flex-1">
                      <label class="label" [for]="'tf-name-' + i">Nombre de la tarifa</label>
                      <input [id]="'tf-name-' + i" class="input" formControlName="name" placeholder="Ej: Bodas, bautizos y comuniones" />
                    </div>
                    <button type="button" class="btn-secondary" (click)="removeTariff(i)" [disabled]="tariffs.length <= 1">Eliminar tarifa</button>
                  </div>

                  <fieldset>
                    <legend class="label">Se aplica a</legend>
                    <div class="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                      @for (et of eventTypes; track et.value) {
                        <label class="flex items-center gap-2">
                          <input type="checkbox" class="accent-blush-400" [checked]="typeChecked(i, et.value)" (change)="toggleType(i, et.value, $any($event.target).checked)" />
                          {{ et.label }}
                        </label>
                      }
                    </div>
                    @if (i === 0) {
                      <p class="mt-1 text-xs text-ink-500">Tarifa por defecto: también se usa para los tipos de evento sin tarifa asignada.</p>
                    } @else if (!typesOf(i).length) {
                      <p class="mt-1 text-xs text-amber-700">Sin tipos de evento asignados: esta tarifa no se aplicará a ningún evento.</p>
                    }
                  </fieldset>

                  <div formArrayName="tiers" class="space-y-3">
                    @for (tier of tiersOf(i).controls; track tier; let j = $index) {
                      <div [formGroupName]="j" class="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                        <div><label class="label">Desde (invitados)</label><input type="number" min="0" class="input" formControlName="minGuests" /></div>
                        <div><label class="label">Hasta (vacío = sin límite)</label><input type="number" min="0" class="input" formControlName="maxGuests" /></div>
                        <div><label class="label">€/hora</label><input type="number" min="0" step="0.01" class="input" formControlName="pricePerHour" /></div>
                        <button type="button" class="btn-secondary" (click)="removeTier(i, j)" [disabled]="tiersOf(i).length <= 1">Quitar</button>
                      </div>
                    }
                  </div>
                  <button type="button" class="btn-secondary" (click)="addTier(i)">+ Añadir tramo</button>
                </section>
              }
            </div>

            <button type="button" class="btn-secondary" (click)="addTariff()">+ Añadir tarifa</button>

            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn-primary" [disabled]="!domainDirty('tarifas') || !domainValid('tarifas') || saving()" (click)="saveDomain('tarifas')">{{ saving() && messageTab() === 'tarifas' ? 'Guardando…' : 'Guardar tarifas' }}</button>
              @if (!domainValid('tarifas')) {
                <span class="text-xs text-red-600">Hay campos obligatorios sin rellenar.</span>
              } @else if (message() && messageTab() === 'tarifas') {
                <span class="text-sm" [class.text-sage-500]="!isError()" [class.text-red-600]="isError()">{{ message() }}</span>
              } @else if (domainDirty('tarifas')) {
                <span class="text-xs text-amber-700">Tienes cambios sin guardar en esta pestaña.</span>
              }
            </div>
          </div>
        }
        @if (tab() === 'pdf') {
          <div class="space-y-6">
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
                  <p class="text-xs text-ink-500">PNG, JPG o WEBP. Sustituye al círculo con la inicial en la esquina superior izquierda del PDF. Se aplica al guardar esta pestaña.</p>
                  @if (logoError()) { <p class="error">{{ logoError() }}</p> }
                </div>
              </div>
            </section>

            <section class="card grid gap-4 sm:grid-cols-2" formGroupName="signature">
              <h2 class="text-xl font-semibold sm:col-span-2">Firma del PDF</h2>
              <div>
                <label class="label" for="sg-greeting">Despedida</label>
                <input id="sg-greeting" class="input" formControlName="greeting" placeholder="Atentamente," />
              </div>
              <div>
                <label class="label" for="sg-names">Nombres</label>
                <input id="sg-names" class="input" formControlName="names" [placeholder]="signaturePlaceholder()" />
              </div>
              <p class="text-xs text-ink-500 sm:col-span-2">Aparece al final del presupuesto, a la izquierda.</p>
            </section>

            <section class="card">
              <h2 class="text-xl font-semibold">Observaciones del PDF</h2>
              <textarea rows="4" class="input mt-3" formControlName="pdfObservations"></textarea>
            </section>

            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn-primary" [disabled]="!domainDirty('pdf') || !domainValid('pdf') || saving()" (click)="saveDomain('pdf')">{{ saving() && messageTab() === 'pdf' ? 'Guardando…' : 'Guardar PDF' }}</button>
              @if (!domainValid('pdf')) {
                <span class="text-xs text-red-600">Hay campos obligatorios sin rellenar.</span>
              } @else if (message() && messageTab() === 'pdf') {
                <span class="text-sm" [class.text-sage-500]="!isError()" [class.text-red-600]="isError()">{{ message() }}</span>
              } @else if (domainDirty('pdf')) {
                <span class="text-xs text-amber-700">Tienes cambios sin guardar en esta pestaña.</span>
              }
            </div>
          </div>
        }
        @if (tab() === 'fechas') {
          <div class="space-y-6">
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
          </div>
        }
      </form>
    }
  `,
})
export class Settings implements HasUnsavedChanges {
  private readonly fb = inject(FormBuilder);
  private readonly firebase = inject(FirebaseService);

  readonly loading = signal(true);
  readonly tab = signal<Tab>('estudio');
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'estudio', label: 'Estudio y proveedoras' },
    { id: 'presupuestos', label: 'Presupuestos' },
    { id: 'tarifas', label: 'Tarifas' },
    { id: 'pdf', label: 'PDF' },
    { id: 'fechas', label: 'Fechas bloqueadas' },
  ];
  /** Última configuración guardada: cada pestaña guarda solo sus datos sobre esta base. */
  private readonly saved = signal<AppSettings | null>(null);
  readonly messageTab = signal<Domain | null>(null);
  readonly saving = signal(false);
  readonly message = signal('');
  readonly isError = signal(false);
  readonly vatText = VAT_EXEMPTION_TEXT;
  readonly eventTypes = (Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((value) => ({ value, label: EVENT_TYPE_LABELS[value] }));
  readonly today = new Date().toISOString().slice(0, 10);
  readonly logo = signal<string | null>(null);
  private readonly logoChanged = signal(false); // el logo no forma parte del formulario reactivo

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
    tariffs: this.fb.array([this.tariffGroup(defaultTariffs([{ minGuests: 0, maxGuests: null, pricePerHour: 0 }])[0])]),
    earlyBooking: this.fb.nonNullable.group({
      percent: [10, [Validators.required, Validators.min(0), Validators.max(100)]],
      days: [30, [Validators.required, Validators.min(1)]],
    }),
    signature: this.fb.nonNullable.group({
      greeting: ['Atentamente,'],
      names: [''],
    }),
    nightSurcharge: [20, [Validators.required, Validators.min(0)]],
    vatExempt: [true],
    pdfObservations: [''],
  });

  get providers(): FormArray {
    return this.form.controls.providers as unknown as FormArray;
  }

  get tariffs(): FormArray {
    return this.form.controls.tariffs as unknown as FormArray;
  }

  tiersOf(i: number): FormArray {
    return this.tariffs.at(i).get('tiers') as FormArray;
  }

  constructor() {
    this.firebase.getSettings().then((s) => {
      this.providers.clear();
      s.providers.forEach((p) => this.providers.push(this.providerGroup(p)));
      this.tariffs.clear();
      s.tariffs.forEach((t) => this.tariffs.push(this.tariffGroup(t)));
      this.form.patchValue({
        initialQuoteNumber: s.initialQuoteNumber,
        currentYear: s.currentYear,
        studio: s.studio,
        earlyBooking: s.earlyBooking,
        signature: s.signature,
        vatExempt: s.vatExempt,
        nightSurcharge: s.nightSurcharge,
        pdfObservations: s.pdfObservations,
      });
      this.saved.set(s);
      this.logo.set(s.logo ?? null);
      this.form.markAsPristine();
      this.loadBlocks();
      this.loading.set(false);
    });
  }

  /** Nombres que se usarán en la firma si el campo está vacío. */
  signaturePlaceholder(): string {
    return defaultSignatureNames(this.providers.getRawValue() as ProviderPerson[]);
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
      this.logoChanged.set(true);
    } catch {
      this.logoError.set('No se pudo procesar la imagen. Prueba con otra o con un archivo más ligero.');
    }
  }

  removeLogo() {
    this.logo.set(null);
    this.logoChanged.set(true);
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

  /** Cambios sin guardar en el formulario (los bloqueos de fechas se guardan al momento y no cuentan). */
  hasUnsavedChanges(): boolean {
    return this.form.dirty || this.logoChanged();
  }

  /** Aviso del navegador al recargar o cerrar la pestaña con cambios sin guardar. */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  private tariffGroup(t: Tariff) {
    return this.fb.group({
      id: [t.id],
      name: [t.name, Validators.required],
      eventTypes: [[...t.eventTypes] as EventType[]],
      tiers: this.fb.array(t.tiers.map((x) => this.tierGroup(x.minGuests, x.maxGuests, x.pricePerHour))),
    });
  }

  typesOf(i: number): EventType[] {
    return this.tariffs.at(i).get('eventTypes')!.value as EventType[];
  }

  typeChecked(i: number, type: EventType): boolean {
    return this.typesOf(i).includes(type);
  }

  /** Cada tipo de evento pertenece a una sola tarifa: al marcarlo aquí, se quita de las demás. */
  toggleType(i: number, type: EventType, checked: boolean) {
    this.tariffs.controls.forEach((g, j) => {
      const ctrl = g.get('eventTypes')!;
      const types = (ctrl.value as EventType[]).filter((t) => t !== type);
      ctrl.setValue(checked && j === i ? [...types, type] : types);
      ctrl.markAsDirty();
    });
  }

  addTariff() {
    const first = this.tariffs.at(0)?.value as Tariff | undefined;
    this.tariffs.push(
      this.tariffGroup({
        id: crypto.randomUUID(),
        name: 'Nueva tarifa',
        eventTypes: [],
        tiers: first?.tiers ?? [{ minGuests: 0, maxGuests: null, pricePerHour: 0 }], // parte de los precios de la primera
      }),
    );
    this.tariffs.markAsDirty();
  }

  removeTariff(i: number) {
    this.tariffs.removeAt(i);
    this.tariffs.markAsDirty();
  }

  addTier(i: number) {
    const tiers = this.tiersOf(i);
    const last = tiers.at(tiers.length - 1)?.value;
    const min = last?.maxGuests != null ? last.maxGuests + 1 : 0;
    tiers.push(this.tierGroup(min, null, last?.pricePerHour ?? 0));
    tiers.markAsDirty();
  }

  removeTier(i: number, j: number) {
    const tiers = this.tiersOf(i);
    tiers.removeAt(j);
    tiers.markAsDirty();
  }

  selectTab(tab: Tab) {
    this.tab.set(tab);
    this.message.set('');
  }

  private controlsOf(domain: Domain) {
    return DOMAIN_CONTROLS[domain].map((k) => this.form.get(k)!);
  }

  /** ¿Hay cambios sin guardar en esa pestaña? Las fechas bloqueadas se guardan al momento. */
  domainDirty(tab: Tab): boolean {
    if (tab === 'fechas') return false;
    return this.controlsOf(tab).some((c) => c.dirty) || (tab === 'pdf' && this.logoChanged());
  }

  domainValid(tab: Tab): boolean {
    return tab === 'fechas' || this.controlsOf(tab).every((c) => c.valid);
  }

  /** Datos de una pestaña, listos para fusionar con la última configuración guardada. */
  private patchOf(domain: Domain): Partial<AppSettings> {
    const v = this.form.getRawValue();
    switch (domain) {
      case 'estudio':
        return {
          studio: v.studio,
          providers: (v.providers as ProviderPerson[]).map((p) => ({ ...p, bankAccount: p.bankAccount.trim() })),
        };
      case 'presupuestos':
        return {
          initialQuoteNumber: v.initialQuoteNumber,
          currentYear: v.currentYear,
          earlyBooking: v.earlyBooking,
          vatExempt: v.vatExempt,
        };
      case 'tarifas':
        return {
          nightSurcharge: Number(v.nightSurcharge),
          tariffs: (v.tariffs as any[]).map((t) => ({
            id: t.id,
            name: String(t.name).trim(),
            eventTypes: t.eventTypes as EventType[],
            tiers: (t.tiers as any[])
              .map((x) => ({
                minGuests: Number(x.minGuests),
                maxGuests: x.maxGuests === null || x.maxGuests === '' ? null : Number(x.maxGuests),
                pricePerHour: Number(x.pricePerHour),
              }))
              .sort((a, b) => a.minGuests - b.minGuests),
          })),
        };
      case 'pdf':
        return { signature: v.signature, pdfObservations: v.pdfObservations, logo: this.logo() ?? undefined };
    }
  }

  /** Guarda solo los datos de la pestaña; los cambios pendientes de las demás no se tocan. */
  async saveDomain(domain: Domain) {
    const base = this.saved();
    if (!base || !this.domainValid(domain)) return;
    const next: AppSettings = { ...base, ...this.patchOf(domain) };
    this.saving.set(true);
    this.messageTab.set(domain);
    this.message.set('');
    try {
      await this.firebase.saveSettings(next);
      this.saved.set(next);
      this.controlsOf(domain).forEach((c) => c.markAsPristine());
      if (domain === 'pdf') this.logoChanged.set(false);
      this.isError.set(false);
      this.message.set('Guardado.');
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
