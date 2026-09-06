import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  // Workspace paketleri KAYNAK TS yayınlar (dist yok) — bundle'a gömülmeleri ZORUNLU
  // (Klasman go-live provası bulgusu). Node bağımlılıkları (pg) external kalır.
  noExternal: [/^@veritut\//],
});
