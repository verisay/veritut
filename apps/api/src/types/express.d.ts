import type { StaffRole, TenantRole } from '@veritut/types';

/** Express Request genişletmeleri — TEK yerde. `user`: requireUser; `staff`: requireStaff; `ctx`: resolveTenant. */
declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; email: string; displayName: string; sessionId: string };
    staff?: { id: string; email: string; displayName: string; role: StaffRole; sessionId: string };
    ctx?: { tenantId: string; tenantSlug: string; role: TenantRole };
    apiKey?: { id: string; scopes: string[] };
    /** Webhook router'ları için ham gövde (HMAC) — express.json'dan ÖNCE doldurulur. */
    rawBody?: Buffer;
  }
}
