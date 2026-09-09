/* ============================================================
   eventDedup.js — REALTIME blueprint §11.2: bounded event-id dedup cache
   ============================================================
   กัน duplicate event ทำ state ผิด (§1: "Duplicate event ที่ทำให้ state ผิด = 0")
   bounded LRU (max) + TTL — ไม่เก็บไม่จำกัด (§11.2: 5,000–20,000 ids · TTL 10–30 นาที)
   pure/injectable now() → unit-test ได้ (§28 Unit: event dedup)
   ⚠️ ยังไม่ wire — primitive ของ REALTIME-C2-PLAN (ดู src/realtime/README.md) · อย่าลบเพราะ "ไม่มีใคร import"
   ============================================================ */

/**
 * สร้าง dedup cache
 * @param {{max?:number, ttlMs?:number, now?:()=>number}} opts
 *   max = จำนวน id สูงสุด (evict เก่าสุดเมื่อเกิน) · ttlMs = อายุ id · now = inject เพื่อเทส
 * @returns {{ seen(id):boolean, add(id):void, has(id):boolean, size():number, clear():void, prune():void }}
 */
export function createEventDedup({ max = 10000, ttlMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const map = new Map(); // id → expireAt (insertion order = อายุ · Map รักษาลำดับ insert)

  const isLive = (id) => {
    const exp = map.get(id);
    if (exp === undefined) return false;
    if (exp <= now()) { map.delete(id); return false; } // หมดอายุ → ลบทิ้ง
    return true;
  };

  const prune = () => {
    const t = now();
    for (const [id, exp] of map) { if (exp <= t) map.delete(id); }
  };

  return {
    // เคยเห็น id นี้ (ยังไม่หมดอายุ)?
    has: (id) => isLive(id),
    seen: (id) => isLive(id),
    // จด id (refresh อายุ + ดัน insertion order ไปท้าย ถ้ามีอยู่แล้ว) + evict เก่าสุดเมื่อเกิน max
    add: (id) => {
      if (id == null) return;
      if (map.has(id)) map.delete(id); // ลบก่อน set → ให้ไปอยู่ท้าย (recency)
      map.set(id, now() + ttlMs);
      while (map.size > max) { const oldest = map.keys().next().value; map.delete(oldest); } // evict LRU
    },
    size: () => map.size,
    clear: () => map.clear(),
    prune,
  };
}
