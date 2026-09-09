/* ============================================================
   saleData.js — ชั้นข้อมูล Sale: โหลดเฉพาะที่ต้องใช้ + แคชกลาง
   - ตัดคอลัมน์ที่ไม่ใช้ (เลิก select '*') → payload เบาลงมาก
   - โหลดเฉพาะ "หน้าต่างเวลา" ที่กำลังดู (server-side filter) → เข้าหน้าแรกไว
   - แคชข้ามหน้า: ครั้งแรกโหลดจริง ครั้งต่อไปใช้ของในแคช (สลับหน้าทันที)
   ============================================================ */
import { supabase } from './supabaseClient.js';
import { markSaleWrite } from './saleRealtime.js';
import { rtDiag } from '../realtime/diagnostics.js';
// resolveJobType = สูตร canonical ร่วมกับ edge (daily-sale-report) → import จาก _shared แหล่งเดียว (P2-4)
import { resolveJobType } from '../../supabase/functions/_shared/saleFormulas.js';

// คอลัมน์ที่ระบบใช้จริง (ตัด attrs/jsonb/คอลัมน์ที่ไม่ได้โชว์ออก)
export const ORDERS_SEL = 'order_no,marketplace_id,source,channel,salesperson,province,payment_type,customer_type,qty,qty_band,sales,mkt_commission,cod_amount,job_type,note,order_date,order_month,status,customer_code,customer_name,customer_social,customer_phone,cust_total_spent,row_version';
export const SKUS_SEL = 'id,order_no,source,channel,design,color,size,qty,line_sales,product_code,raw_sku_or_name,match_how,order_date';   // source = จำเป็นตอนเทียบใบยกเลิก (เลขออเดอร์ซ้ำข้ามช่องทางได้)
export const CUST_SEL = 'customer_code,name,phone,social_name,province,district,postcode,address,owner,cadence,repurchase,lifetime_orders,lifetime_sales,lifetime_cancel,since,tags';
/* คอลัมน์เสริมที่ยังไม่มีในบางสภาพแวดล้อม (ยังไม่ migrate) — แยกไว้เพื่อ fallback ได้
   ⚠️ ห้ามอ่านโปรไฟล์ลูกค้าด้วย CUST_SEL เปล่า ๆ แล้วเอาไปเซฟกลับ:
      note/contact_channel จะเป็น undefined → เซฟทับเป็น '' = ลบของจริงทิ้ง
      (บั๊กจริง: ลิ้นชักลูกค้าลบโน้ต+ช่องทาง CRM ทุกครั้งที่แก้ · เจอ 8 ก.ย. 69)
   ใช้ fetchCustomerProfiles() ด้านล่างแทนเสมอ */
export const CUST_SEL_FULL = CUST_SEL + ',contact_channel,note,last_order';
// คนทัก (funnel) — คอลัมน์ที่ helper อ่านจริงเท่านั้น (PART 109 ลด egress · เดิม select '*' ทั้งตาราง)
//   date/salesperson = คีย์กรอง · leads (jsonb ใหม่) · voice (เสียงลูกค้า) · 4 คอลัมน์ legacy = funnelBreakdown รูปแบบ (ค)
//   ⚠️ แก้ตรงนี้ต้องดูให้ครบตามที่ funnelBreakdown/funnelVoices ใช้ (มีเทสล็อกไว้ที่ saleData-funnel.test.js)
export const FUNNEL_SEL = 'date,salesperson,leads,voice,leads_fb_new,leads_fb_old,leads_line_new,leads_line_old';
// override ระดับออเดอร์ (order_id = "source:order_no") — ใช้ร่วม dashboard/perf (กัน select drift)
export const OVERRIDES_SEL = 'order_id,job_type,customer_name,customer_type,salesperson,note,channel,payment_type,sales,qty,province,order_date,cod_amount,customer_phone,customer_social';

const cache = new Map();    // key -> { ts, data }
const inflight = new Map();
const TTL = 5 * 60 * 1000;  // 5 นาที

