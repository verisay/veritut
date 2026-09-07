<script lang="ts">
  import { Card, PageHead } from '@veritut/ui';
  let { data } = $props();
</script>
<PageHead title="Davet" />
<Card><p style="margin:0" class="vt-state-text" data-state="down">{data.error}</p><p class="vt-help" style="margin:8px 0 0">Davet, gönderildiği e-posta adresiyle giriş yapan kullanıcı tarafından kabul edilebilir.</p></Card>
