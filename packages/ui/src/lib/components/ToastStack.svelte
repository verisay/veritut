<script lang="ts">
  import { toasts, dismiss } from '../toast.svelte.js';
  const glyph = { success: '✓', error: '✕', warning: '!', info: '·' } as const;
  const dotState = { success: 'ok', error: 'down', warning: 'degraded', info: 'maintenance' } as const;
</script>

<div class="vt-toast-stack" aria-live="polite">
  {#each toasts() as t (t.id)}
    <div class="vt-toast" data-kind={t.kind} role="status">
      <span class="vt-dot" data-state={dotState[t.kind]}>{glyph[t.kind]}</span>
      <span style="flex:1">{t.text}</span>
      <button type="button" class="vt-btn vt-btn-ghost vt-btn-sm" onclick={() => dismiss(t.id)} aria-label="Kapat">✕</button>
    </div>
  {/each}
</div>
