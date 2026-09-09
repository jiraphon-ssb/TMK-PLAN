/* ============================================================
   saleFormulas.js — สูตร canonical "แหล่งเดียว" ที่ FE (เว็บ) กับ edge (LINE) ใช้ร่วมกัน (P2-4)
   ============================================================
   เดิม daily-sale-report (Deno) ก๊อปโลจิกจาก FE 5 ก้อน → เสี่ยง drift (ตัวเลขเว็บ ≠ ที่ส่ง LINE)
   รวมมาที่เดียว · คัดลอกลอจิกจาก FE ตรงเป๊ะ (FE = ความจริง):
     - resolveJobType                     ← src/lib/saleData.js
     - ORDER_OV_KEY / mergeOrderOverrides ← src/lib/saleOverrides.js
     - MARKETPLACE_CHANNELS / isLeadChannel ← src/lib/saleFields.js
     - isMasked / crmCustomerKey          ← src/lib/crmAgg.js
     - blankNoteData / normNoteData       ← src/lib/crmDailyNote.js
   plain ESM ล้วน (ไม่มี TS syntax / Deno API) → import ได้ทั้งเว็บ (Vite/vitest) และ edge (Deno)
   ทั้งฝั่ง FE (re-export จากไฟล์เดิม) และ edge ต่างชี้มาที่ไฟล์นี้ → แก้ที่เดียว มีผลทั้งสองฝั่ง
   ============================================================ */

// ---- ประเภทงาน DFT (จาก saleData.js — หมายเหตุเป็นเจ้าของ) ----
// คำ "DFT" ในหมายเหตุ (word-boundary — ตรงกับ isDftNote/jobTypeFromNote ทั้งระบบ)
const DFT_RE = /\bdft\b/i;
// resolve ประเภทงานตอน "อ่าน" — หมายเหตุเป็นเจ้าของ DFT (single source of truth):
//  (1) ยุบ "ส่ง"→"ปลีก"
//  (2) หมายเหตุมี "DFT" → DFT (promote · ครอบใบเก่า/parser จับ note ไม่ติด)
//  (3) หมายเหตุไม่มี "DFT" แต่ค่าเก็บเป็น DFT → กลับเป็น ปลีก (demote)
//  OEM ไม่แตะ · ใช้ทั้งตอน raw และ "หลัง merge override"
export function resolveJobType(jobType, note) {
  const jt = jobType === 'ส่ง' ? 'ปลีก' : (jobType || 'ปลีก');
  const hasDft = DFT_RE.test(String(note || ''));
  if (jt === 'ปลีก' && hasDft) return 'DFT';
  if (jt === 'DFT' && !hasDft) return 'ปลีก';
  return jt;
}

// ---- override ระดับออเดอร์ (จาก saleOverrides.js) ----
// key override ระดับออเดอร์ — source + order_no (เสถียรข้าม reimport)
export const ORDER_OV_KEY = (o) => `${o.source || ''}:${o.order_no}`;

// override ชนะเมื่อมีค่าจริง (คอลัมน์ใหม่ · เก่าไม่มี = undefined/'' → ใช้ค่าไฟล์)
const _num = (a, b) => (a != null && a !== '' ? Number(a) : b);
const _str = (a, b) => (a != null && a !== '' ? a : b);

/* merge override ระดับออเดอร์ทับค่า frozen (job_type/ลูกค้า/เซลล์/ช่อง/ยอด/จำนวน/จังหวัด/วันที่/COD)
   note → re-derive job_type (DFT จากหมายเหตุ) · แนบ _ov ไว้อ้างต้นฉบับ */
export function mergeOrderOverrides(orders, ovMap) {
  if (!orders) return orders;
  if (!ovMap || !Object.keys(ovMap).length) return orders;
  return orders.map(o => {
    const ov = ovMap[ORDER_OV_KEY(o)]; if (!ov) return o;
    const note = ov.note != null && ov.note !== '' ? ov.note : o.note;
    return {
      ...o,
      job_type: resolveJobType(ov.job_type || o.job_type, note),
      customer_name: ov.customer_name || o.customer_name,
      customer_type: ov.customer_type || o.customer_type,
      salesperson: ov.salesperson || o.salesperson,
      channel: _str(ov.channel, o.channel),
      payment_type: _str(ov.payment_type, o.payment_type),
      sales: _num(ov.sales, o.sales),
      qty: _num(ov.qty, o.qty),
      province: _str(ov.province, o.province),
      order_date: _str(ov.order_date, o.order_date),
      cod_amount: _num(ov.cod_amount, o.cod_amount),
      customer_phone: _str(ov.customer_phone, o.customer_phone),
      customer_social: _str(ov.customer_social, o.customer_social),
      note,
      _ov: ov,
    };
  });
}

