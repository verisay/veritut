/**
 * Tema store'u (rune) — `.svelte.ts` uzantısı ŞART. Class-based `.dark`; FOUC init app.html'de.
 */
let dark = $state(false);

export function initTheme(): void {
  if (typeof document === 'undefined') return;
  dark = document.documentElement.classList.contains('dark');
}

export function isDark(): boolean {
  return dark;
}

export function setDark(v: boolean): void {
  dark = v;
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', v);
  try {
    localStorage.setItem('theme', v ? 'dark' : 'light');
  } catch {
    /* erişilemezse sessiz */
  }
}

export function toggleTheme(): void {
  setDark(!dark);
}
