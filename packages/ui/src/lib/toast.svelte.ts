/** Toast store (rune) — `.svelte.ts` şart. Bileşen: ToastStack. */
export type ToastKind = 'success' | 'error' | 'warning' | 'info';
export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

let items = $state<ToastItem[]>([]);
let seq = 0;

export function toasts(): ToastItem[] {
  return items;
}

export function toast(text: string, kind: ToastKind = 'success', ttlMs = 4200): void {
  const id = ++seq;
  items = [...items, { id, kind, text }];
  setTimeout(() => dismiss(id), ttlMs);
}

export function dismiss(id: number): void {
  items = items.filter((t) => t.id !== id);
}
