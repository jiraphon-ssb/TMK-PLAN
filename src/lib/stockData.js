/* ============================================================
   stockData.js — ชั้นข้อมูลของสต็อก (PART 112 · เฟส 1)
   ============================================================
   graceful: ยังไม่ได้รัน migration 20260824-stock-counts.sql → คืน missing=true
   ให้ UI ขึ้นข้อความบอกวิธีเปิดใช้ แทนที่จะพัง
   ============================================================ */
import { supabase } from './supabaseClient.js';
import { skuKey } from './stockCount.js';
import { needsMigration } from './pgError.js';
import { cachedFetchAll, invalidateSaleCache } from './saleData.js';

export const STOCK_MIGRATION = '20260824-stock-counts.sql';
const COUNTS_SEL = 'id,session_id,count_date,design,color,size,product_code,qty,kind,note,created_by,created_at';

/** ดึงการนับทั้งหมด (ตารางเล็ก — 1 แถวต่อ SKU ต่อรอบนับ) */
/* ใช้ cache ชุดเดียวกับหน้าอื่น (TTL 5 นาที) — หน้าสต็อกและหน้าสินค้าเรียกตัวนี้คนละที่
   ถ้าไม่ cache = ดึงทั้งตารางใหม่ทุกครั้งที่เปิดหน้า · เซฟ/ลบแล้วเราล้าง cache เองอยู่แล้ว */
export async function fetchStockCounts(force = false) {
  try {
    const r = await cachedFetchAll('tmk_stock_counts', COUNTS_SEL, force);
    if (r?.error) return { rows: [], missing: needsMigration(r.error), error: r.error };
    return { rows: r?.data || [], missing: false };
  } catch (e) { return { rows: [], missing: false, error: e }; }
}

/**
 * บันทึก 1 รอบนับ (upsert ทั้งชุด) — id = session::design::color::size กันซ้ำในรอบเดียวกัน
 * @param rows [{ design, color, size, qty, productCode }]
 */
export async function saveStockCount({ rows, countDate, kind = 'count', note = '', by = '', sessionId }) {
  const list = (rows || []).filter(r => r && r.design && r.color && r.size);
  if (!list.length) return { error: new Error('ไม่มีข้อมูลให้บันทึก') };
  const sid = sessionId || `${kind}-${countDate}-${Date.now().toString(36)}`;
  const payload = list.map(r => ({
    id: `${sid}::${skuKey(r.design, r.color, r.size)}`,
    session_id: sid, count_date: countDate,
    design: String(r.design).trim(), color: r.color, size: r.size,
    product_code: r.productCode || '', qty: Math.max(0, Math.round(Number(r.qty) || 0)),
    kind, note, created_by: by,
  }));
  // ชิ้นละ 500 แถว (กัน payload ใหญ่เกินตอนนำเข้าไฟล์ทั้งคลัง)
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.from('tmk_stock_counts').upsert(payload.slice(i, i + 500), { onConflict: 'id' });
    if (error) return { error, missing: needsMigration(error), saved: i };
  }
  invalidateSaleCache('tmk_stock_counts');   // เซฟแล้วต้องเห็นของใหม่ทันที (ไม่ค้าง cache 5 นาที)
  return { sessionId: sid, saved: payload.length };
}

/** ลบทั้งรอบนับ (กดผิด/นำเข้าไฟล์ผิด) */
export async function deleteStockSession(sessionId) {
  if (!sessionId) return { error: new Error('ไม่มีรอบนับ') };
  const { error } = await supabase.from('tmk_stock_counts').delete().eq('session_id', sessionId);
  if (!error) invalidateSaleCache('tmk_stock_counts');   // ลบแล้ว cache ต้องไม่ค้างของเก่า
  return { error, missing: needsMigration(error) };
}

/** รายชื่อรอบนับ (ไว้โชว์ประวัติ/ย้อนกลับ) */
export function sessionsOf(counts) {
  const m = new Map();
  (counts || []).forEach(c => {
    const g = m.get(c.session_id) || { sessionId: c.session_id, date: c.count_date, kind: c.kind, by: c.created_by, note: c.note, rows: 0, qty: 0, at: c.created_at };
    g.rows += 1; g.qty += Number(c.qty) || 0;
    if (String(c.created_at || '') > String(g.at || '')) g.at = c.created_at;
    m.set(c.session_id, g);
  });
  return [...m.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.at).localeCompare(String(a.at)));
}

