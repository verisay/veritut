import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { DOCUMENT_KIND_LABEL, EVIDENCE_KIND_LABEL, isEvidenceKind, type DocumentKind } from '@veritut/types';
import { db } from '../db/db.js';
import { documents, evidenceAnchors, evidenceBundles, evidenceEvents, providerAccounts, providers, slaPeriods, tenants, workloads } from '../db/schema/index.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';
import { verifyEvidenceChain } from './evidence.service.js';
import { putDocument } from './storage.service.js';

/**
 * Belge üretimi (plan §8.1 madde 4 · §14 K4/8): DPA, alt işleyen listesi, aylık SLA raporu,
 * aylık kanıt paketi. Hepsi VERİDEN üretilir — elle doldurulan alan yok.
 * Türkçe karakter için gömülü DejaVuSans (imajda `fonts-dejavu-core`).
 */
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const hasFont = existsSync(FONT);
if (!hasFont) logger.warn({ FONT }, 'DejaVuSans bulunamadı — PDF Türkçe karakterleri bozuk çıkabilir');

interface Pdf {
  doc: PDFKit.PDFDocument;
  done: Promise<Buffer>;
}
function newPdf(title: string, subtitle: string): Pdf {
  const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: title, Author: 'VERITUT', Creator: 'VERITUT' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  if (hasFont) {
    doc.registerFont('body', FONT);
    doc.registerFont('bold', existsSync(FONT_BOLD) ? FONT_BOLD : FONT);
  }
  const b = (size: number) => doc.font(hasFont ? 'bold' : 'Helvetica-Bold').fontSize(size);
  const n = (size: number) => doc.font(hasFont ? 'body' : 'Helvetica').fontSize(size);
  b(20).fillColor('#13223A').text('VERITUT', { continued: true }).fillColor('#0E8C70').text(`  ${title}`);
  n(10).fillColor('#3D5266').text(subtitle);
  n(8).fillColor('#66788A').text(`Üretim: ${new Date().toLocaleString('tr-TR')} · Verisay İletişim ve Bilgi Teknolojileri Ltd. Şti.`);
  doc.moveDown(1).strokeColor('#E2E8EB').lineWidth(1).moveTo(56, doc.y).lineTo(539, doc.y).stroke().moveDown(1);
  doc.fillColor('#13223A');
  return { doc, done };
}
function h2(doc: PDFKit.PDFDocument, text: string): void {
  doc.moveDown(0.8).font(hasFont ? 'bold' : 'Helvetica-Bold').fontSize(13).fillColor('#13223A').text(text).moveDown(0.3);
  doc.font(hasFont ? 'body' : 'Helvetica').fontSize(10).fillColor('#24262E');
}
function para(doc: PDFKit.PDFDocument, text: string): void {
  doc.font(hasFont ? 'body' : 'Helvetica').fontSize(10).fillColor('#24262E').text(text, { align: 'left', lineGap: 2 }).moveDown(0.4);
}
function kv(doc: PDFKit.PDFDocument, rows: Array<[string, string]>): void {
  for (const [k, v] of rows) {
    doc.font(hasFont ? 'body' : 'Helvetica').fontSize(9.5).fillColor('#66788A').text(`${k}: `, { continued: true }).fillColor('#13223A').text(v);
  }
  doc.moveDown(0.4);
}

async function store(tenantId: string, kind: DocumentKind, period: string | null, title: string, buf: Buffer, generatedFrom: Record<string, unknown>) {
  const [prev] = await db.select({ v: documents.version }).from(documents).where(and(eq(documents.tenantId, tenantId), eq(documents.kind, kind), period ? eq(documents.period, period) : isNull(documents.period))).orderBy(desc(documents.version)).limit(1);
  const version = (prev?.v ?? 0) + 1;
  const key = `${tenantId}/${kind}/${period ?? 'guncel'}-v${version}.pdf`;
  const put = await putDocument(key, buf, 'application/pdf');
  const [row] = await db
    .insert(documents)
    .values({ tenantId, kind, period, version, title, storageKey: put.key, sha256: put.sha256, bytes: put.bytes, generatedFrom })
    .returning();
  return row!;
}

