/* ============================================================
   productCatalog.js — "สินค้า" คือแหล่งเดียวของ ลาย / สี / ไซซ์
   ============================================================
   ก่อนหน้านี้ระบบสต็อกเดาลาย-สี-ไซซ์จาก "ของที่เคยขาย" (tmk_mp_skus) และให้พิมพ์สี/ไซซ์เอง
   → ลายที่ยังไม่เคยขายนับไม่ได้ · พิมพ์ผิดกลายเป็น SKU ใหม่เงียบๆ · ไม่ตรงกับหน้าสินค้า
   ไฟล์นี้รวม 2 แหล่งให้เป็นลิสต์เดียว:
     1) tmk_shirt_catalog (หน้า "สินค้า" — แก้ได้จริง ชนะเสมอ)
     2) GOLDEN_DESIGNS (static ในโค้ด — เติมลายที่ยังไม่มีในตาราง / เติมสี-ไซซ์ที่เว้นว่าง)
   ส่วน pure ทั้งหมดอยู่ครึ่งบน (มีเทส) · IO อยู่ท้ายไฟล์
   ============================================================ */
import { GOLDEN_DESIGNS } from './shirtCatalog.js';
import { sizeRank, normColor } from './saleAgg.js';
import { normSizeStock } from './stockCount.js';
import { cachedFetchAll } from './saleData.js';

export const CATALOG_SEL = 'code,name,type,colors,sizes,status,shirt_class';

/** "ขาว, ดำ / กรมท่า" → ['ขาว','ดำ','กรมท่า'] (รับทั้ง , / | และขึ้นบรรทัดใหม่) */
export function splitList(s) {
  return String(s || '').split(/[,\n|/]+/).map(x => x.trim()).filter(Boolean);
}

const uniq = (arr) => [...new Set(arr)];
const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'th');

/**
 * รวมแคตตาล็อกจาก DB + GOLDEN → ลิสต์ลายมาตรฐาน
 * @param dbRows แถวจาก tmk_shirt_catalog ({code,name,colors,sizes,type,status})
 * @returns [{code,name,type,colors[],sizes[],status,source}]
 */
export function mergeCatalogDesigns(dbRows, golden = GOLDEN_DESIGNS) {
  const out = new Map();   // key = ชื่อลาย (identity ที่ผู้ใช้เห็น)
  (golden || []).forEach(d => out.set(d.name, {
    code: d.code || '', name: d.name, type: d.type || '',
    colors: uniq((d.colors || []).map(normColor)),
    sizes: uniq((d.sizes || []).map(normSizeStock)),
    status: 'พร้อมขาย', source: 'golden',
  }));
  (dbRows || []).forEach(r => {
    const name = String(r?.name || '').trim();
    if (!name) return;
    const prev = out.get(name);
    const colors = uniq(splitList(r.colors).map(normColor));
    const sizes = uniq(splitList(r.sizes).map(normSizeStock));
    out.set(name, {
      code: String(r.code || prev?.code || '').trim(),
      name,
      type: String(r.type || prev?.type || '').trim(),
      // แคตตาล็อกชนะ — แต่ถ้าเว้นว่างไว้ ใช้ของ GOLDEN แทน (ไม่ให้เหลือลิสต์เปล่า)
      colors: colors.length ? colors : (prev?.colors || []),
      sizes: sizes.length ? sizes : (prev?.sizes || []),
      status: String(r.status || 'พร้อมขาย').trim(),
      source: 'catalog',
    });
  });
  return [...out.values()].sort(byName);
}

/** หาลายจากชื่อ (ตรงตัว) */
export function findProduct(list, name) {
  const n = String(name || '').trim();
  return (list || []).find(d => d.name === n) || null;
}

/** ตารางสี × ไซซ์ ของลายนั้นตามแคตตาล็อก (ไซซ์เรียงมาตรฐาน) */
export function productMatrix(list, name) {
  const d = findProduct(list, name);
  return {
    colors: [...(d?.colors || [])],
    sizes: [...(d?.sizes || [])].sort((a, b) => sizeRank(a) - sizeRank(b)),
    code: d?.code || '',
  };
}

/** ชื่อลายทั้งหมด (ตัวเลือกใน dropdown) — ตัดลายที่ปิดขายออกได้ */
export function productNames(list, { includeInactive = true } = {}) {
  return (list || []).filter(d => includeInactive || d.status === 'พร้อมขาย').map(d => d.name);
}

/**
 * ลายที่ควรโชว์ในหน้าสต็อก = ลายในแคตตาล็อก + ลายที่มีของ/เคยนับอยู่จริง (กันของค้างหาย)
 * @param list แคตตาล็อกที่ merge แล้ว · @param extraNames ชื่อลายจาก stock rows
 */
export function stockDesignNames(list, extraNames = []) {
  const base = productNames(list);
  const extra = uniq(extraNames.map(x => String(x || '').trim()).filter(Boolean)).filter(n => !base.includes(n));
  return [...base, ...extra].sort((a, b) => String(a).localeCompare(String(b), 'th'));
}

/** ตัวจับคู่ชื่อลายตอนนำเข้าไฟล์: แคตตาล็อกก่อน (ชื่อ/รหัส) แล้วค่อย fallback resolver เดิม */
export function catalogResolver(list, fallback) {
  const byNameMap = new Map((list || []).map(d => [String(d.name).trim().toLowerCase(), d]));
  const byCode = new Map((list || []).filter(d => d.code).map(d => [String(d.code).trim().toLowerCase(), d]));
  return (text) => {
    const t = String(text || '').trim().toLowerCase();
    if (!t) return null;
    const hit = byNameMap.get(t) || byCode.get(t);
    if (hit) return { code: hit.code, name: hit.name };
    return fallback ? fallback(text) : null;
  };
}

/* ---------------- IO ---------------- */
/** โหลดแคตตาล็อกสด (cache ร่วมกับหน้าอื่น · error = ใช้ GOLDEN ล้วน ไม่พัง) */
export async function fetchProductDesigns(force = false) {
  const r = await cachedFetchAll('tmk_shirt_catalog', CATALOG_SEL, force);
  if (r?.error) return { list: mergeCatalogDesigns([]), error: r.error, degraded: true };
  return { list: mergeCatalogDesigns(r?.data || []), degraded: false };
}
