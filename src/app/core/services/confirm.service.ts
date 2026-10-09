import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (accepted: boolean) => void;
}

/** Muestra un modal de confirmación (renderizado por ConfirmHost) y devuelve la decisión del usuario. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly pending = signal<PendingConfirm | null>(null);

  confirm(options: ConfirmOptions): Promise<boolean> {
    this.pending()?.resolve(false); // si ya había uno abierto, se cancela
    return new Promise<boolean>((resolve) => this.pending.set({ ...options, resolve }));
  }

  answer(accepted: boolean): void {
    const current = this.pending();
    this.pending.set(null);
    current?.resolve(accepted);
  }
}