// ---- ช่องมาร์เก็ตเพลส / %ปิด (จาก saleFields.js) ----
// ช่องมาร์เก็ตเพลส/หน้าร้าน — ไม่มี "คนทัก" (ลูกค้าสั่งเองในแพลตฟอร์ม) → ไม่นับเข้าตัวตั้ง %ปิดการขาย
// ที่เหลือ (FB/LINE/IG/TikTok/โทร/Direct) = ช่องแชท ที่มีการทักก่อนปิดการขาย
export const MARKETPLACE_CHANNELS = ['Shopee', 'Lazada', 'POS'];
export const isLeadChannel = (ch) => !!ch && !MARKETPLACE_CHANNELS.includes(ch);

// ---- "ออเดอร์ช่องแชท" (ตัวตั้งของ %ปิดการขาย) — เช็คทั้ง channel และ source ----
// ⚠️ เช็ค channel อย่างเดียวไม่พอ: ออเดอร์ TikTok Shop ที่ import จากไฟล์มาร์เก็ตเพลส
//    ได้ channel='TikTok' (source='tiktok' · salesperson='(TikTok)') → isLeadChannel คืน true
//    ทั้งที่ลูกค้าสั่งเองในแพลตฟอร์ม ไม่มีการทัก → %ปิดรวมของทีมสูงเกินจริง
//    ส่วน TikTok "แชท" ของจริง (เซลล์ปิดใน DM แล้วส่งใบเสร็จ Shipnity) ได้ source='shipnity' → นับปกติ
//    ∴ ออเดอร์แชท = ช่องทางแชท และ มาจากใบเสร็จ Shipnity เท่านั้น (import mp: 'tiktok'/'shopee' ไม่นับ)
export const isChatOrder = (o) => !!o && isLeadChannel(o.channel) && String(o.source || '') === 'shipnity';

// ---- ยอดมาร์เก็ตเพลสที่ "กรอกมือ" (PART 107 · สูตรร่วม FE ↔ edge) ----
// กติกาที่ user เคาะ 24 ส.ค. 69:
//   ยอดที่กรอกต่อวัน = **ยอดทั้งวันของช่องนั้น** (ออเดอร์ที่มีในระบบวันนั้นถือว่ารวมอยู่แล้ว)
//   **ยึดจาก import**: วันไหนมีไฟล์ import จริง (source ≠ shipnity) → ใช้ของ import ทิ้งค่าที่กรอก
//   วันที่ไม่มี import → บวกส่วนต่างที่ยังไม่มีในระบบ = max(0, ยอดกรอก − ยอดออเดอร์วันนั้น)
// (เดิมเทียบกันทั้งช่วง → มีออเดอร์ mp ใบเดียวทั้งเดือน ยอดกรอกทั้งเดือนหายหมด)
export const SALE_CHANNELS = ['Facebook', 'LINE', 'Instagram', 'Phone', 'POS', 'Direct', 'Shopee', 'Lazada', 'TikTok'];
/** วันเริ่มใช้สูตรใหม่ (D6) — ก่อนหน้านี้ยอดทุกช่องทางกรอกมือทั้งหมด (ยุคเก่า) */
export const MERGE_CUTOFF = '2026-08-01';
export const MANUAL_MP_CHANNELS = ['Shopee', 'TikTok', 'Lazada'];
// id ช่องทางยุคเก่า (tmk_channels ตัวเล็ก) → ชื่อชุด Sale
/* id ช่องทางยุคเก่า (tmk_channels ตัวเล็ก) → ชื่อชุด Sale
   'crm' = ยอดจากการโทร/ติดตามลูกค้าเก่าในระบบเดิม → ช่องทาง 'Phone' ของชุดใหม่
   ⚠️ เคยไม่มี 'crm' ในลิสต์นี้ → ยอด CRM ของยุคเก่าถูกทิ้งทั้งหมด (มิ.ย. 69 ฿113,749 · ก.ค. 69 ฿70,095)
      ทั้งในรายงานขายและรายงาน LINE — ห้ามเอาออกอีก (มีเทสคุมยอดวัน 30 มิ.ย. = ฿24,297.47) */
