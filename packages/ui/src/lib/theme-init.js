/**
 * FOUC'suz tema init — app.html <head> içine INLINE gömülür (filo deseni).
 * localStorage 'theme' ('light'|'dark') > sistem tercihi; class-based `.dark`.
 * Ops app varsayılan KOYU: app.html'de `data-default-theme="dark"` ile çağrılır.
 */
(function () {
  try {
    var t = localStorage.getItem('theme');
    var def = document.documentElement.getAttribute('data-default-theme');
    var dark = t === 'dark' || (!t && (def === 'dark' || matchMedia('(prefers-color-scheme: dark)').matches));
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {
    /* localStorage erişilemezse light kalır */
  }
})();
