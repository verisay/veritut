<script lang="ts">
  import { Card } from '@veritut/ui';
  let { data } = $props();
</script>
<h1 class="vt-h1" style="margin-bottom:16px">Davet</h1>
<Card><p style="margin:0" class="vt-state-text" data-state="down">{data.error}</p><p class="vt-help" style="margin:8px 0 0">Davet, gönderildiği e-posta adresiyle giriş yapan kullanıcı tarafından kabul edilebilir.</p></Card>