export const LEGACY_CHANNEL_IDS = { facebook: 'Facebook', line_oa: 'LINE', instagram: 'Instagram', tiktok: 'TikTok', shopee: 'Shopee', lazada: 'Lazada', crm: 'Phone' };
/** ออเดอร์ที่มาจากไฟล์มาร์เก็ตเพลสจริง (ไม่ใช่ใบเสร็จ Shipnity ที่เซลล์ส่งเอง) */
export const isImportedOrder = (o) => { const s = String((o && o.source) || '').toLowerCase(); return !!s && s !== 'shipnity'; };

/**
 * ยอดมาร์เก็ตเพลสที่ "นำเข้าแล้ว" ของออเดอร์ชุดหนึ่ง (ปกติ = ของวันเดียว) → { ช่องทาง: ยอด }
 * ใช้ตัดสินว่าฟอร์มกรอกยอดรายวันจะล็อกช่องไหน — ต้องเป็นกติกาเดียวกับ hasImport
 * ใน mpExtraRevenue/manualExtraStats ไม่งั้นฟอร์มล็อกช่องที่สูตรพร้อมรับ (ยอดวันนั้นค้าง 0 ถาวร)
 * ⚠️ กติกาคือ "ต่อ ช่องทาง × วัน" — ผู้เรียกต้องส่งออเดอร์ของ **วันเดียว** มาเท่านั้น
 */
export function importedMpRevOfDay(orders) {
  const out = {};
  for (const o of (orders || [])) {
    if (String((o && o.status) || '').toLowerCase() === 'cancelled') continue;   // ตรงกับ mpExtraRevenue
    const ch = o && o.channel;
    if (!isImportedOrder(o) || !MANUAL_MP_CHANNELS.includes(ch)) continue;
    /* ⚠️ ต้องเป็น "มีไฟล์นำเข้าไหม" ไม่ใช่ "ยอดรวมมากกว่า 0"
       hasImport ใน mpExtraRevenue ตั้งจาก **การมีแถว** ไม่ใช่จำนวนเงิน
       วันที่มีใบนำเข้าแต่ยอดรวมเป็น 0 (ใบถูกลดเหลือ 0 / sales null):
         ฟอร์มเดิมไม่ล็อก → เซลล์กรอกยอดเข้าไป → mpExtraRevenue เจอ hasImport แล้ว continue ทิ้ง
         = ยอดวันนั้นค้าง ฿0 ถาวร ซึ่งเป็นอาการเดียวกับที่ฟังก์ชันนี้ตั้งใจกันไว้ */
    out[ch] = { rev: ((out[ch] && out[ch].rev) || 0) + (Number(o.sales) || 0), rows: ((out[ch] && out[ch].rows) || 0) + 1 };
  }
  return out;
}

// คอลัมน์แยกยุคเก่าใน tmk_daily_sales (ก่อนย้ายมาเก็บใน jsonb channels) — ฟอร์มเก่าเขียนยอดลงคอลัมน์พวกนี้
export const LEGACY_REV_COLS = { shopee: 'Shopee', tiktok: 'TikTok', lazada: 'Lazada', facebook: 'Facebook', line_oa: 'LINE', crm: 'Phone' };   // crm = คอลัมน์แยกยุคเก่า (ยอดโทร/ติดตาม)

/**
 * อ่านยอด/ค่าแอดของแถว tmk_daily_sales 1 แถว → { ad:{ch:n}, mpRev:{ch:n}, rev:{ch:n} }
 * - key ใหม่ (Facebook) ชนะ key เก่า (facebook) เสมอ กันนับซ้ำ
 * - jsonb ไม่มีค่า → fallback อ่านคอลัมน์แยกยุคเก่า (shopee/tiktok/lazada/facebook/line_oa)
 * - mpRev = เฉพาะช่องมาร์เก็ตเพลส (กติกาหลัง cutoff) · rev = ทุกช่องทาง (ใช้กับข้อมูลยุคเก่า)
 */
