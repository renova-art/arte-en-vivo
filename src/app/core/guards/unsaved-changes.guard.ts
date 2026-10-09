import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ConfirmService } from '../services/confirm.service';

/** Pantallas con formularios que pueden tener cambios sin guardar. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/** Pide confirmación antes de salir de una pantalla de administración con cambios sin guardar. */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component.hasUnsavedChanges()) return true;
  return inject(ConfirmService).confirm({
    title: 'Cambios sin guardar',
    message: 'Has hecho cambios que todavía no se han guardado. Si sales ahora, se perderán.',
    confirmLabel: 'Salir sin guardar',
    cancelLabel: 'Seguir editando',
  });
};
