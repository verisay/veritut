import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // Workspace paketleri kaynak TS (dist yok) — SSR'da bundle'a alınmaları ZORUNLU (KD tuzağı).
  ssr: { noExternal: [/^@veritut\//] },
  server: {
    port: 5242,
    strictPort: true,
    hmr: { clientPort: 443, protocol: 'wss' },
    allowedHosts: ['.dev-fethi.entra.net', 'localhost', 'portal', 'ops', 'status', 'api'],
  },
});