export function readDailyChannels(row) {
  const cj = (row && typeof row.channels === 'object' && row.channels) || {};
  const ad = {}, mpRev = {}, rev = {};
  // stats = ตัวเลขที่ยุคเก่ากรอกไว้ต่อช่องทาง (ord=ออเดอร์ · inq=คนทัก · newC/oldC=ลูกค้าใหม่/เก่า)
  // ยุคใหม่ไม่ได้กรอก (มาจากออเดอร์จริง/ตารางคนทัก) → คีย์จะไม่โผล่เอง
  const stats = {};
  const newKeys = new Set(Object.keys(cj).filter(k => SALE_CHANNELS.includes(k)));
  for (const [ch, v] of Object.entries(cj)) {
    if (!v || typeof v !== 'object') continue;
    const isNew = SALE_CHANNELS.includes(ch);
    const name = isNew ? ch : LEGACY_CHANNEL_IDS[ch];
    if (!name) continue;
    if (!isNew && newKeys.has(name)) continue;
    const a = Number(v.ad) || 0, r = Number(v.rev) || 0;
    if (a) ad[name] = (ad[name] || 0) + a;
    if (r) {
      rev[name] = (rev[name] || 0) + r;
      if (MANUAL_MP_CHANNELS.includes(name)) mpRev[name] = (mpRev[name] || 0) + r;
    }
    const ord = Number(v.ord) || 0, inq = Number(v.inq) || 0, newC = Number(v.newC) || 0, oldC = Number(v.oldC) || 0;
    if (ord || inq || newC || oldC) {
      const g = stats[name] || (stats[name] = { ord: 0, inq: 0, newC: 0, oldC: 0 });
      g.ord += ord; g.inq += inq; g.newC += newC; g.oldC += oldC;
    }
  }
  // fallback คอลัมน์แยกยุคเก่า — ใช้เฉพาะช่องที่ jsonb ไม่มีค่า (jsonb ชนะเสมอ กันนับซ้ำ)
  for (const [col, name] of Object.entries(LEGACY_REV_COLS)) {
    if (rev[name] != null) continue;
    const r = Number(row && row[col]) || 0;
    if (!r) continue;
    rev[name] = r;
    if (MANUAL_MP_CHANNELS.includes(name)) mpRev[name] = (mpRev[name] || 0) + r;
  }
  return { ad, mpRev, rev, stats };
}

/**
 * แถว tmk_daily_sales หลายแถว → { ch: { 'YYYY-MM-DD': ยอดที่กรอก } }
 * - วันตั้งแต่ MERGE_CUTOFF: เอาเฉพาะช่องมาร์เก็ตเพลส (ช่องแชทมายอดจากใบเสร็จแล้ว)
 * - วันก่อน cutoff (ยุคเก่า): เอาทุกช่องทาง — ยุคนั้นกรอกยอดมือทุกช่อง ถ้าไม่อ่านยอดจะขาด
 */
export function mpRevByDateOf(dailyRows) {
  const out = {};
  for (const r of (dailyRows || [])) {
    if (!r || r.deleted_at) continue;
    const d = String(r.date || '').slice(0, 10);
    if (!d) continue;
    const parsed = readDailyChannels(r);
    const src = d >= MERGE_CUTOFF ? parsed.mpRev : parsed.rev;
    for (const [ch, v] of Object.entries(src)) {
      (out[ch] || (out[ch] = {}))[d] = (out[ch][d] || 0) + v;
    }
  }
  return out;
}

/**
 * ยอด mp ที่ต้อง "บวกเพิ่ม" จากที่กรอกมือ — ราย วัน × ช่องทาง
 * @returns { extra: {ch:number}, byDate: {date:number}, manualDays: {ch:string[]} }
 */
