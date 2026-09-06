<script lang="ts">
  import { Card } from '@veritut/ui';
</script>

<svelte:head><title>Giriş — VERITUT Ops</title></svelte:head>
<div style="min-height:100vh; display:grid; place-items:center; padding:20px">
  <Card>
    <div style="display:grid; gap:14px; width:360px; max-width:100%">
      <img src="/veritut-logo.png" alt="VERITUT" style="height:30px; justify-self:start" />
      <p class="vt-kicker" style="margin:0">Operasyon paneli</p>
      <p class="vt-help" style="margin:0">Personel realm'i ile giriş. MFA zorunludur; her oturum denetim kaydına düşer.</p>
      <a href="/api/v1/auth/login?realm=ops" class="vt-btn vt-btn-primary vt-btn-full" rel="external">Kimlik ile giriş yap</a>
    </div>
  </Card>
</div>
