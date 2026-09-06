import { Router, raw } from 'express';
import { billingWebhookSchema, ticketWebhookSchema } from '@veritut/validators';
import { db } from '../db/db.js';
import { webhookInbox } from '../db/schema/index.js';
import { logger } from '../config/logger.js';
import { createBillingProvider } from '../providers/billing/index.js';
import { createTicketProvider } from '../providers/ticket/index.js';
import { applyBillingEvent } from '../services/billing.service.js';
import { applyTicketEvent } from '../services/ticket.service.js';
import { alertmanagerSchema } from '@veritut/validators';
import { applyAlertmanager } from '../services/alert.service.js';
import { env } from '../config/env.js';
import { timingSafeEqual } from 'node:crypto';

/**
 * Webhook alıcıları — `express.json`'dan ÖNCE mount edilir (HMAC ham gövde ister).
 * Her istek `webhook_inbox`'a düşer (imza sonucu dahil); imza geçersizse 401 ve işlenmez.
 */
export const webhooksRouter: Router = Router();
webhooksRouter.use(raw({ type: '*/*', limit: '1mb' }));

async function inbox(source: string, signatureOk: boolean, payload: unknown, error?: string) {
  await db.insert(webhookInbox).values({ source, signatureOk, payload: payload as object, processedAt: signatureOk && !error ? new Date() : null, error: error ?? null }).catch(() => undefined);
}

webhooksRouter.post('/billing', async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const provider = createBillingProvider();
  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    await inbox('billing', false, { raw: rawBody.toString('utf8').slice(0, 500) }, 'json ayrıştırılamadı');
    res.status(400).json({ code: 'BAD_REQUEST', message: 'Geçersiz gövde' });
    return;
  }
  if (!provider.verifyWebhook(rawBody, req.headers)) {
    await inbox('billing', false, payload, 'imza doğrulanamadı');
    logger.warn({ source: 'billing' }, 'webhook imzası geçersiz');
    res.status(401).json({ code: 'BAD_SIGNATURE', message: 'İmza doğrulanamadı' });
    return;
  }
  const parsed = billingWebhookSchema.safeParse(provider.parseWebhook(payload));
  if (!parsed.success) {
    await inbox('billing', true, payload, 'şema uyuşmadı');
    res.status(422).json({ code: 'VALIDATION_ERROR', message: 'Olay şeması uyuşmuyor', details: parsed.error.flatten().fieldErrors });
    return;
  }
  await applyBillingEvent(parsed.data);
  await inbox('billing', true, payload);
  res.json({ ok: true });
});

webhooksRouter.post('/tickets', async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const provider = createTicketProvider();
  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    await inbox('tickets', false, { raw: rawBody.toString('utf8').slice(0, 500) }, 'json ayrıştırılamadı');
    res.status(400).json({ code: 'BAD_REQUEST', message: 'Geçersiz gövde' });
    return;
  }
  if (!provider.verifyWebhook(rawBody, req.headers)) {
    await inbox('tickets', false, payload, 'imza doğrulanamadı');
    res.status(401).json({ code: 'BAD_SIGNATURE', message: 'İmza doğrulanamadı' });
    return;
  }
  const parsed = ticketWebhookSchema.safeParse(provider.parseWebhook(payload));
  if (!parsed.success) {
    await inbox('tickets', true, payload, 'şema uyuşmadı');
    res.status(422).json({ code: 'VALIDATION_ERROR', message: 'Olay şeması uyuşmuyor' });
    return;
  }
  await applyTicketEvent(parsed.data);
  await inbox('tickets', true, payload);
  res.json({ ok: true });
});

/**
 * Alertmanager → olay (plan §8.3). Kimlik: Bearer token (`ALERTMANAGER_TOKEN`) — Alertmanager
 * HMAC imzalamaz, `http_config.authorization` ile bearer gönderir.
 */
webhooksRouter.post('/alertmanager', async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const got = String(req.headers['authorization'] ?? '').replace(/^Bearer /, '');
  const want = env.ALERTMANAGER_TOKEN;
  const ok = want.length > 0 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    await inbox('alertmanager', false, { raw: rawBody.toString('utf8').slice(0, 500) }, 'json ayrıştırılamadı');
    res.status(400).json({ code: 'BAD_REQUEST', message: 'Geçersiz gövde' });
    return;
  }
  if (!ok) {
    await inbox('alertmanager', false, payload, 'token doğrulanamadı');
    res.status(401).json({ code: 'BAD_TOKEN', message: 'Yetkilendirme başarısız' });
    return;
  }
  const parsed = alertmanagerSchema.safeParse(payload);
  if (!parsed.success) {
    await inbox('alertmanager', true, payload, 'şema uyuşmadı');
    res.status(422).json({ code: 'VALIDATION_ERROR', message: 'Alarm şeması uyuşmuyor', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const r = await applyAlertmanager(parsed.data);
  await inbox('alertmanager', true, { received: parsed.data.alerts.length, ...r });
  res.json(r);
});