/** Alt işleyen listesi: kiracının iş yüklerinin dokunduğu tedarikçiler — VERİDEN üretilir (plan §7.4). */
export async function generateSubprocessors(tenantId: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) throw ApiError.notFound('Kiracı bulunamadı');
  const rows = await db
    .select({ code: providers.code, name: providers.name, region: workloads.region, residency: workloads.residency, workload: workloads.name, exitPlan: providers.exitPlanDoc })
    .from(workloads)
    .innerJoin(providerAccounts, eq(providerAccounts.id, workloads.providerAccountId))
    .innerJoin(providers, eq(providers.code, providerAccounts.providerCode))
    .where(and(eq(workloads.tenantId, tenantId), sql`${workloads.status} <> 'destroyed'`));
  const byProvider = new Map<string, { name: string; regions: Set<string>; residencies: Set<string>; workloads: string[] }>();
  for (const r of rows) {
    const cur = byProvider.get(r.code) ?? { name: r.name, regions: new Set<string>(), residencies: new Set<string>(), workloads: [] };
    if (r.region) cur.regions.add(r.region);
    cur.residencies.add(r.residency);
    cur.workloads.push(r.workload);
    byProvider.set(r.code, cur);
  }
  const { doc, done } = newPdf('Alt işleyen listesi', `${t.name} · ${t.slug}`);
  para(doc, 'Bu liste, kiracınızın aktif iş yüklerinin fiilen kullandığı altyapı sağlayıcılarından otomatik üretilir. Liste değiştiğinde size önceden bildirilir (sözleşmesel 30 gün).');
  h2(doc, 'Sağlayıcılar');
  if (byProvider.size === 0) para(doc, 'Aktif iş yükü bulunmadığından listelenen alt işleyen yoktur.');
  for (const [code, p] of byProvider) {
    kv(doc, [
      ['Sağlayıcı', `${p.name} (${code})`],
      ['İşleme amacı', 'Barındırma, yedekleme ve ağ altyapısı'],
      ['Bölgeler', [...p.regions].join(', ') || '—'],
      ['Veri ikametgâhı', [...p.residencies].join(', ')],
      ['Etkilenen iş yükleri', p.workloads.join(', ')],
    ]);
  }
  h2(doc, 'VERITUT tarafı');
  kv(doc, [
    ['Veri sorumlusu', t.name],
    ['Veri işleyen', 'Verisay İletişim ve Bilgi Teknolojileri Ltd. Şti. (VERITUT)'],
    ['Varsayılan ikametgâh', t.residencyDefault],
  ]);
  para(doc, 'Yedek kopyalar iş yükünün ikametgâh sınıfı dışına çıkmaz; bu kural sözleşme metninde değil, sistemin kodunda zorlanır ve testle doğrulanır.');
  doc.end();
  const buf = await done;
  const row = await store(tenantId, 'subprocessors', null, 'Alt işleyen listesi', buf, { providers: [...byProvider.keys()] });
  await audit({ actorType: 'system', tenantId, action: 'document.subprocessors', subjectType: 'document', subjectId: row.id });
  return row;
}