// ประเภทงาน: รวม "ส่ง" (ขายส่งตามจำนวน) เข้าเป็น "ปลีก" — เหลือ ปลีก / DFT / OEM
// (DFT มาจากหมายเหตุ; ยุบ "ส่ง"→"ปลีก" ทันที)
export const normJobType = (jt) => (jt === 'ส่ง' ? 'ปลีก' : (jt || 'ปลีก'));
// คำ "DFT" ในหมายเหตุ (word-boundary — ตรงกับ jobTypeFromNote/isDftNote ทั้งระบบ)
const DFT_RE = /\bdft\b/i;
// predicate เดียวของทั้งระบบ: หมายเหตุมีคำ "DFT" (word-boundary) — reuse โดย mpReport/receiptParse/views-2
export const isDftNote = (note) => DFT_RE.test(String(note || ''));
// resolve ประเภทงานตอน "อ่าน" — หมายเหตุเป็นเจ้าของ DFT (single source of truth):
//  (1) ยุบ "ส่ง"→"ปลีก"
//  (2) หมายเหตุมี "DFT" → DFT (promote · ครอบใบเก่า/parser จับ note ไม่ติด)
//  (3) หมายเหตุไม่มี "DFT" แต่ค่าเก็บเป็น DFT → กลับเป็น ปลีก (demote · ลบ DFT ในหมายเหตุ = ไม่ DFT)
//  OEM ไม่แตะ · ใช้ทั้ง normOrderRows (raw) และ "หลัง merge override"
//  นิยามอยู่ที่ _shared/saleFormulas.js (แหล่งเดียวร่วมกับ edge) → re-export ต่อ (P2-4)
export { resolveJobType };
// choke point เดียวของทุกหน้า Sale (orders/dashboard/perf โหลดผ่านที่นี่หมด)
function normOrderRows(rows, table) {
  if (table !== 'tmk_mp_orders' || !Array.isArray(rows)) return rows;
  for (const r of rows) { if (r) r.job_type = resolveJobType(r.job_type, r.note); }
  return rows;
}

// ตัดคอลัมน์ note ออกจาก select (ใช้ fallback ถ้า DB ยังไม่มีคอลัมน์ note)
// schema-tolerant: คอลัมน์ที่เพิ่มทีหลัง (migration อาจยังไม่รัน) → error 42703 = ตัดคอลัมน์ที่ระบบบอกว่าไม่มีออกแล้วลองใหม่
// ครอบ note (20260626) + customer_phone (20260715) + คอลัมน์อนาคต — จุดเดียวคุมทุก caller (dashboard/perf/orders)
const stripCol = (sel, col) => sel.split(',').filter(c => c.trim() !== col).join(',');
const missingColOf = (err, sel) => {
  if (!err || !(err.code === '42703' || /exist/i.test(err.message || ''))) return '';
  const cols = sel.split(',').map(c => c.trim());
  return cols.find(c => c && new RegExp(`\\b${c}\\b`).test(err.message || '')) || '';
};

const PAGINATE_MAX_PAGES = 100;   // เพดานกัน query หลุด = 100k แถว/ช่วงเวลา
async function paginate(buildQuery) {
  const out = []; let from = 0; let truncated = false;
  for (let i = 0; i < PAGINATE_MAX_PAGES; i++) {
    const { data, error } = await buildQuery().range(from, from + 999);
    if (error) return { error };
    out.push(...(data || [])); if (!data || data.length < 1000) break; from += 1000;
    // ครบเพดานแล้วแต่หน้าสุดท้ายยังเต็ม = ยังมีข้อมูลต่อ → เตือนว่าตัดข้อมูล
    if (i === PAGINATE_MAX_PAGES - 1 && data.length === 1000) {
      truncated = true;
      console.warn(`[saleData] paginate ชนเพดาน ${PAGINATE_MAX_PAGES * 1000} แถว — ข้อมูลถูกตัด (truncated)`);
    }
  }
  return { data: out, truncated };
}

// รัน select แบบ paginate + ถ้าพังเพราะคอลัมน์ยังไม่ migrate → ตัดคอลัมน์นั้นออกแล้วลองใหม่ (วนจนกว่าจะผ่าน/ไม่ใช่ error คอลัมน์)
async function selectAll(table, sel, addFilters) {
  const build = (s) => () => addFilters(supabase.from(table).select(s));
  let s = sel;
  let r = await paginate(build(s));
  for (let i = 0; r.error && i < 3; i++) {
    const col = missingColOf(r.error, s);
    if (!col) break;
    s = stripCol(s, col);
    r = await paginate(build(s));
  }
  return r;
}

