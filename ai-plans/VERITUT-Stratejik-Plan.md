# VERITUT — Stratejik Plan

**Yönetilen Çoklu-Bulut ve Veri Emaneti Operatörü**

Hazırlayan: Verisay İletişim ve Bilgi Teknolojileri Ltd. Şti.
Tarih: Eylül 2026
Durum: Taslak v1.0 — karar bekleyen 4 madde için bkz. Bölüm 10

---

## 1. Yönetici Özeti

VERITUT, fiziksel bina ve altyapı yatırımı yapmadan kurulan, küresel ve yerel altyapı tedarikçilerinin üzerine inşa edilmiş bir **yönetilen bulut operatörüdür**.

**Ana fikir tek cümlede:** VERITUT bir veri merkezi değil; küresel altyapı tedarikçilerinin üzerine kurulmuş, Türkçe destekli, KVKK uyumlu bir *yönetilen veri emaneti* katmanıdır.

Satılan şey sunucu değil, **sorumluluğun devri**. Müşteri AWS'den veya Hetzner'den zaten sunucu alabilir; alamadığı şey "bunu kim kuracak, kim yedekleyecek, gece 3'te kim müdahale edecek, denetimde belgeyi kim verecek" sorusunun tek muhatabıdır.

Marka adı bu konumlanmayı destekliyor: **veri + tutmak**. Bu nedenle "yeni nesil veri merkezi" ifadesi yerine **"veri emanetçisi / yönetilen bulut operatörü"** konumlanması öneriliyor. Gerekçe yalnızca pazarlama değildir: "data center" iddiası hem müşteride yanlış beklenti (Tier sertifikası, kendi binası, kendi ASN'i) hem de düzenleyici tarafta gereksiz soru yaratır.

**Sermaye mantığı:** varlık-hafif (asset-light). Yatırım binaya değil, **otomasyona, panele, uyumluluk belgelerine ve insan uzmanlığına** yapılır.

---

## 2. Stratejik Konumlanma

| Ne değil | Ne |
|---|---|
| Veri merkezi işletmecisi | Çoklu-bulut ajanslığı + yönetilen servis sağlayıcı (MSP) |
| Hosting bayisi | Uygulama seviyesinde operasyon ortağı |
| Ucuz alternatif | "Tek fatura, tek muhatap, tek sorumlu" |
| Saf yeniden satış (arbitraj) | Emek + otomasyon + uyumluluk marjı |

### 2.1 Rakip haritası

- **Yurt içi:** Natro, Turhost, Radore, Vargonen, Berkut — ürün odaklı, yönetilen servis katmanı zayıf, uygulama seviyesinde sorumluluk almıyorlar.
- **Yurt dışı yönetilen açık kaynak:** Elestio, Cloudron, PikaPods, Coolify Cloud, RunCloud — teknik olarak güçlü, ancak Türkçe insan desteği, yerli fatura ve KVKK belgelendirmesi yok.

**Boşluk tam ortada:** Türkçe insan desteği + yerli fatura + açık kaynak operasyonu + uyumluluk belgesi.

### 2.2 Gerçek rekabet avantajı

1. Verisay'ın 22 yıllık ticari geçmişi ve mevcut müşteri tabanı — sıfırdan müşteri edinme maliyeti yok.
2. Entranet Cloud Suite'in faturalama/CRM omurgası — rakiplerin satın aldığı yazılım katmanı zaten sahipli.
3. Safran Labs portföyünün iç müşteri olması — MesajSepeti, LiftOrbis, Entranet VERISAY altyapısında çalıştığında referans, yük testi ve iç maliyet avantajı bir arada gelir.
4. Sektör dikeylerine erişim — LiftOrbis üzerinden asansör sektörü, MesajSepeti üzerinden iletişim ihtiyacı olan işletmeler.

---

## 3. Hizmet Kataloğu — Dört Katman

Hizmetleri tek listede satmak kafa karıştırır. Dört ayrı satış hikâyesine bölünmelidir.

### Katman 1 — Zemin (self-servis, hacim işi, düşük marj)

Alan adı tescili, paylaşımlı hosting (cPanel / DirectAdmin), DNS yönetimi, SSL sertifikaları, e-posta, tek başına VPS.

- **Amaç:** kâr değil; müşteri edinme kapısı ve nakit döngüsü.
- **Kural:** otomasyon %95 olmalı, insan dokunmamalı. Bu katmanda destek talebi gelirse ürün hatalıdır.

### Katman 2 — Yönetilen Servisler (asıl marj)

Yönetilen sunucu (yama, izleme, sertleştirme, yedekleme, geri dönüş testi), yönetilen veritabanı, S3 uyumlu nesne depolama ve yedekleme, VPN / sıfır-güven erişim (WireGuard, Tailscale/Headscale), Nextcloud, kurumsal e-posta, Kubernetes/Docker platformu, izleme-uyarı (Prometheus + Grafana), olağanüstü durum kurtarma (DR).

- **Fiyatlama birimi:** sunucu başına değil, **yönetilen iş yükü + SLA seviyesi** başına.
- **Marj beklentisi:** %50-70.

### Katman 3 — Açık Kaynak İş Uygulamaları Servisi (farklılaştırıcı)

**Model: yazılım lisansı ücretsiz — sunucu, kurulum, güncelleme, yedekleme ve destek ücretli.**

> Not: İlk brifingde bu hizmetlerin "ücretsiz" verileceği yazılmıştı. Bunun yazım hatası olduğu varsayılmıştır. Sunucu ve bakımın ücretsiz verilmesi, iş modelini ilk 50 müşteride çökertir. Ücretsizlik yalnızca **süreli deneme** olarak kullanılmalıdır.

**Önerilen katalog:** ERPNext, Odoo, n8n, Mattermost, Metabase, Grafana, Zammad, Vaultwarden, Plane, Nextcloud, Matomo, Chatwoot, Directus, Supabase, Keycloak, Uptime Kuma.

**Pazar rüzgârı:** VMware/Broadcom, Zimbra, Microsoft 365 ve Atlassian fiyat artışları kurumları açık kaynağa itiyor, ancak hiçbiri operasyonu üstlenmek istemiyor. 2026 itibarıyla bu boşluk hâlâ açık.

**Lansman için ilk üç ürün önerisi:** n8n, Nextcloud, Zammad.

### Katman 4 — Katma Değerli Danışmanlık (yüksek marj, düşük hacim)

- Bulut maliyet optimizasyonu (FinOps)
- Göç projeleri: VMware → Proxmox, on-prem → bulut, hiperskaler → maliyet-optimum karma yapı
- KVKK / ISO 27001 teknik hazırlık
- AI altyapısı: LLM ağ geçidi, RAG boru hatları, MCP sunucu barındırma, GPU kiralama aracılığı

---

## 4. Çağdaş Gelişmelerle Hizalama

Planın "yeni nesil" olma iddiasını taşıyan asıl unsurlar bunlardır.

**1. Veri egemenliği (sovereign cloud).**
Avrupa'da NIS2 ve DORA, Türkiye'de KVKK ve sektörel yerelleştirme kuralları müşteriyi "verim fiziksel olarak nerede duruyor?" sorusuna zorluyor. VERITUT'un satış argümanı: aynı panelden "Türkiye'de dursun", "AB'de dursun", "ABD'de dursun" seçilebilmesi. Bu, hiperskalerlerin tek başına veremediği esneklik.

**2. AI-hazır altyapı.**
Yönetilen n8n + LLM ağ geçidi + vektör veritabanı + MCP sunucu barındırma. Verisay'ın mevcut MCP/ERP çalışmaları burada doğrudan ürüne dönüşür: *"Kurumsal AI'ınızın altyapısını VERITUT tutar."*

**3. FinOps'un ürün olarak satılması.**
Müşterinin bulut faturasını ölçülebilir biçimde düşürüp tasarrufun bir kısmını almak — sıfır sermaye gerektiren, yüksek marjlı gelir kalemi. Aynı zamanda mükemmel bir kapı açıcı.

**4. Açık kaynak repatriasyonu.**
Lisans maliyetlerinden kaçan kurumların açık kaynağa göçü; operasyon yükünü üstlenecek sağlayıcı arayışı.

**5. Ürün liderliğinde büyüme (PLG).**
Self-servis panel + API + kullanım bazlı faturalama. Büyüme teklif-pazarlık döngüsüne bağlı kalırsa ölçeklenmez.

---

## 5. Teknoloji ve Operasyon Mimarisi

```
        Müşteri Paneli (Entranet tabanlı)
   Faturalama · Sipariş · Ticket · Belge · Durum
                     │
          Kontrol Düzlemi (VERITUT Core)
                     │
      Terraform + Ansible + Proxmox / K8s
              (otomatik kur / yık)
                     │
   ┌────────┬────────┬─────────┬──────────┬─────────┐
  AWS    Google   Hetzner   TR-DC    Cloudflare   ...
```

### 5.1 Kritik teknoloji kararları

| Bileşen | Öneri | Gerekçe |
|---|---|---|
| Faturalama | 6 ay FOSSBilling/Blesta/WHMCS ile başla, paralelde Entranet entegrasyonunu geliştir | Ürün lansmanını kendi yazılımının hızına bağlamak klasik hatadır |
| Kimlik | Keycloak veya Authentik, ilk günden tek oturum açma (SSO) | Sonradan eklenmesi en pahalı katman |
| İzleme | Prometheus + Grafana + Uptime Kuma, müşteriye açık durum sayfası | Şeffaflık, destek yükünü düşürür |
| Yedekleme | Restic/Borg, 3-2-1 kuralı, farklı tedarikçide çevrimdışı kopya | Tedarikçi riskini kırar |
| Provizyon | Her şey kod olarak (IaC). Elle kurulan müşteri ortamı olmasın | Ölçeklenebilirliğin tek yolu |
| Erişim | Bastion + MFA + oturum kaydı | ISO 27001 ön koşulu |

### 5.2 Operasyonel disiplin

- **Geri dönüş testi ayda bir, kayıt altında.** Bu, en güçlü satış kanıtıdır — "yedekliyoruz" diyen çok, "geri döndüğünü kanıtlayan" az.
- **Çalışma kitapları (runbook).** Her tekrarlayan olay için yazılı prosedür; ekip büyüdüğünde tek ölçeklenme yolu.
- **Değişiklik yönetimi.** Üretime elle müdahale yasak; her değişiklik izlenebilir.

---

## 6. Tedarikçi Stratejisi ve Risk Dağıtımı

Bu modelin en büyük yapısal riski tedarikçi bağımlılığı ve sözleşme uyumudur.

| Tedarikçi | Durum ve aksiyon |
|---|---|
| **AWS** | Kendi hesabı altında müşteriye alt hesap açıp yeniden satmak, resmî ortaklık programına girmeden hizmet şartlarına aykırı olabilir. **AWS Partner Network (Solution Provider / Distribution Program)** başvurusu Faz 0'da yapılmalı |
| **Google Cloud** | **Partner Advantage** programı; aynı gerekçe |
| **Hetzner** | Yeniden satışa toleranslı, marj yüksek. Ancak tek hesapta yoğunlaşma tehlikeli: en az iki ayrı hesap, iki ayrı bölge |
| **Türkiye ayağı** | Yerelleştirme gereken müşteriler için bir yerli DC ile kolokasyon/kabin veya yönetilen bare-metal anlaşması |
| **Alan adı** | ICANN akredite bir registrar'ın bayiliği + `.tr` için nic.tr kayıt kuruluşu statüsü veya bayiliği |
| **Cloudflare** | Partner/Enterprise programı üzerinden WAF ve CDN'i paketleyerek satmak |

**Değişmez kural:** Hiçbir hizmet tek tedarikçiye bağlı olmasın; her hizmetin yazılı bir **çıkış planı** bulunsun.

---

## 7. İş Modeli ve Fiyatlama Mantığı

### 7.1 Gelir kalemleri

1. **Yinelenen abonelik (MRR)** — hedef: toplam gelirin %70'i. Değerlemeyi ve nakit öngörülebilirliğini bu kalem taşır.
2. **Kurulum / onboarding bedeli** — tek seferlik, gerçek emeği karşılar, ciddiyet filtresi işlevi görür.
3. **Proje ve danışmanlık** — göç, FinOps, uyumluluk.
4. **Aşım / kullanım bazlı** — trafik, depolama, yedek alanı.
5. **Kazanç paylaşımı** — FinOps tasarrufunun yüzdesi.

### 7.2 Fiyatlama ilkeleri

- **Maliyet + marj değil, değer bazlı fiyatlama.** "Tedarikçi maliyeti + %20" formülü iş modeli değildir; marj yönetilen katmanda ve emektedir.
- **SLA katmanları ayrı fiyatlanır:** 9x5 standart / 7x24 kritik / özel yanıt süresi. Herkese 7x24 sözü vermek küçük ekiplerin en yaygın ölüm nedenidir.
- **Kapsam sert tanımlı olmalı.** "Yönetilen" kelimesinin neyi içerdiği ve neyi içermediği sözleşmede madde madde yazılır.
- **Üç paket + eklentiler.** Başlangıç / Profesyonel / Kurumsal. Sonsuz özelleştirme satış süresini uzatır.

### 7.3 Takip edilecek KPI'lar

| KPI | Neden önemli |
|---|---|
| MRR ve net gelir tutundurma (NRR) | Modelin sağlığı |
| Brüt marj (tedarikçi maliyeti sonrası) | Arbitraj tuzağına düşülüp düşülmediğinin göstergesi |
| Müşteri başına destek dakikası | Otomasyonun gerçekten çalışıp çalışmadığı |
| Kayıp oranı (churn) | Yönetilen servis kalitesinin doğrudan aynası |
| SLA ihlal sayısı | Marka riskinin erken uyarısı |
| Müşteri edinme maliyeti / yaşam boyu değer | Büyümenin sürdürülebilirliği |

---

## 8. Yol Haritası

| Faz | Süre | Hedef ve çıktılar |
|---|---|---|
| **0 — Temel** | 0-2 ay | Marka ve logo sistemi, tüzel yapı, hizmet şartları / SLA / KVKK metinleri, tedarikçi ortaklık başvuruları, maliyet-fiyat modeli, Katman 1+2 kataloğunun kesinleşmesi |
| **1 — Konsolidasyon** | 2-4 ay | Verisay'ın mevcut hizmet ve müşterilerinin VERITUT markası ve paneli altına taşınması. Yeni müşteri aramadan önce mevcut gelirin düzene sokulması |
| **2 — Lansman** | 4-7 ay | Self-servis panel, otomatik provizyon, ödeme altyapısı, kamuya açık durum sayfası, ilk üç açık kaynak ürünü (n8n, Nextcloud, Zammad) |
| **3 — Yönetilen büyüme** | 7-12 ay | 7/24 nöbet düzeni, Katman 3 kataloğunun 10+ uygulamaya çıkarılması, FinOps ve göç hizmetlerinin satışa açılması, ISO 27001 hazırlığının başlatılması |
| **4 — Derinleşme** | 12-24 ay | Kendi ASN ve IP blokları, TR kolokasyon, sektör dikeyleri (LiftOrbis / MesajSepeti üzerinden), bayi ve beyaz etiket kanalı |

### 8.1 İlk 30 gün

1. Konumlanma ve marka hiyerarşisi kararının yazılı hale getirilmesi (Bölüm 10, madde 1 ve 4).
2. Mevcut Verisay hizmetlerinin envanteri: hangi müşteri, hangi tedarikçide, hangi maliyetle, hangi fiyata.
3. Gerçek brüt marj hesabı — mevcut işin kârlı olup olmadığının netleşmesi.
4. AWS ve Google ortaklık programı başvurularının açılması (onay süreleri uzundur, erken başlatılmalı).
5. Hukuki görüş: barındırma, alan adı bayiliği, VPN ve IP tahsisi hizmetlerinin BTK yetkilendirme sınırındaki durumu.
6. SLA ve hizmet şartları taslaklarının hazırlanması.

---

## 9. Dürüst Risk Değerlendirmesi

Planın zayıf noktaları. Şimdi ele alınmazsa 12. ayda maliyet çıkarır.

**1. Marj yanılsaması.**
Saf yeniden satış marjı %0-10 aralığındadır. Para yönetilen katmanda ve emektedir. Fiyatlama "sunucu + %20" olarak kurulursa iş modeli yoktur, yalnızca meşgul bir bayilik vardır.

**2. Destek yükü.**
"Managed" sözü verildiğinde 7/24 sorumluluk alınır. Küçük ekiple bu ancak sert kapsam tanımı, katmanlı SLA ve agresif otomasyonla taşınabilir. MSP'lerin en yaygın başarısızlık nedeni budur.

**3. Tedarikçi tek noktası.**
Hetzner veya AWS hesabının askıya alınması tüm müşteri tabanını aynı anda vurur. En somut varoluşsal risk. Çözüm: çoklu hesap, çoklu tedarikçi, bağımsız yedek kopya, yazılı çıkış planı.

**4. Ücretsiz katmanın sızması.**
Açık kaynak ürünleri "ücretsiz sunucu" ile verilirse bedava kaynak tüketen, geliri olmayan bir müşteri kitlesi birikir ve destek kapasitesini yer.

**5. Marka dağınıklığı.**
Safran Labs, Verisay, VERITUT, LiftOrbis, MesajSepeti — hangi marka müşteriye ne satıyor? VERITUT başlatılmadan önce bu hiyerarşi tek sayfada netleşmeli.

**6. Düzenleyici zemin.**
Barındırma ve alan adı bayiliği serbesttir; ancak VPN, IP tahsisi ve ses/iletişim benzeri hizmetler BTK yetkilendirme sınırına yaklaşabilir. Bir kez hukuki görüş alınıp konu kapatılmalıdır.

**7. Anahtar kişi bağımlılığı.**
Varlık-hafif modelde tüm değer insanda ve kodda. Çalışma kitapları yazılı olmazsa şirket devredilemez, tatil yapılamaz, ekip büyütülemez.

---

## 10. Karar Bekleyen 4 Madde

**1. Konumlanma:** "Yeni nesil veri merkezi" mi, "yönetilen bulut operatörü / veri emanetçisi" mi?
*Öneri: ikincisi.*

**2. Faturalama omurgası:** Hazır çözümle hızlı lansman mı, Entranet ile yavaş ama sahipli yol mu?
*Öneri: hazır çözümle başla, Entranet'e paralel geç.*

**3. İlk hedef segment:** KOBİ hosting hacmi mi, orta ölçekli kurumsal yönetilen iş yükü mü, yazılım ajansları/geliştiriciler mi?
*Üçünü aynı anda hedeflemek en pahalı hatadır. Tek segment seçilmeli.*

**4. VERITUT'un Safran Labs içindeki yeri:** Bağımsız marka mı, portföyün altyapı omurgası mı, ikisi birden mi?

---

*Bu doküman taslak niteliğindedir. Bölüm 10'daki kararlar verildikten sonra fiyat tablosu, 12 aylık gelir modeli ve ekip/işe alım planı eklenerek v2.0 hazırlanacaktır.*
