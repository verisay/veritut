import type { Logger } from 'pino';

/** IMailProvider factory (D9). K1: `mock` (log). SMTP/Mailjet adaptörü plan revizyonuyla (nodemailer izinli listede yok). */
export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
  link?: string | null;
}
export interface IMailProvider {
  readonly name: string;
  send(m: MailMessage): Promise<void>;
}

export function createMailProvider(logger: Logger): IMailProvider {
  const kind = process.env['MAIL_PROVIDER'] ?? 'mock';
  if (kind === 'mock') {
    return {
      name: 'mock',
      async send(m) {
        // İçerik (davet linki vb.) yalnız development'ta loglanır.
        if (process.env['NODE_ENV'] === 'development') logger.info({ to: m.to, subject: m.subject, text: m.text }, 'mail (mock)');
        else logger.info({ to: m.to.length, subject: m.subject }, 'mail (mock)');
      },
    };
  }
  throw new Error(`MAIL_PROVIDER desteklenmiyor: ${kind} (K3: smtp)`);
}
