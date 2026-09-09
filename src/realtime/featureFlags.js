/* ============================================================
   featureFlags.js — REALTIME blueprint §26: flag สำหรับทยอย rollout realtime v2
   ============================================================
   เป้าหมาย (§26): เปิด/ปิดฟีเจอร์ realtime v2 ทีละส่วน + rollback ได้โดยไม่ rollback schema
   แหล่งค่า (ลำดับความสำคัญ): window.__flags override (dev/test) → import.meta.env → default OFF
   ทั้งหมด default OFF = ไม่เปลี่ยน behavior จนกว่าจะเปิดจริง (ปลอดภัย)
   pure/injectable → unit-test ได้
   ⚠️ ยังไม่ wire — primitive ของ REALTIME-C2-PLAN (ดู src/realtime/README.md) · อย่าลบเพราะ "ไม่มีใคร import"
   ============================================================ */

// flag ที่รู้จัก (blueprint §26) — default OFF ทั้งหมด
export const FLAG_DEFAULTS = {
  realtime_v2_enabled: false,   // สวิตช์แม่ realtime v2 (scoped subscription)
  realtime_v2_orders: false,    // orders domain events
  realtime_v2_sales: false,     // sales aggregate events
  realtime_v2_crm: false,       // CRM server aggregation
  realtime_v2_patch_only: false, // payload-patch เท่านั้น (ยังไม่ scoped)
  presence_v2: false,           // Supabase Presence แทน DB heartbeat
};

const ENV_PREFIX = 'VITE_FLAG_';

// อ่านจาก env (Vite) — 'true'/'1'/'on' = true · ที่เหลือ = ตามที่มี
function envFlag(name) {
  try {
    const raw = import.meta?.env?.[ENV_PREFIX + name];
    if (raw == null) return undefined;
    return /^(true|1|on|yes)$/i.test(String(raw));
  } catch { return undefined; }
}

/**
 * อ่านค่า flag เดียว — override(window.__flags) > env(VITE_FLAG_*) > default
 * @param {string} name
 * @param {{override?:object, env?:(n:string)=>boolean|undefined}} [opts] inject เพื่อเทส
 */
export function flag(name, opts = {}) {
  const override = opts.override ?? (typeof window !== 'undefined' ? window.__flags : undefined);
  if (override && Object.prototype.hasOwnProperty.call(override, name)) return !!override[name];
  const envFn = opts.env || envFlag;
  const e = envFn(name);
  if (e !== undefined) return e;
  return FLAG_DEFAULTS[name] ?? false;
}

/** snapshot ทุก flag (debug / diagnostics) */
export function allFlags(opts = {}) {
  const out = {};
  for (const k of Object.keys(FLAG_DEFAULTS)) out[k] = flag(k, opts);
  return out;
}
