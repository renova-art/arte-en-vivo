import { Pipe, PipeTransform } from '@angular/core';
import { EVENT_TYPE_LABELS } from '../../core/config/defaults';
import { EventType } from '../../core/models';

@Pipe({ name: 'euro', standalone: true })
export class EuroCurrencyPipe implements PipeTransform {
  private readonly fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  transform(value: number | null | undefined): string {
    return this.fmt.format(value ?? 0);
  }
}

@Pipe({ name: 'eventType', standalone: true })
export class EventTypePipe implements PipeTransform {
  transform(value: EventType | null | undefined): string {
    return value ? EVENT_TYPE_LABELS[value] : '';
  }
}