/** Veri işleme sözleşmesi — kiracı verileriyle doldurulur (hukuk onayı Faz 0 çıktısı). */
export async function generateDpa(tenantId: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) throw ApiError.notFound('Kiracı bulunamadı');
  const [wl] = await db.select({ n: sql<number>`count(*)::int` }).from(workloads).where(and(eq(workloads.tenantId, tenantId), sql`${workloads.status} <> 'destroyed'`));
  const { doc, done } = newPdf('Veri işleme sözleşmesi (DPA)', `${t.name} · ${t.slug}`);
  para(doc, 'TASLAK — hukuk incelemesi tamamlanmadan imzalanmaz.');
  h2(doc, 'Taraflar ve konu');
  kv(doc, [
    ['Veri sorumlusu', t.name],
    ['Veri işleyen', 'Verisay İletişim ve Bilgi Teknolojileri Ltd. Şti. (VERITUT)'],
    ['Kapsam', `${wl?.n ?? 0} aktif iş yükü`],
    ['Varsayılan ikametgâh', t.residencyDefault],
  ]);
  h2(doc, 'İşleme talimatı');
  para(doc, 'VERITUT kişisel verileri yalnız hizmetin sunulması için ve veri sorumlusunun yazılı talimatı doğrultusunda işler. Talimat dışı işleme yapılmaz; hizmetin işletimi için gereken erişimler kanıt defterine kaydedilir ve veri sorumlusuna görünür.');
  h2(doc, 'Veri ikametgâhı');
  para(doc, 'Her iş yükü için seçilen ikametgâh sınıfı (TR/EU/US) birincil ve offsite yedekler dâhil tüm kopyalar için geçerlidir. Türkiye ikametgâhı seçilen veriler ABD sınıfına aktarılmaz. Bu kısıt uygulama kodunda zorlanır ve otomatik testle doğrulanır.');
  h2(doc, 'Güvenlik önlemleri');
  para(doc, 'Erişim yetkilendirmesi tek kimlik sağlayıcı üzerinden; personel erişimi çok faktörlü doğrulama ve oturum kaydı ile. Tedarikçi kimlik bilgileri asimetrik zarfla saklanır ve yalnız yürütücü süreçte açılır. Yedekler 3-2-1 kuralına göre alınır, offsite kopya farklı tedarikçidedir ve geri dönüş ayda bir tatbikatla kanıtlanır.');
  h2(doc, 'İhlal bildirimi');
  para(doc, 'Kişisel veri ihlali tespit edildiğinde veri sorumlusuna gecikmeksizin ve en geç 24 saat içinde bildirilir; ihlalin kapsamı, etkilenen veri kategorileri ve alınan önlemler yazılı olarak paylaşılır.');
  h2(doc, 'Saklama ve imha');
  para(doc, 'İzleme sonuçları 90 gün, denetim kaydı 5 yıl, kanıt defteri 10 yıl saklanır. Hizmet sonlandığında veri ve yedekler dışa aktarılarak teslim edilir; ardından imha edilir ve imha belgesi verilir.');
  h2(doc, 'Alt işleyenler');
  para(doc, 'Güncel alt işleyen listesi ayrı belge olarak üretilir ve portalda yayımlanır. Yeni alt işleyen eklenmeden önce veri sorumlusuna 30 gün önceden bildirim yapılır.');
  doc.end();
  const buf = await done;
  const row = await store(tenantId, 'dpa', null, 'Veri işleme sözleşmesi', buf, { workloads: wl?.n ?? 0 });
  await audit({ actorType: 'system', tenantId, action: 'document.dpa', subjectType: 'document', subjectId: row.id });
  return row;
}

