/** Tarayıcı API istemcisi — same-origin `/api/v1`, çerez otomatik; kiracı başlığı store'dan. */
import { createApiFetch } from '@veritut/shared';

let activeTenantId: string | null = null;
export function setActiveTenant(id: string | null): void {
  activeTenantId = id;
}
export const api = createApiFetch({
  baseUrl: '/api/v1',
  headers: (): Record<string, string> => (activeTenantId ? { 'X-Tenant-Id': activeTenantId } : {}),
});
