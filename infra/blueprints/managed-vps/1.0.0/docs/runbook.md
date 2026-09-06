# managed-vps runbook
- **SSH:** yalnız anahtar; runner anahtarı + müşteri anahtarı. Parola kapalı.
- **Yama:** unattended-upgrades günlük; yeniden başlatma gerekiyorsa `patch` çalıştırması (K4 bakım penceresi).
- **Yedek:** `/opt/veritut/backup.sh` (restic) cron 02:00; sonuç API'ye raporlanır. Elle: `bash /opt/veritut/backup.sh`.
- **Kesinti:** `hcloud server reset` yalnız kıdemli; her müdahale erişim oturumu olarak kanıtlanır.
- **Boyut değişimi:** `resize` çalıştırması; server_type değişimi yeniden yaratma değil, Hetzner rescale (kesintili) — plan diff'e göre onay.