/** Aylık SLA raporu — ölçüm, ihlal ve kredi; müşteri talep etmeden alır. */
export async function generateSlaReport(tenantId: string, period: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) throw ApiError.notFound('Kiracı bulunamadı');
  const rows = await db
    .select({ sla: slaPeriods, workloadName: workloads.name })
    .from(slaPeriods)
    .leftJoin(workloads, eq(workloads.id, slaPeriods.workloadId))
    .where(and(eq(slaPeriods.tenantId, tenantId), eq(slaPeriods.period, period)));
  const { doc, done } = newPdf('Aylık SLA raporu', `${t.name} · dönem ${period}`);
  para(doc, 'Uptime, dış izleme sondalarımız ve ilan edilmiş olaylarla hesaplanır; planlı bakım pencereleri düşülür. Hedefin altında kalınan dönemlerde kredi talebinize gerek kalmadan hesaplanır ve faturanıza yansıtılır.');
  if (rows.length === 0) para(doc, 'Bu dönem için ölçüm kaydı bulunmuyor.');
  for (const r of rows) {
    h2(doc, r.workloadName ?? 'İş yükü');
    kv(doc, [
      ['SLA katmanı', r.sla.slaCode],
      ['Uptime', `%${r.sla.uptimePct} (hedef %${r.sla.uptimeTarget})`],
      ['Kesinti', `${r.sla.downtimeMin} dk (planlı bakım hariç: ${r.sla.maintenanceMin} dk)`],
      ['Olay sayısı', String(r.sla.incidents)],
      ['Yanıt süresi ihlali', String(r.sla.responseBreaches)],
      ['Çözüm süresi ihlali', String(r.sla.resolveBreaches)],
      ['Kredi', Number(r.sla.creditAmount) > 0 ? `%${r.sla.creditPct} · ${r.sla.creditAmount} ${r.sla.currency}` : 'yok'],
    ]);
  }
  doc.end();
  const buf = await done;
  const row = await store(tenantId, 'sla_report', period, `SLA raporu ${period}`, buf, { workloads: rows.length });
  await db.update(slaPeriods).set({ reportKey: row.storageKey, reportSha256: row.sha256 }).where(and(eq(slaPeriods.tenantId, tenantId), eq(slaPeriods.period, period)));
  await audit({ actorType: 'system', tenantId, action: 'document.sla_report', subjectType: 'document', subjectId: row.id, after: { period } });
  return row;
}

/**
 * Aylık kanıt paketi (plan §8.1): iş yükü envanteri, yedek/tatbikat özeti, olaylar, erişim oturumları,
 * değişiklikler, alt işleyenler ve zincir çapası. Denetimde "belgeyi kim verecek" sorusunun cevabı.
 */