// โหลดทั้งตาราง (ใช้กับตารางเล็ก: customers/funnel/aliases/entries)
export async function cachedFetchAll(table, sel = '*', force = false) {
  const key = `${table}|${sel}`;
  const hit = cache.get(key);
  if (!force && hit && (Date.now() - hit.ts) < TTL) { rtDiag.query(table, 0, true); return { data: hit.data, cached: true, truncated: hit.truncated }; }
  if (!force && inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    const r = await selectAll(table, sel, (q) => q);
    inflight.delete(key);
    if (r.error) return r;
    normOrderRows(r.data, table);
    rtDiag.query(table, r.data?.length || 0, false); // Phase 0 baseline: นับ DB query + rows (dev-only)
    cache.set(key, { ts: Date.now(), data: r.data, truncated: r.truncated });
    return r;
  })();
  inflight.set(key, run);
  return run;
}

// โหลดเฉพาะช่วงวันที่ (server-side) — ใช้กับ orders/skus ที่มีจำนวนมาก
export async function cachedFetchRange(table, sel, from, to, dateCol = 'order_date', force = false) {
  if (!from || !to) return cachedFetchAll(table, sel, force);
  const key = `${table}|${sel}|${from}|${to}`;
  const hit = cache.get(key);
  if (!force && hit && (Date.now() - hit.ts) < TTL) return { data: hit.data, cached: true, truncated: hit.truncated };
  if (!force && inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    const r = await selectAll(table, sel, (q) => q.gte(dateCol, from).lte(dateCol, to));
    inflight.delete(key);
    if (r.error) return r;
    normOrderRows(r.data, table);
    cache.set(key, { ts: Date.now(), data: r.data, truncated: r.truncated });
    return r;
  })();
  inflight.set(key, run);
  return run;
}

// ขอบวันที่จริงในฐานข้อมูล (min/max) — สำหรับตัวเลือกวันที่ · เบามาก (2 แถว)
export async function getDateBounds(table = 'tmk_mp_orders', dateCol = 'order_date', force = false) {
  const key = `__bounds|${table}`;
  const hit = cache.get(key);
  if (!force && hit && (Date.now() - hit.ts) < TTL) return hit.data;
  const lo = await supabase.from(table).select(dateCol).not(dateCol, 'is', null).order(dateCol, { ascending: true }).limit(1);
  const hi = await supabase.from(table).select(dateCol).not(dateCol, 'is', null).order(dateCol, { ascending: false }).limit(1);
  const b = { min: lo.data?.[0]?.[dateCol] || null, max: hi.data?.[0]?.[dateCol] || null };
  /* ⚠️ ห้ามแคชผลที่ "อ่านไม่สำเร็จ" — เดิมแคชทุกกรณี TTL 5 นาที ทำให้:
     · หน้าออเดอร์ขึ้น empty-state ค้าง 5 นาทีเต็มแม้กดรีเฟรช (แคชอยู่ในหน่วยความจำ ไม่ผูก reloadKey)
     · รายงานขายได้ bounds = null → range ว่าง → cachedFetchRange ตกไป cachedFetchAll = โหลดทั้งตาราง
     คืน error กลับไปด้วย ให้ผู้เรียกแยก "ไม่มีข้อมูล" ออกจาก "อ่านไม่ได้" ได้ */
  if (lo.error || hi.error) return { ...b, error: lo.error || hi.error };
  cache.set(key, { ts: Date.now(), data: b });
  return b;
}

// ล้างแคช — หลังนำเข้า/บันทึก เพื่อให้รอบหน้าโหลดของใหม่
/**
 * โปรไฟล์ลูกค้า — ตัวโหลดกลางของทั้งระบบ (หน้า CRM + ลิ้นชักลูกค้าใช้ตัวเดียวกัน)
 * graceful: คอลัมน์เสริมยังไม่ migrate → ถอยไป CUST_SEL แล้วบอกผู้เรียกผ่าน `partial`
 * ⚠️ คืน { rows, error, partial } — ผู้เรียก **ต้องเช็ค error ก่อนเอาไปเซฟกลับ**
 *    (อ่านไม่ได้ ≠ ไม่มีข้อมูล — เซฟทับตอนอ่านพลาด = ลบโปรไฟล์ทิ้งทั้งชุด)
 */
