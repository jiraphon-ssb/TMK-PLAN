/* ============================================================
   designResolve.js — "Live-resolve" ชื่อลาย/รหัส ตอนแสดงผล (ไม่ต้อง reimport)
   หลักการ: ข้อมูลที่ frozen ตอน import = baseline · ชั้นนี้ merge ทับด้วยของสด
   (catalog ที่ผู้ใช้แก้ / alias / override รายบรรทัด) → แก้ในเว็บแล้วเห็นทันที

   ลำดับความสำคัญ (สูง→ต่ำ):
     1) override รายบรรทัด (tmk_sku_overrides)         — แก้มือเฉพาะบรรทัด
     2) catalog สด ผ่าน product_code (tmk_shirt_catalog) — ชื่อที่ผู้ใช้พิมพ์เอง
     3) alias สด ผ่านข้อความ raw (tmk_mp_aliases)        — คำพ้อง/สะกดต่าง
     4) golden by code (GOLDEN_DESIGNS)                  — ฐาน 47 ลาย
     5) sku.design (frozen)                              — fallback สุดท้าย
   ============================================================ */
import { GOLDEN_DESIGNS } from './shirtCatalog.js';
import { fetchAllVersions, buildVersionIndex, asOfCatalog } from './catalogVersions.js';

// normalize ข้อความให้เทียบกันได้ (ตัดช่องว่าง/วงเล็บ/ตัวพิมพ์) — ตรงกับ _norm ใน shirtCatalog
export const normTerm = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, '').replace(/[()"']/g, '');
// base code = ตัดส่วน สี/ไซซ์ ออก เช่น "JKN111-S-XS" → "JKN111"
export const baseCode = (c) => (c || '').toString().trim().toUpperCase().split('-')[0];
// จับคู่รหัสแบบทน: ลอง full code → ถอด segment ท้ายทีละชิ้น จนกว่า has(candidate) จะจริง
// เช่น "JRP-111-WH-XS" → ลอง JRP-111-WH-XS → JRP-111-WH → JRP-111(เจอ) — กันตัดสั้นเป็น "JRP" แล้วชนรหัสอื่น
export function progressiveBase(code, has) {
  const parts = (code || '').toString().trim().toUpperCase().split('-').filter(Boolean);
  for (let n = parts.length; n >= 1; n--) {
    const cand = parts.slice(0, n).join('-');
    if (has(cand)) return cand;
  }
  return '';
}
// key override รายบรรทัด — อิงเนื้อหา (order_no + ข้อความ raw) → เสถียรข้าม reimport
export const skuOverrideKey = (orderNo, raw) => `${orderNo || ''}::${normTerm(raw)}`;

const GOLDEN_BY_CODE = Object.fromEntries(GOLDEN_DESIGNS.map(d => [d.code.toUpperCase(), d]));

// สร้าง map code→row จากแคตตาล็อก (รองรับทั้ง full code และ base code)
export function indexCatalog(rows) {
  const byCode = {};
  (rows || []).forEach(r => {
    const c = (r.code || '').toString().trim().toUpperCase();
    if (!c) return;
    byCode[c] = r;
    const bc = baseCode(c);
    if (bc && !byCode[bc]) byCode[bc] = r;   // ไม่ทับตัวที่ตรงเป๊ะ
  });
  return byCode;
}

// สร้าง map ข้อความ→{design,code} จาก tmk_mp_aliases (เฉพาะ kind='design')
export function indexAliases(rows) {
  const m = {};
  (rows || []).forEach(a => {
    if (a.kind && a.kind !== 'design') return;
    const k = normTerm(a.term);
    if (k && (a.design || a.code)) m[k] = { design: a.design || '', code: a.code || '' };
  });
  return m;
}

// สร้าง map key→{design,product_code} จาก tmk_sku_overrides
export function indexSkuOverrides(rows) {
  const m = {};
  (rows || []).forEach(o => { if (o.key) m[o.key] = o; });
  return m;
}

// สร้างฟังก์ชัน resolve จาก map สด (ทุก map optional → graceful ถ้ายังไม่มีตาราง)
// คืน (sku) => { design, product_code, source }
export function makeSkuResolver({ catalogByCode = {}, aliasMap = {}, skuOverrides = {}, versionIndex = null } = {}) {
  // as-of-date pinning (PART 12/T2): ถ้ามีประวัติเวอร์ชัน + วันออเดอร์ → ใช้ "ชื่อ" ที่ effective ณ วันนั้น
  // (pin ชื่อเท่านั้น — ยอด/ราคา frozen บน order อยู่แล้ว กันยอดเพี้ยน) · ไม่ override รายบรรทัด (ผู้ใช้ตั้งใจแก้)
  const pinName = (res, sku) => {
    if (!versionIndex || versionIndex.empty || res.source === 'override' || !sku.order_date) return res;
    const asof = asOfCatalog(versionIndex, res.product_code, sku.order_date);
    if (asof && asof.name && asof.name.trim()) return { ...res, design: asof.name.trim(), source: res.source + '+asof' };
    return res;
  };
  return (sku) => {
    const raw = sku.raw_sku_or_name || '';
    const code = (sku.product_code || '').toString().trim();
    const up = code.toUpperCase();
    const bc = baseCode(code);

    // 1) override รายบรรทัด
    const ov = skuOverrides[skuOverrideKey(sku.order_no, raw)];
    if (ov && (ov.design || ov.product_code)) {
      return { design: ov.design || sku.design || '', product_code: ov.product_code || code, source: 'override' };
    }
    // 2) catalog สด ผ่าน product_code — ลอง full → ถอด segment ท้ายทีละชิ้น (กัน JRP-111 ตัดเหลือ JRP ชนกัน)
    const catKey = progressiveBase(code, k => !!(catalogByCode[k] && (catalogByCode[k].name || '').trim()));
    const cat = catKey && catalogByCode[catKey];
    if (cat && (cat.name || '').trim()) return pinName({ design: cat.name.trim(), product_code: cat.code || code || catKey, source: 'catalog' }, sku);
    // 3) alias สด ผ่านข้อความ raw
    const al = aliasMap[normTerm(raw)];
    if (al && al.design) return pinName({ design: al.design, product_code: al.code || code, source: 'alias' }, sku);
    // 4) golden by code — progressive เช่นกัน (fallback up/bc คงพฤติกรรมเดิม)
    const gKey = progressiveBase(code, k => !!GOLDEN_BY_CODE[k]);
    const g = (gKey && GOLDEN_BY_CODE[gKey]) || GOLDEN_BY_CODE[up] || GOLDEN_BY_CODE[bc];
    if (g) return pinName({ design: g.name, product_code: g.code, source: 'golden' }, sku);
    // 5) frozen fallback
    return pinName({ design: sku.design || '', product_code: code, source: 'frozen' }, sku);
  };
}

// helper: โหลด map ทั้ง 3 จาก Supabase พร้อม graceful fallback (ตารางอาจยังไม่มี)
// คืน { catalogByCode, aliasMap, skuOverrides } — ตารางที่ error → map ว่าง
export async function loadResolverMaps(supabase) {
  /* ⚠️ แยก "ตารางยังไม่มี" (graceful ได้) ออกจาก "อ่านไม่ได้" (ต้องบอก)
     tmk_sku_overrides = การแก้ลายรายบรรทัดที่ผู้ใช้ทำไว้ — อ่านไม่ได้แล้วเงียบ
     = ชื่อลายที่แก้แล้วหายจากทุกรายงาน โดยไม่มีสัญญาณใด ๆ
     คืน degraded ให้ผู้เรียกตัดสินใจ (เหมือน fetchProductDesigns ที่ทำถูกอยู่แล้ว) */
  const failed = [];
  const safe = async (fn, label) => {
    try {
      const { data, error } = await fn();
      if (error) { if (!/does not exist|42P01/i.test(error.message || error.code || '')) failed.push(label); return []; }
      return data || [];
    } catch { failed.push(label); return []; }
  };
  const [cat, ali, ov, vers] = await Promise.all([
    safe(() => supabase.from('tmk_shirt_catalog').select('code,name,job_type').limit(5000), 'แคตตาล็อกลาย'),
    safe(() => supabase.from('tmk_mp_aliases').select('kind,term,code,design').limit(5000), 'ชื่อพ้องลาย'),
    safe(() => supabase.from('tmk_sku_overrides').select('key,design,product_code').limit(20000), 'ลายที่แก้รายบรรทัด'),
    fetchAllVersions(),   // graceful: ตาราง versions ยังไม่มี → []
  ]);
  return {
    catalogByCode: indexCatalog(cat),
    aliasMap: indexAliases(ali),
    skuOverrides: indexSkuOverrides(ov),
    versionIndex: buildVersionIndex(vers),   // as-of-date pinning (empty ถ้าไม่มีประวัติ → overhead 0)
    degraded: failed,   // ไม่ว่าง = ชื่อลายบางส่วนอาจไม่ตรงของจริง (ผู้เรียกควรเตือน)
    _catalogRows: cat,   // เก็บไว้ใช้ job_type ต่อ
  };
}