export async function generateEvidenceBundle(tenantId: string, period: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) throw ApiError.notFound('Kiracı bulunamadı');
  const start = new Date(`${period}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const events = await db
    .select()
    .from(evidenceEvents)
    .where(and(eq(evidenceEvents.tenantId, tenantId), gte(evidenceEvents.occurredAt, start), lte(evidenceEvents.occurredAt, end)))
    .orderBy(asc(evidenceEvents.seq));
  const verdict = await verifyEvidenceChain(tenantId);
  const wl = await db.select().from(workloads).where(and(eq(workloads.tenantId, tenantId), sql`${workloads.status} <> 'destroyed'`));
  const slas = await db.select().from(slaPeriods).where(and(eq(slaPeriods.tenantId, tenantId), eq(slaPeriods.period, period)));
  const byKind = new Map<string, number>();
  for (const e of events) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);

  const json = {
    tenant: { slug: t.slug, name: t.name },
    period,
    generatedAt: new Date().toISOString(),
    chain: { ok: verdict.ok, checked: verdict.checked, lastHash: verdict.lastHash, brokenAt: verdict.brokenAt },
    range: events.length ? { fromSeq: events[0]!.seq, toSeq: events[events.length - 1]!.seq } : { fromSeq: 0, toSeq: 0 },
    workloads: wl.map((w) => ({ slug: w.slug, name: w.name, product: w.productSlug, residency: w.residency, provider: w.providerCode, region: w.region, size: w.size, sla: w.slaTier, status: w.status })),
    sla: slas.map((s) => ({ workloadId: s.workloadId, uptimePct: Number(s.uptimePct), target: Number(s.uptimeTarget), creditAmount: Number(s.creditAmount) })),
    events: events.map((e) => ({ seq: e.seq, kind: e.kind, subject: `${e.subjectType}/${e.subjectId}`, occurredAt: e.occurredAt.toISOString(), actor: e.actor, hash: e.hash, prevHash: e.prevHash, payload: e.payload })),
  };
  const jsonBuf = Buffer.from(JSON.stringify(json, null, 2), 'utf8');
  const jsonSha = createHash('sha256').update(jsonBuf).digest('hex');
  await putDocument(`${tenantId}/evidence_bundle/${period}.json`, jsonBuf, 'application/json');

  const { doc, done } = newPdf('Kanıt paketi', `${t.name} · dönem ${period}`);
  para(doc, 'Bu paket, dönem içinde kiracınız adına yapılan işlerin değiştirilemez kaydıdır. Kayıtlar hash zinciriyle bağlıdır; biri değiştirilirse zincir kopar ve bunu gizlemeyiz.');
  h2(doc, 'Zincir doğrulaması');
  kv(doc, [
    ['Durum', verdict.ok ? 'Zincir bütün' : `KOPUK — seq ${verdict.brokenAt}`],
    ['Doğrulanan olay', String(verdict.checked)],
    ['Son hash', verdict.lastHash ?? '—'],
    ['JSON eki (sha256)', jsonSha],
  ]);
  h2(doc, 'Dönem özeti');
  kv(doc, [...byKind].map(([k, n]) => [isEvidenceKind(k) ? EVIDENCE_KIND_LABEL[k] : k, String(n)] as [string, string]));
  h2(doc, 'İş yükleri');
  for (const w of wl) kv(doc, [[w.name, `${w.productSlug} · ${w.providerCode ?? '—'}/${w.region ?? '—'} · ikametgâh ${w.residency} · SLA ${w.slaTier} · ${w.status}`]]);
  if (slas.length) {
    h2(doc, 'Hizmet seviyesi');
    for (const s of slas) kv(doc, [['Uptime', `%${s.uptimePct} (hedef %${s.uptimeTarget}) · kredi ${s.creditAmount} ${s.currency}`]]);
  }
  h2(doc, 'Olay kayıtları');
  if (events.length === 0) para(doc, 'Bu dönemde kayıt yok.');
  for (const e of events.slice(0, 300)) {
    doc.font(hasFont ? 'body' : 'Helvetica').fontSize(8.5).fillColor('#3D5266').text(`#${e.seq} · ${e.occurredAt.toISOString()} · ${isEvidenceKind(e.kind) ? EVIDENCE_KIND_LABEL[e.kind] : e.kind} · ${e.subjectType}/${e.subjectId} · ${e.hash.slice(0, 12)}…`);
  }
  if (events.length > 300) para(doc, `… ve ${events.length - 300} kayıt daha (tamamı JSON ekinde).`);
  doc.end();
  const buf = await done;
  const row = await store(tenantId, 'evidence_bundle', period, `Kanıt paketi ${period}`, buf, { events: events.length, chainOk: verdict.ok });
  const [anchor] = await db.select().from(evidenceAnchors).where(and(eq(evidenceAnchors.tenantId, tenantId), eq(evidenceAnchors.period, period))).limit(1);
  await db
    .insert(evidenceBundles)
    .values({ tenantId, period, fromSeq: json.range.fromSeq, toSeq: json.range.toSeq, anchorHash: anchor?.anchorHash ?? verdict.lastHash ?? '', documentId: row.id, jsonSha256: jsonSha })
    .onConflictDoUpdate({ target: [evidenceBundles.tenantId, evidenceBundles.period], set: { fromSeq: json.range.fromSeq, toSeq: json.range.toSeq, anchorHash: anchor?.anchorHash ?? verdict.lastHash ?? '', documentId: row.id, jsonSha256: jsonSha, generatedAt: new Date() } });
  await audit({ actorType: 'system', tenantId, action: 'document.evidence_bundle', subjectType: 'document', subjectId: row.id, after: { period, events: events.length } });
  return row;
}

export async function listDocuments(tenantId: string) {
  return db.select({ id: documents.id, kind: documents.kind, period: documents.period, version: documents.version, title: documents.title, sha256: documents.sha256, bytes: documents.bytes, createdAt: documents.createdAt }).from(documents).where(eq(documents.tenantId, tenantId)).orderBy(desc(documents.createdAt)).limit(100);
}

export async function getDocumentRow(tenantId: string, id: string) {
  const [d] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.tenantId, tenantId))).limit(1);
  if (!d) throw ApiError.notFound();
  return d;
}

export { DOCUMENT_KIND_LABEL };