/* ============================================================
   สมุดเคลื่อนไหว (PLAN-STOCK-V2 ระยะ 2) — เขียนคู่กับ tmk_stock_counts เดิม
   ============================================================
   ระยะนี้ยัง "ไม่สลับการอ่าน" — เว็บเขียนทั้งสองที่ อ่านยังใช้สูตรเดิม
   → ถ้ายังไม่ได้รัน migration ระบบทำงานเหมือนเดิมทุกอย่าง (เขียน move ล้มเหลวแบบเงียบได้)
   ⚠️ ตารางเป็น append-only (RLS ไม่ให้ update/delete) → ใช้ insert + ignore duplicate เท่านั้น
   ============================================================ */
export const MOVES_MIGRATION = '20260902-stock-moves.sql';
// ไฟล์ที่เพิ่มคอลัมน์ round_id (คีย์ "งวด") — แยกจากไฟล์สร้างตาราง เพื่อบอกผู้ใช้ให้ตรงตัว
export const MOVES_ROUND_MIGRATION = '20260908-stock-moves-round.sql';
/* round_id = คีย์ "งวด" (refType::refId::seq) — ใช้แยกงวดรับเข้าของ PO ใบเดียวกัน
   selectAll ตัดคอลัมน์ที่ยังไม่ migrate ออกเองได้ (42703) และ stockMoves.roundOf()
   ถอดจาก id ให้เป็น fallback → deploy FE ก่อน DB ได้ */
export const MOVES_SEL = 'id,sku_key,product_code,design,color,size,kind,qty,moved_on,eod,ref_type,ref_id,round_id,note,created_by,created_at';

/** เพิ่มแถวเคลื่อนไหว — คืน { error, missing } · ไม่ throw (ผู้เรียกตัดสินใจเองว่าจะเตือนไหม) */
export async function appendStockMoves(moves) {
  const list = (moves || []).filter(Boolean);
  if (!list.length) return { saved: 0 };
  /* ⚠️ ฝั่งอ่านมี fallback ตัด round_id แต่ฝั่งเขียนไม่มี → deploy เว็บก่อนรัน migration round_id
     = insert ล้ม 42703/PGRST204 ทุกครั้ง (movesFromCount/Receive/voidMove ใส่ round_id เสมอ)
     ต้องถอยเหมือนกัน ไม่งั้น "อ่านได้แต่เขียนไม่ได้" ซึ่งหน้าจอยังบอกว่าบันทึกสำเร็จ */
  const strip = (rows) => rows.map(({ round_id: _rid, ...rest }) => rest);
  let dropRound = false;
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    // id เป็น deterministic → กดซ้ำได้ไม่เกิดแถวซ้ำ (ignoreDuplicates = ไม่ต้อง update ซึ่ง RLS ห้ามอยู่แล้ว)
    let { error } = await supabase.from('tmk_stock_moves')
      .upsert(dropRound ? strip(chunk) : chunk, { onConflict: 'id', ignoreDuplicates: true });
    if (error && !dropRound && /round_id|column/i.test(error.message || '')) {
      dropRound = true;
      ({ error } = await supabase.from('tmk_stock_moves')
        .upsert(strip(chunk), { onConflict: 'id', ignoreDuplicates: true }));
    }
    if (error) return { error, missing: needsMigration(error), saved: i };
  }
  invalidateSaleCache('tmk_stock_moves');
  return { saved: list.length };
}

/** อ่านสมุดเคลื่อนไหวทั้งหมด (ตารางเล็ก — หลักพันแถว) */
export async function fetchStockMoves(force = false) {
  let r = await cachedFetchAll('tmk_stock_moves', MOVES_SEL, force);
  // ยังไม่ได้รัน migration round_id → ถอยไป select เดิม (roundOf ถอดคีย์งวดจาก id แทน)
  if (r.error && /round_id|column/i.test(r.error.message || '')) {
    r = await cachedFetchAll('tmk_stock_moves', MOVES_SEL.replace(',round_id', ''), force);
  }
  if (r.error) return { rows: [], error: r.error, missing: needsMigration(r.error) };
  return { rows: r.data || [] };
}
