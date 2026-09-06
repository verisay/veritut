<script lang="ts">
  interface Tab {
    id: string;
    label: string;
  }
  let { tabs, active = $bindable(), onchange }: { tabs: Tab[]; active: string; onchange?: (id: string) => void } = $props();
</script>

<div class="vt-tabs" role="tablist">
  {#each tabs as t (t.id)}
    <button
      type="button"
      role="tab"
      class="vt-tab"
      aria-selected={active === t.id}
      onclick={() => {
        active = t.id;
        onchange?.(t.id);
      }}>{t.label}</button
    >
  {/each}
</div>