export async function fetchCustomerProfiles(force = false) {
  let r = await cachedFetchAll('tmk_mp_customers', CUST_SEL_FULL, force);
  if (r.error && /contact_channel|note|last_order|column/i.test(r.error.message || '')) {
    const f = await cachedFetchAll('tmk_mp_customers', CUST_SEL, force);
    return { rows: f.data || [], error: f.error || null, partial: !f.error };
  }
  return { rows: r.data || [], error: r.error || null, partial: false };
}

export function clearSaleCache() { cache.clear(); inflight.clear(); }

// ลบ cache เฉพาะ key ที่ขึ้นต้นด้วย prefix (invalidate ตารางเดียว ไม่กระทบตารางอื่น)
// mark=true (ดีฟอลต์) = "เซฟเอง" → ข้าม echo ของตารางนี้ (กัน realtime โหลดซ้ำ 2×)
// mark=false = เรียกจาก realtime RECEIVE handler (react ต่อ event คนอื่น) → ห้าม mark ไม่งั้นจะ "หูหนวก" ต่อ event ตัวถัดไป 900ms
export function invalidateSaleCache(prefix, { mark = true } = {}) {
  if (mark) markSaleWrite(prefix);
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  for (const k of [...inflight.keys()]) if (k.startsWith(prefix)) inflight.delete(k);
  cache.delete(`__bounds|${prefix}`);   // bounds cache คีย์ขึ้นต้น __bounds| → ไม่โดน startsWith → ลบตรง (กันช่วงวันที่ picker ค้างหลังเพิ่มออเดอร์วันใหม่)
}

/* ---------- คนทัก (funnel) — helper กลาง ----------
   3 รูปแบบที่รองรับ (back-compat):
   (ก) ใหม่สุด: jsonb `leads` = {Facebook: {new:5, old:3}, LINE: {new:2, old:0}} (แยกใหม่/เก่า)
   (ข) เดิม:    jsonb `leads` = {Facebook: 12, LINE: 8}                        (ทักรวมต่อแพลตฟอร์ม)
   (ค) legacy:  4 คอลัมน์ leads_fb_new/old + leads_line_new/old
   → funnelPlatforms คืน "รวมต่อแพลตฟอร์ม" (ทั้ง 3 รูป) · funnelBreakdown คืน {plat:{new,old}} · funnelNewOld คืน {new,old} รวม */
export function funnelBreakdown(r) {
  const j = r?.leads;
  const out = {};
  if (j && typeof j === 'object' && Object.keys(j).length) {
    for (const [k, v] of Object.entries(j)) {
      if (v && typeof v === 'object') {            // (ก) {new,old}
        const nw = Number(v.new) || 0, od = Number(v.old) || 0;
        if (nw + od > 0) out[k] = { new: nw, old: od };
      } else {                                      // (ข) number แบน — ไม่รู้ใหม่/เก่า
        const n = Number(v) || 0;
        if (n > 0) out[k] = { new: 0, old: 0, unknown: n };
      }
    }
    return out;
  }
  const fbN = Number(r?.leads_fb_new) || 0, fbO = Number(r?.leads_fb_old) || 0;   // (ค) legacy
  const lnN = Number(r?.leads_line_new) || 0, lnO = Number(r?.leads_line_old) || 0;
  if (fbN + fbO > 0) out.Facebook = { new: fbN, old: fbO };
  if (lnN + lnO > 0) out.LINE = { new: lnN, old: lnO };
  return out;
}
const platTotal = (v) => (Number(v?.new) || 0) + (Number(v?.old) || 0) + (Number(v?.unknown) || 0);
export function funnelPlatforms(r) {
  const bd = funnelBreakdown(r);
  const out = {};
  for (const [k, v] of Object.entries(bd)) { const n = platTotal(v); if (n > 0) out[k] = n; }
  return out;
}
export function funnelNewOld(r) {
  const bd = funnelBreakdown(r);
  let nw = 0, od = 0, unk = 0;
  for (const v of Object.values(bd)) {
    nw += Number(v.new) || 0;
    od += Number(v.old) || 0;
    unk += Number(v.unknown) || 0;   // รูปแบบ ข (เลขแบน) — นับด้วย ให้ new+old+unknown = funnelTotal เสมอ
  }
  return { new: nw, old: od, unknown: unk };
}
export const funnelTotal = (r) => Object.values(funnelPlatforms(r)).reduce((a, v) => a + v, 0);

