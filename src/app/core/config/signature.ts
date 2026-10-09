import { ProviderPerson } from '../models';

/** Firma por defecto: los nombres de pila de las proveedoras, p. ej. "Elena y Tania". */
export function defaultSignatureNames(providers: Pick<ProviderPerson, 'name'>[]): string {
  const firstNames = providers.map((p) => p.name.trim().split(/\s+/)[0]).filter(Boolean);
  if (firstNames.length <= 1) return firstNames[0] ?? '';
  return `${firstNames.slice(0, -1).join(', ')} y ${firstNames[firstNames.length - 1]}`;
}