export function mpExtraRevenue(orders, mpRevByDate) {
  const byDay = {};
  for (const o of (orders || [])) {
    const ch = (o && o.channel) || 'Direct';
    if (String((o && o.status) || '').toLowerCase() === 'cancelled') continue;
    const d = String((o && o.order_date) || '').slice(0, 10);
    const m = byDay[ch] || (byDay[ch] = {});
    const g = m[d] || (m[d] = { sum: 0, hasImport: false });
    g.sum += Number(o.sales) || 0;
    if (isImportedOrder(o)) g.hasImport = true;
  }
  const extra = {}, byDate = {}, manualDays = {};
  for (const [ch, days] of Object.entries(mpRevByDate || {})) {
    for (const [d, rev] of Object.entries(days || {})) {
      // ตั้งแต่ cutoff: กรอกมือได้เฉพาะมาร์เก็ตเพลส · ก่อน cutoff: ยุคเก่ากรอกทุกช่องทาง
      if (d >= MERGE_CUTOFF && !MANUAL_MP_CHANNELS.includes(ch)) continue;
      const r = Number(rev) || 0; if (r <= 0) continue;
      const g = byDay[ch] && byDay[ch][d];
      if (g && g.hasImport) continue;
      const add = Math.max(0, r - (g ? g.sum : 0));
      if (add <= 0) continue;
      extra[ch] = (extra[ch] || 0) + add;
      byDate[d] = (byDate[d] || 0) + add;
      (manualDays[ch] || (manualDays[ch] = [])).push(d);
    }
  }
  return { extra, byDate, manualDays };
}

// ---- CRM customer key (จาก crmAgg.js) ----
// ลูกค้าปกปิด (Shopee mask "ณ******์") → '' ไม่คลัสเตอร์ · code ว่าง → จับด้วยชื่อ ('N'+ชื่อ)
export const isMasked = (v) => /\*{2,}/.test(String(v || ''));
export function crmCustomerKey(o) {
  if (isMasked(o.customer_name) || isMasked(o.customer_code)) return '';
  const c = String(o.customer_code || '').trim();
  if (c) return c;
  const n = String(o.customer_name || '').trim();
  return n ? 'N' + n.slice(0, 60) : '';
}

// ---- บันทึกประจำวัน CRM (จาก crmDailyNote.js) ----
const _n = (v) => Number(v) || 0;

/** โครงข้อมูลเปล่า — 3 กลุ่มโทร + อัพเซลล์ + แถม/วันเกิด + เสียงลูกค้า */
export function blankNoteData() {
  return {
    calls: {
      d0: { total: 0, answered: 0 },   // 0DAY (โทรวันปิดการขาย)
      d5: { total: 0, answered: 0 },   // 5DAY (ตามหลังปิด 5 วัน)
      rep: { total: 0, answered: 0 },  // Repurchase (ชวนซื้อซ้ำ)
    },
    upsellOrders: 0, upsellBaht: 0,
    freebieOrders: 0,   // ออเดอร์แถม
    birthdayOrders: 0,  // โปรวันเกิด
    ask: '', praise: '', complaint: '',  // ถาม / ชม / ติ
    extra: '',          // หมายเหตุเพิ่มเติม
  };
}

/** เติมช่องที่ขาดให้ครบโครง (data เก่า/บางส่วน → ไม่พัง) */
export function normNoteData(d) {
  const b = blankNoteData();
  if (!d || typeof d !== 'object') return b;
  const c = d.calls || {};
  return {
    calls: {
      d0: { total: _n(c.d0?.total), answered: _n(c.d0?.answered) },
      d5: { total: _n(c.d5?.total), answered: _n(c.d5?.answered) },
      rep: { total: _n(c.rep?.total), answered: _n(c.rep?.answered) },
    },
    upsellOrders: _n(d.upsellOrders), upsellBaht: _n(d.upsellBaht),
    freebieOrders: _n(d.freebieOrders), birthdayOrders: _n(d.birthdayOrders),
    ask: String(d.ask || ''), praise: String(d.praise || ''), complaint: String(d.complaint || ''),
    extra: String(d.extra || ''),
  };
}

/**
 * สถิติยุคเก่าที่ "เอามาใช้ได้จริง" หลังกันซ้ำกับข้อมูลยุคใหม่
 * กติกาเดียวกับยอดเงิน (mpExtraRevenue) แต่แยกตัวนับ:
 *   - ord/newC/oldC : วันไหนมีออเดอร์จาก import แล้ว = ใช้ของ import (ข้ามที่กรอกมือ)
 *   - inq (คนทัก)   : วันไหนมีแถวใน tmk_sales_funnel แล้ว = ใช้ของตารางคนทัก (ข้ามที่กรอกมือ)
 * @param orders       ออเดอร์ในช่วง (ใช้ดูว่าวันไหนมี import)
 * @param statsByDate  { [channel]: { [date]: {ord,inq,newC,oldC} } }
 * @param funnelDates  รายการวันที่มีแถวคนทักในระบบใหม่
 */