/* ============================================================
   override ที่ "ย้ายวันที่" ออเดอร์ — กันเงินหายจากรายงาน
   ============================================================
   แก้วันที่ออเดอร์ = อัปเดตแถวจริง + เขียน override เป็นตัวสำรอง (กัน re-import ทับ)
   แต่ถ้ามาร์เก็ตเพลส re-import ทับแถวจริงกลับเป็นวันเดิม จะเหลือ:
     วันที่ดิบ = 31 ส.ค. · วันที่หลัง override = 2 ก.ย.
   ทุก query กรอง order_date **ดิบ** ฝั่ง server → เดือน ก.ย. ไม่ดึงใบนี้มาเลย = ยอดหาย
   ฟังก์ชันนี้บอกว่า "ต้องดึง order_no ไหนเพิ่ม" (คำนวณจาก override ที่โหลดมาแล้ว — ไม่มีต้นทุน query ถ้าไม่มีเคสนี้)
   ============================================================ */
export function strayOverrideOrderNos(ovMap, from, to, have) {
  if (!ovMap || !from || !to) return [];
  /* ⚠️ ต้องตัดใบที่ "ดึงมาแล้ว" ออก — override layer เขียนแถวให้ทุกใบที่เคยแก้ในเว็บ พร้อม order_date
     ถ้าไม่ตัด จะคืน order_no ของใบที่อยู่ใน base อยู่แล้ว → ผู้เรียกเอาไปต่อท้าย = ทุกใบซ้ำ 2 รอบ
     (บั๊กจริง 3 ก.ย. 69: ก.ย. 39 ใบ ฿18,911 กลายเป็น 78 ใบ ฿37,822 ทั้งหน้าแรก/เกจ/อันดับเซลล์)
     เทียบด้วย order_id = `source:order_no` ซึ่งเป็นคีย์เดียวกับที่ ovMap ใช้ → แม่นข้ามช่องทาง */
  const known = new Set((have || []).map(o => `${o?.source ?? ''}:${o?.order_no ?? ''}`));
  const nos = new Set();
  Object.entries(ovMap).forEach(([id, ov]) => {
    const d = ov?.order_date;
    if (!d || d < from || d > to) return;
    if (known.has(String(ov?.order_id || id))) return;
    const no = String(ov?.order_id || id).split(':').slice(1).join(':').trim();
    if (no) nos.add(no);
  });
  return [...nos];
}

/**
 * ยุบใบซ้ำหลังต่อ base กับ stray — คีย์ = `source|order_no` (เลขออเดอร์ซ้ำข้ามช่องทางได้)
 * ใบที่ไม่มีเลขออเดอร์ = จับคู่ไม่ได้ → เก็บไว้ทุกใบ (จับคู่ไม่ได้ ไม่ได้แปลว่าใบเดียวกัน)
 * เก็บแถวแรก = แถวจาก query หลักชนะแถวที่ดึงเพิ่ม
 */
export function dedupeOrders(rows) {
  const seen = new Set();
  return (rows || []).filter(o => {
    const no = String(o?.order_no ?? '').trim();
    if (!no) return true;
    const k = `${o?.source ?? ''}|${no}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

/** ดึงออเดอร์ตาม order_no (ใช้กับ stray ด้านบน) — คืน [] ถ้าไม่มีอะไรต้องดึง */
export async function fetchOrdersByNos(table, sel, nos) {
  if (!nos || !nos.length) return [];
  const out = [];
  for (let i = 0; i < nos.length; i += 150) {
    const r = await supabase.from(table).select(sel).in('order_no', nos.slice(i, i + 150));
    if (r.error) return out;            // ดึงเพิ่มไม่ได้ = กลับไปเท่าเดิม ไม่ทำให้แย่ลง
    out.push(...(r.data || []));
  }
  return out;
}
