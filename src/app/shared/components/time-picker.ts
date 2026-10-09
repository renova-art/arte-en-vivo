import { Component, ElementRef, HostListener, Injector, afterNextRender, computed, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const pad = (n: number) => String(n).padStart(2, '0');

/** Selector de hora con el estilo de la app. Valor: 'HH:mm'. Compatible con ngModel y formularios reactivos. */
@Component({
  selector: 'app-time-picker',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimePicker), multi: true }],
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
        <span [class.text-ink-500]="!value()" [class.opacity-60]="!value()">{{ value() || placeholder() }}</span>
        <svg class="h-4 w-4 shrink-0 text-blush-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
        </svg>
      </button>

      @if (open()) {
        <div role="dialog" aria-label="Seleccionar hora" class="absolute left-0 z-40 mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-2xl border border-cream-200 bg-white p-3 shadow-xl">
          <div class="mb-1 grid grid-cols-2 text-center text-xs font-medium text-ink-500">
            <span>Hora</span><span>Minutos</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div data-col class="relative max-h-56 space-y-1 overflow-y-auto pr-1 text-center text-sm" role="listbox" aria-label="Hora">
              @for (h of hours; track h) {
                <button type="button" class="block w-full rounded-lg py-1.5 transition" [class]="optionClass(h === hour())" [attr.aria-pressed]="h === hour()" (click)="pickHour(h)">{{ pad(h) }}</button>
              }
            </div>
            <div data-col class="relative max-h-56 space-y-1 overflow-y-auto pr-1 text-center text-sm" role="listbox" aria-label="Minutos">
              @for (m of minutes(); track m) {
                <button type="button" class="block w-full rounded-lg py-1.5 transition" [class]="optionClass(m === minute())" [attr.aria-pressed]="m === minute()" (click)="pickMinute(m)">{{ pad(m) }}</button>
              }
            </div>
          </div>
          <div class="mt-2 flex items-center justify-between border-t border-cream-200 pt-2 text-xs">
            <span class="px-3 py-1 text-ink-500">{{ value() ? value() : 'Elige hora y minutos' }}</span>
            <span class="flex gap-1">
              @if (clearable() && value()) {
                <button type="button" class="rounded-full px-3 py-1 text-ink-500 hover:bg-cream-100" (click)="clear()">Borrar</button>
              }
              <button type="button" class="rounded-full px-3 py-1 text-blush-500 hover:bg-blush-100" (click)="close()">Listo</button>
            </span>
          </div>
        </div>
      }
    </div>
  `,
})
export class TimePicker implements ControlValueAccessor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  inputId = input('');
  placeholder = input('Selecciona la hora');
  minuteStep = input(15); // paso de los minutos (15 → 00, 15, 30, 45)
  invalid = input(false);
  clearable = input(false);

  readonly pad = pad;
  readonly hours = Array.from({ length: 24 }, (_, i) => i);
  readonly minutes = computed(() => Array.from({ length: Math.ceil(60 / this.minuteStep()) }, (_, i) => i * this.minuteStep()));
  readonly value = signal(''); // 'HH:mm' o ''
  readonly open = signal(false);
  readonly disabled = signal(false);

  readonly hour = computed(() => (this.value() ? Number(this.value().slice(0, 2)) : -1));
  readonly minute = computed(() => (this.value() ? Number(this.value().slice(3, 5)) : -1));

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  // ---- ControlValueAccessor ----
  writeValue(v: string | null): void {
    this.value.set(/^([01]\d|2[0-3]):[0-5]\d$/.test(v ?? '') ? (v as string) : '');
  }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); }

  // ---- Interacción ----
  toggle() {
    if (this.open()) return this.close();
    this.open.set(true);
    afterNextRender(() => this.scrollToSelection(), { injector: this.injector }); // cuando el desplegable ya está pintado
  }

  close() {
    if (this.open()) this.onTouched();
    this.open.set(false);
  }

  /** Al elegir la hora se mantienen los minutos ya elegidos (o :00) y se deja abierto para elegir los minutos. */
  pickHour(h: number) {
    this.emit(h, this.minute() >= 0 ? this.minute() : 0);
  }

  /** Elegir los minutos cierra el selector. Si aún no hay hora, se parte de las 12. */
  pickMinute(m: number) {
    this.emit(this.hour() >= 0 ? this.hour() : 12, m);
    this.close();
  }

  clear() {
    this.value.set('');
    this.onChange('');
    this.close();
  }

  optionClass(selected: boolean): string {
    return selected ? 'bg-blush-400 font-semibold text-white hover:bg-blush-500' : 'text-ink-900 hover:bg-blush-100';
  }

  private emit(h: number, m: number) {
    const v = `${pad(h)}:${pad(m)}`;
    this.value.set(v);
    this.onChange(v);
  }

  /** Centra la hora y los minutos seleccionados (o las 09:00 si no hay valor) en sus columnas. */
  private scrollToSelection() {
    this.host.nativeElement.querySelectorAll<HTMLElement>('[data-col]').forEach((col, i) => {
      const target = col.querySelector<HTMLElement>('[aria-pressed=true]') ?? (i === 0 ? col.children[9] : col.children[0]);
      if (target instanceof HTMLElement) col.scrollTop = target.offsetTop - col.clientHeight / 2 + target.clientHeight / 2;
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: Event) {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.close();
  }
}
