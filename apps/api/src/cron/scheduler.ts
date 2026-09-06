import cron from 'node-cron';
import { lt, sql } from 'drizzle-orm';
import { logger } from '../config/logger.js';
import { db } from '../db/db.js';
import { sessions, staffSessions } from '../db/schema/index.js';
import { pruneProbeResults, refreshPlatformSnapshot } from '../services/status.service.js';
import { listSyncableAccounts, reportStaleUnmatched, triggerProviderSync } from '../services/provider.service.js';

/** node-cron + NODE_APP_INSTANCE leader guard (D4/plan §3.1). K0: oturum temizliği + snapshot yenileme. */
export function startScheduler(): void {
  const instance = process.env['NODE_APP_INSTANCE'] ?? '0';
  if (instance !== '0') {
    logger.info({ instance }, 'cron leader değil — scheduler pas geçildi');
    return;
  }
  cron.schedule('15 * * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - 7 * 86400_000);
      await db.delete(sessions).where(lt(sessions.expiresAt, cutoff));
      await db.delete(staffSessions).where(lt(staffSessions.expiresAt, cutoff));
      logger.info('[CRON] süresi dolmuş oturumlar temizlendi');
    } catch (err) {
      logger.error({ err }, '[CRON] oturum temizliği hatası');
    }
  });
  cron.schedule('* * * * *', async () => {
    try {
      await refreshPlatformSnapshot();
    } catch (err) {
      logger.error({ err }, '[CRON] snapshot yenileme hatası');
    }
  });
  // 03:00 — tedarikçi envanter/maliyet senkronu (runner provider-sync kuyruğu)
  cron.schedule('0 3 * * *', async () => {
    try {
      const accs = await listSyncableAccounts();
      for (const a of accs) await triggerProviderSync(a.id, null);
      logger.info({ n: accs.length }, '[CRON] provider-sync tetiklendi');
    } catch (err) {
      logger.error({ err }, '[CRON] provider-sync hatası');
    }
  });
  // 09:00 — 7 günü aşan sahipsiz kaynak bildirimi
  cron.schedule('0 9 * * *', async () => {
    try {
      const n = await reportStaleUnmatched();
      logger.info({ n }, '[CRON] sahipsiz kaynak raporu');
    } catch (err) {
      logger.error({ err }, '[CRON] sahipsiz kaynak hatası');
    }
  });
  // 04:15 — probe_results 90 gün saklama
  cron.schedule('15 4 * * *', async () => {
    try {
      await pruneProbeResults();
    } catch (err) {
      logger.error({ err }, '[CRON] probe saklama hatası');
    }
  });
  // 02:15 — deneme süresi dolanları askıya al (ücretsiz katman sızmasına karşı, stratejik §9 risk 4)
  cron.schedule('15 2 * * *', async () => {
    try {
      const { expireTrials } = await import('../services/billing.service.js');
      const n = await expireTrials();
      if (n > 0) logger.info({ n }, '[CRON] deneme süresi doldu');
    } catch (err) {
      logger.error({ err }, '[CRON] deneme expiry hatası');
    }
  });
  // Ayın 1'i 05:00 — geçen dönemin kullanım kalemleri faturalama omurgasına
  cron.schedule('0 5 1 * *', async () => {
    try {
      const d = new Date();
      d.setUTCMonth(d.getUTCMonth() - 1);
      const period = d.toISOString().slice(0, 7);
      const { pushPeriod } = await import('../services/billing.service.js');
      const r = await pushPeriod(period);
      logger.info({ period, ...r }, '[CRON] dönem kapanışı');
    } catch (err) {
      logger.error({ err }, '[CRON] dönem kapanışı hatası');
    }
  });
  // 06:00 — KPI anlık görüntüsü
  cron.schedule('0 6 * * *', async () => {
    try {
      const { computeKpi } = await import('../services/kpi.service.js');
      await computeKpi(new Date().toISOString().slice(0, 7));
    } catch (err) {
      logger.error({ err }, '[CRON] KPI hatası');
    }
  });
  // Her dakika — SLA eskalasyonu (T-15) ve hedef aşımı işaretleme
  cron.schedule('* * * * *', async () => {
    try {
      const { escalateDueIncidents, markBreaches } = await import('../services/incident.service.js');
      const n = await escalateDueIncidents();
      const b = await markBreaches();
      if (n > 0 || b > 0) logger.warn({ escalated: n, breached: b }, '[CRON] SLA saati');
    } catch (err) {
      logger.error({ err }, '[CRON] SLA saati hatası');
    }
  });
  // Ayın 1'i 01:00 — aylık geri dönüş tatbikatlarını planla; 01:30 — kuyruğa ver
  cron.schedule('0 1 1 * *', async () => {
    try {
      const { scheduleMonthlyDrills } = await import('../services/drill.service.js');
      logger.info({ n: await scheduleMonthlyDrills() }, '[CRON] aylık tatbikat planı');
    } catch (err) {
      logger.error({ err }, '[CRON] tatbikat planı hatası');
    }
  });
  cron.schedule('30 1 * * *', async () => {
    try {
      const { dispatchScheduledDrills } = await import('../services/drill.service.js');
      const n = await dispatchScheduledDrills();
      if (n > 0) logger.info({ n }, '[CRON] tatbikat kuyruğa verildi');
    } catch (err) {
      logger.error({ err }, '[CRON] tatbikat kuyruk hatası');
    }
  });
  // 02:45 — yapılandırma sapması taraması (elle müdahale denetçisi)
  cron.schedule('45 2 * * *', async () => {
    try {
      const { scheduleDriftPlans } = await import('../services/drift.service.js');
      logger.info({ n: await scheduleDriftPlans() }, '[CRON] sapma taraması');
    } catch (err) {
      logger.error({ err }, '[CRON] sapma taraması hatası');
    }
  });
  // Ayın 2'si 06:30 — geçen dönemin SLA hesabı, kredileri ve raporları; kanıt paketi
  cron.schedule('30 6 2 * *', async () => {
    try {
      const d = new Date();
      d.setUTCMonth(d.getUTCMonth() - 1);
      const period = d.toISOString().slice(0, 7);
      const { computeSlaPeriod, applyCredits } = await import('../services/sla.service.js');
      const { generateSlaReport, generateEvidenceBundle } = await import('../services/document.service.js');
      const { db } = await import('../db/db.js');
      const { tenants } = await import('../db/schema/index.js');
      const { eq } = await import('drizzle-orm');
      const r = await computeSlaPeriod(period);
      const credits = await applyCredits(period);
      const list = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.status, 'active'));
      for (const t of list) {
        await generateSlaReport(t.id, period).catch(() => undefined);
        await generateEvidenceBundle(t.id, period).catch(() => undefined);
      }
      logger.info({ ...r, credits, tenants: list.length }, '[CRON] SLA dönem kapanışı');
    } catch (err) {
      logger.error({ err }, '[CRON] SLA dönem kapanışı hatası');
    }
  });
  void sql;
  logger.info('cron scheduler hazır — 13 job (oturum, snapshot, provider-sync, sahipsiz kaynak, probe saklama, deneme expiry, faturalama, KPI, SLA saati, tatbikat planı/kuyruğu, sapma taraması, SLA dönem kapanışı)');
}