export function manualExtraStats(orders, statsByDate, funnelDates) {
  /* ⚠️ ต่างจากยอดเงิน: "จำนวน" (ออเดอร์/ลูกค้า) หักส่วนต่างไม่ได้ →
     วันไหน+ช่องไหนมี "ออเดอร์จริงในระบบ" อยู่แล้ว (ใบเสร็จ Shipnity ก็นับ ไม่ใช่แค่ไฟล์ import)
     ให้ใช้ของจริงอย่างเดียว ไม่บวกที่กรอกมือทับ — ไม่งั้นช่วงคาบเกี่ยว 15–31 ก.ค. 69 จะนับซ้ำสองรอบ */
  const realDays = {};        // มีออเดอร์จริงใด ๆ (ใบเสร็จ Shipnity ก็นับ) — กติกายุคเก่า
  const importDays = {};      // มีออเดอร์จาก "ไฟล์นำเข้า" เท่านั้น — กติกามาร์เก็ตเพลสยุคใหม่
  for (const o of (orders || [])) {
    if (String((o && o.status) || '').toLowerCase() === 'cancelled') continue;
    const ch = (o && o.channel) || 'Direct';
    const d = String((o && o.order_date) || '').slice(0, 10);
    if (!d) continue;
    (realDays[ch] || (realDays[ch] = new Set())).add(d);
    if (isImportedOrder(o)) (importDays[ch] || (importDays[ch] = new Set())).add(d);
  }
  const fDays = new Set((funnelDates || []).map(d => String(d).slice(0, 10)));
  const out = {};
  for (const [ch, days] of Object.entries(statsByDate || {})) {
    for (const [d, v] of Object.entries(days || {})) {
      if (d >= MERGE_CUTOFF) {
        /* ยุคใหม่: "จำนวน" มาจากออเดอร์จริง + ตารางคนทัก — ยกเว้นมาร์เก็ตเพลสที่กรอกยอดมือได้
           (Shopee/TikTok/Lazada ไม่มีใบเสร็จ Shipnity → ถ้าไม่มีไฟล์นำเข้าวันนั้น ก็ไม่มีทางรู้จำนวนออเดอร์
            นอกจากกรอกเอง) กติกาเดียวกับเงิน: มี import แล้วไม่บวกกรอกมือทับ
           ⚠️ แยกเก็บที่ ordMp ไม่ใช่ ord — เพราะ ord ถูกใช้เป็นตัวตั้ง %ปิดของยุคเก่า
              ส่วนออเดอร์มาร์เก็ตเพลสไม่มีการ "ทัก" ก่อนซื้อ (TikTok เป็นช่องแชทแต่ยอดที่กรอกคือยอดร้าน) */
        if (!MANUAL_MP_CHANNELS.includes(ch)) continue;
        if (importDays[ch] && importDays[ch].has(d)) continue;
        const addMp = Number(v.ord) || 0;
        if (addMp <= 0) continue;
        const gm = out[ch] || (out[ch] = { ord: 0, ordMp: 0, inq: 0, newC: 0, oldC: 0 });
        gm.ordMp += addMp;
        continue;
      }
      const hasReal = realDays[ch] && realDays[ch].has(d);
      const addOrd = hasReal ? 0 : (Number(v.ord) || 0);
      const addNew = hasReal ? 0 : (Number(v.newC) || 0);
      const addOld = hasReal ? 0 : (Number(v.oldC) || 0);
      const addInq = fDays.has(d) ? 0 : (Number(v.inq) || 0);
      if (!(addOrd || addNew || addOld || addInq)) continue;   // ไม่มีอะไรเพิ่ม = ไม่ต้องสร้างช่องเปล่า
      const g = out[ch] || (out[ch] = { ord: 0, ordMp: 0, inq: 0, newC: 0, oldC: 0 });
      g.ord += addOrd; g.newC += addNew; g.oldC += addOld; g.inq += addInq;
    }
  }
  return out;
}
