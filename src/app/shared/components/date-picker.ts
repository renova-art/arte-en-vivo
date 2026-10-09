import { Component, ElementRef, HostListener, computed, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`; // m: 0-11
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

interface Day {
  iso: string;
  day: number;
  inMonth: boolean;
}

/** Selector de fecha con el estilo de la app. Valor: 'YYYY-MM-DD'. Compatible con ngModel y formularios reactivos. */
@Component({
  selector: 'app-date-picker',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DatePicker), multi: true }],
  template: `
    <div class="relative">
      <button
        type="button"
        class="input flex items-center justify-between gap-2 text-left"
        [class.invalid]="invalid()"
        [id]="inputId()"
        [disabled]="disabled()"
        aria-haspopup="dialog"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
      >
        <span [class.text-ink-500]="!value()" [class.opacity-60]="!value()">{{ label() }}</span>
        <svg class="h-4 w-4 shrink-0 text-blush-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>

      @if (open()) {
        <div
          role="dialog"
          aria-label="Calendario"
          class="absolute left-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-cream-200 bg-white p-3 shadow-xl"
        >
          <div class="mb-2 flex items-center justify-between">
            <button type="button" class="rounded-full p-2 text-ink-500 hover:bg-blush-100" aria-label="Mes anterior" (click)="shift(-1)">‹</button>
            <span class="font-serif text-lg font-semibold text-ink-900">{{ monthLabel() }}</span>
            <button type="button" class="rounded-full p-2 text-ink-500 hover:bg-blush-100" aria-label="Mes siguiente" (click)="shift(1)">›</button>
          </div>

          <div class="grid grid-cols-7 text-center text-xs font-medium text-ink-500">
            @for (w of weekdays; track w) { <span class="py-1">{{ w }}</span> }
          </div>
          <div class="grid grid-cols-7 gap-y-1 text-center text-sm">
            @for (d of days(); track d.iso) {
              <button
                type="button"
                class="mx-auto h-9 w-9 rounded-full transition disabled:cursor-not-allowed disabled:opacity-30"
                [class]="dayClass(d)"
                [disabled]="isOutOfRange(d.iso)"
                [attr.aria-label]="isUnavailable(d.iso) ? d.iso + ' - ' + unavailableMessage() : d.iso"
                [attr.aria-disabled]="isUnavailable(d.iso) ? true : null"
                [attr.title]="isUnavailable(d.iso) ? unavailableMessage() : null"
                [attr.aria-pressed]="d.iso === value()"
                (click)="onDay(d.iso)"
              >{{ d.day }}</button>
            }
          </div>

          @if (notice()) {
            <p role="status" class="mt-2 rounded-lg bg-blush-100 px-3 py-2 text-xs text-blush-500">{{ notice() }}</p>
          } @else if (unavailable().length) {
            <p class="mt-2 flex items-center gap-2 text-xs text-ink-500">
              <span class="inline-block h-4 w-4 rounded-full bg-blush-100 ring-1 ring-blush-300"></span> No disponible
            </p>
          }

          <div class="mt-2 flex items-center justify-between border-t border-cream-200 pt-2 text-xs">
            <button type="button" class="rounded-full px-3 py-1 text-blush-500 hover:bg-blush-100 disabled:opacity-40" [disabled]="isDisabled(todayIso)" (click)="select(todayIso)">Hoy</button>
            @if (clearable() && value()) {
              <button type="button" class="rounded-full px-3 py-1 text-ink-500 hover:bg-cream-100" (click)="select('')">Borrar</button>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class DatePicker implements ControlValueAccessor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  inputId = input('');
  placeholder = input('Selecciona una fecha');
  min = input(''); // 'YYYY-MM-DD'
  max = input('');
  invalid = input(false);
  clearable = input(false);
  unavailable = input<string[]>([]); // fechas no seleccionables (bloqueadas)
  unavailableMessage = input('Fecha bloqueada por otro evento o por motivos personales');

  private readonly unavailableSet = computed(() => new Set(this.unavailable()));
  readonly weekdays = WEEKDAYS;
  readonly value = signal('');
  readonly open = signal(false);
  readonly notice = signal(''); // motivo mostrado al tocar un día no disponible (útil en móvil)
  readonly disabled = signal(false);
  private readonly view = signal(this.monthOf(new Date()));
  readonly todayIso = (() => { const t = new Date(); return toIso(t.getFullYear(), t.getMonth(), t.getDate()); })();

  readonly label = computed(() => {
    const v = this.value();
    if (!v) return this.placeholder();
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  });

  readonly monthLabel = computed(() => {
    const { y, m } = this.view();
    const text = new Date(y, m, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return text.charAt(0).toUpperCase() + text.slice(1); // solo la inicial en mayúscula
  });

  /** 6 semanas completas, empezando en lunes. */
  readonly days = computed<Day[]>(() => {
    const { y, m } = this.view();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7; // lunes = 0
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(y, m, 1 - offset + i);
      return { iso: toIso(date.getFullYear(), date.getMonth(), date.getDate()), day: date.getDate(), inMonth: date.getMonth() === m };
    });
  });

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  // ---- ControlValueAccessor ----
  writeValue(v: string | null): void {
    this.value.set(v ?? '');
    this.view.set(this.monthOf(this.parse(v) ?? new Date()));
  }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); }

  // ---- Interacción ----
  toggle() {
    if (this.open()) return this.close();
    this.view.set(this.monthOf(this.parse(this.value()) ?? new Date()));
    this.notice.set('');
    this.open.set(true);
  }

  close() {
    if (this.open()) this.onTouched();
    this.open.set(false);
  }

  select(iso: string) {
    if (iso && this.isDisabled(iso)) return;
    this.value.set(iso);
    this.notice.set('');
    this.onChange(iso);
    this.close();
  }

  shift(delta: number) {
    this.notice.set('');
    this.view.update(({ y, m }) => this.monthOf(new Date(y, m + delta, 1)));
  }

  /** Fuera de los límites mín./máx.: botón desactivado. */
  isOutOfRange(iso: string): boolean {
    return (!!this.min() && iso < this.min()) || (!!this.max() && iso > this.max());
  }

  isDisabled(iso: string): boolean {
    return this.isOutOfRange(iso) || this.unavailableSet().has(iso);
  }

  /** Los días no disponibles siguen siendo pulsables para poder explicar el motivo. */
  onDay(iso: string) {
    if (this.isUnavailable(iso) && !this.isOutOfRange(iso)) {
      this.notice.set(this.unavailableMessage());
      return;
    }
    this.select(iso);
  }

  isUnavailable(iso: string): boolean {
    return this.unavailableSet().has(iso);
  }

  dayClass(d: Day): string {
    if (this.isUnavailable(d.iso)) return 'cursor-not-allowed bg-blush-100 font-medium text-blush-500 line-through decoration-2 ring-1 ring-blush-200';
    if (d.iso === this.value()) return 'bg-blush-400 font-semibold text-white hover:bg-blush-500';
    const today = d.iso === this.todayIso ? 'ring-1 ring-blush-300 ' : '';
    return today + (d.inMonth ? 'text-ink-900 hover:bg-blush-100' : 'text-ink-500/50 hover:bg-cream-100');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: Event) {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.close();
  }

  private parse(v: string | null | undefined): Date | null {
    if (!v) return null;
    const [y, m, d] = v.split('-').map(Number);
    return y ? new Date(y, m - 1, d) : null;
  }

  private monthOf(date: Date) {
    return { y: date.getFullYear(), m: date.getMonth() };
  }
}
