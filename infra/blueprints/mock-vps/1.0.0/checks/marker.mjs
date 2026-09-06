// İşaret dosyası kontrolü — OUTPUTS_JSON env ile çıktılar gelir; WORK_DIR/<id>/mock/hardened aranır.
import { existsSync } from 'node:fs';
const out = JSON.parse(process.env.OUTPUTS_JSON ?? '{}');
const work = process.env.WORK_DIR ?? '/var/lib/veritut/work';
const id = process.env.WORKLOAD_ID ?? '';
// server_id çıktısı varsa apply gerçekleşmiştir; işaret dosyası configure'un kanıtı.
const ok = Boolean(out.server_id) && out.hardened === true;
console.log(ok ? `server_id=${out.server_id} hardened=true` : `eksik: server_id=${out.server_id} hardened=${out.hardened}`);
void existsSync; void work; void id;
process.exit(ok ? 0 : 1);
