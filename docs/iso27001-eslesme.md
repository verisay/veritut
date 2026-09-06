# ISO 27001 hazırlık eşlemesi (K4 çıktısı)

Amaç: denetimde "bu kontrolü nasıl kanıtlıyorsunuz?" sorusuna **sistemden üretilen** kanıtla cevap vermek.
Aşağıdaki maddelerde "sistemden kanıtlanır" işaretli olanlar için ekran görüntüsü veya beyan değil, değiştirilemez kayıt sunulur.

| Kontrol (Ek A) | Nasıl karşılanıyor | Kanıt kaynağı | Durum |
| --- | --- | --- | --- |
| A.5.15 Erişim denetimi | Keycloak iki realm; kiracı rolleri ve personel rolleri ayrı; fail-closed guard | `audit_log`, `tenant_members`, `staff` | sistemden kanıtlanır |
| A.5.16 Kimlik yönetimi | Parola VERITUT'ta saklanmaz; personel realm'inde MFA zorunlu | Keycloak realm ayarı | kısmi — prod realm export'u ile tamam |
| A.5.18 Erişim hakları | Rol değişimi ve üyelik çıkarma denetim kaydına düşer | `audit_log` | sistemden kanıtlanır |
| A.5.23 Bulut hizmetleri güvenliği | Tedarikçi hesabı başına en dar kapsam; ≥2 hesap politikası; çıkış planı alanı | `provider_accounts`, ops uyarısı | sistemden kanıtlanır |
| A.5.30 Süreklilik hazırlığı | Aylık geri dönüş tatbikatı; sonuç kanıt zincirinde | `restore_drills`, `evidence_events` | sistemden kanıtlanır |
| A.8.9 Yapılandırma yönetimi | Her ortam kod olarak; gece sapma taraması | `drift_reports`, `runs` | sistemden kanıtlanır |
| A.8.12 Veri sızıntısı önleme | Sırlar asimetrik zarfla; API çözemez; loglarda redaksiyon | `seal.ts` testi, pino redact | sistemden kanıtlanır |
| A.8.13 Yedekleme | 3-2-1 politika kodda zorlanır; offsite farklı tedarikçide | `backup_policies` 422 testi, `backup_jobs` | sistemden kanıtlanır |
| A.8.15 Günlük kaydı | Denetim kaydı 5 yıl; kanıt defteri 10 yıl, append-only (DB trigger) | `audit_log`, `evidence_events` | sistemden kanıtlanır |
| A.8.16 İzleme | Sonda + Alertmanager; alarm → olay kuralı; gürültü raporu | `alerts`, `incidents` | sistemden kanıtlanır |
| A.8.32 Değişiklik yönetimi | Yüksek riskli değişiklik dört-göz onayı; her mutasyon bir çalıştırma | `changes`, `runs.approved_by` | sistemden kanıtlanır |
| A.5.24-5.26 Olay yönetimi | Olay yaşam döngüsü, SLA saati, sev1/sev2 post-mortem zorunlu | `incidents`, `incident_updates` | sistemden kanıtlanır |
| A.5.19-5.22 Tedarikçi ilişkileri | Alt işleyen listesi otomatik üretilir, değişimde bildirim | `documents(subprocessors)` | sistemden kanıtlanır |
| A.5.34 Gizlilik ve KVKK | DPA, aydınlatma metni, ikametgâh kuralı kodda | `documents(dpa)`, `policy/residency.ts` | taslak — hukuk onayı bekliyor |
| A.5.7 Tehdit istihbaratı | — | — | açık (K5+) |
| A.8.7 Zararlı yazılıma karşı koruma | Hedef sunucularda temel sertleştirme var; EDR yok | `docker-host` rolü | kısmi |
| A.6.3 Farkındalık eğitimi | — | — | açık (süreç, kod dışı) |

## Denetim paketi nasıl verilir
1. Müşteri portalda **Belgeler**'den dönem seçip kanıt paketini üretir (PDF + JSON eki, SHA-256'lı).
2. **Güvence** sekmesinden denetçi bağlantısı oluşturur: süreli, kapsamlı, kimliksiz salt-okuma.
3. Denetçi zincir bütünlüğünü kendi doğrular; olay içerikleri paylaşılmaz, doğrulanabilir özet ve belgeler paylaşılır.

## Açık maddeler
- Personel MFA'nın prod realm export'unda `CONFIGURE_TOTP` zorunlu olması (dev'de kapalı — `docs/kararlar.md` #5).
- Teleport CE kurulumu (oturum kaydı) — uç ve kanıt akışı hazır (`access.session`), altyapı kurulumu prod işidir.
- Hukuk onayı: DPA, hizmet şartları, KVKK aydınlatma metni.
