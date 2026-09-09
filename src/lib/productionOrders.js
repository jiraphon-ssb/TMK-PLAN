/* ============================================================
   productionOrders.js — ใบสั่งผลิต (PO) · PART 113
   ============================================================
   - 1 ใบ = 1 แถว · รายการสั่งอยู่ใน items jsonb [{design,color,size,qty,received}]
   - "รับเข้า" ไม่สร้างสูตรที่สอง — แปลงเป็น "จุดอ้างอิงสต็อกใหม่" (ยอดคงเหลือ + ที่รับ) ณ วันที่รับ
     แล้วเขียนลง tmk_stock_counts เหมือนการนับ (ดู PART 112)
   ส่วน pure อยู่ไฟล์นี้ (มีเทส) · IO อยู่ท้ายไฟล์ (graceful ถ้ายังไม่ migrate)
   ============================================================ */
import { supabase } from './supabaseClient.js';
import { skuKey } from './stockCount.js';
import { needsMigration } from './pgError.js';
import { cachedFetchAll, invalidateSaleCache } from './saleData.js';

export const PO_MIGRATION = '20260824-production-orders.sql';
const PO_SEL = 'id,order_date,due_date,supplier,responsible,status,items,note,received_date,created_by,created_at,updated_at';

/** สถานะใบสั่ง — ลำดับ + สี + ป้ายไทย */
export const PO_STATUS = [
  { id: 'draft', label: 'ร่าง', tone: 'var(--ink-3)' },
  { id: 'ordered', label: 'สั่งแล้ว', tone: 'var(--info)' },
  { id: 'producing', label: 'กำลังผลิต', tone: 'var(--warn)' },
  { id: 'received', label: 'รับครบแล้ว', tone: 'var(--good)' },
  { id: 'cancelled', label: 'ยกเลิก', tone: 'var(--bad)' },
];
export const poStatusMeta = (id) => PO_STATUS.find(s => s.id === id) || PO_STATUS[1];
export const isPoOpen = (po) => po && po.status !== 'received' && po.status !== 'cancelled';

const num = (v) => Math.max(0, Math.round(Number(v) || 0));
const iso = (v) => String(v || '').slice(0, 10);

/** เลขใบสั่ง: PO-<ปีพ.ศ.2หลัก><เดือน><วัน>-<ลำดับของวันนั้น> */
export function nextPoId(existing, dateISO) {
  const d = iso(dateISO);
  const [y, m, dd] = d.split('-');
  const stamp = `${String(Number(y) + 543).slice(2)}${m}${dd}`;
  const prefix = `PO-${stamp}-`;
  const used = (existing || []).filter(p => String(p.id || '').startsWith(prefix))
    .map(p => Number(String(p.id).slice(prefix.length)) || 0);
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

/** สรุปจำนวนของใบสั่ง 1 ใบ */
export function poTotals(po) {
  const items = Array.isArray(po?.items) ? po.items : [];
  const qty = items.reduce((a, it) => a + num(it.qty), 0);
  const received = items.reduce((a, it) => a + num(it.received), 0);
  return { lines: items.length, qty, received, pending: Math.max(0, qty - received), pct: qty ? Math.round(received / qty * 100) : 0 };
}

/** รวมทุกใบ (ไว้โชว์หัวหน้า/กรองรายคน) */
export function poSummary(list) {
  const open = (list || []).filter(isPoOpen);
  const t = open.reduce((a, p) => { const x = poTotals(p); a.qty += x.qty; a.pending += x.pending; return a; }, { qty: 0, pending: 0 });
  return { open: open.length, all: (list || []).length, qty: t.qty, pending: t.pending };
}

/** ค้างรับต่อ SKU (ของที่กำลังจะเข้า) — ใช้โชว์คู่ยอดคงเหลือ */
export function incomingBySku(list) {
  const out = {};
  (list || []).filter(isPoOpen).forEach(po => {
    (Array.isArray(po.items) ? po.items : []).forEach(it => {
      const left = num(it.qty) - num(it.received);
      if (left <= 0) return;
      const k = skuKey(it.design, it.color, it.size);
      out[k] = (out[k] || 0) + left;
    });
  });
  return out;
}

/** รายชื่อผู้รับผิดชอบที่มีในระบบ (ไว้ทำตัวกรอง "แยกรายคน") */
export const poPeople = (list) => [...new Set((list || []).map(p => String(p.responsible || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));

/* buildReceiveAnchors() ถูกลบออก 2 ก.ย. 69 (PLAN-STOCK-V2 ระยะ 4)
   มันคำนวณ "คงเหลือปัจจุบัน + ที่รับ" ฝั่งเบราว์เซอร์แล้วเขียนเป็นหมุดใหม่
   = read-modify-write บนข้อมูลเงิน — หน้าจอค้าง/มีคนขายแทรก เมื่อไหร่เลขผิดถูกอบไว้ถาวร
   แทนที่ด้วย movesFromReceive() ใน lib/stockMoves.js ที่ลง "แถวบวก" ตรง ๆ ไม่ต้องอ่านคงเหลือ */


/* ---------------- IO ---------------- */
/* cache ร่วมกับหน้าอื่น (TTL 5 นาที) — หน้าหลักและหน้าสต็อกเรียกตัวนี้คนละที่
   ถ้าไม่ cache = ดึงทั้งตารางใหม่ทุกครั้งที่เข้าหน้าหลัก (สวนทางกับที่ตั้งใจลด egress)
   เรียงฝั่ง client เพราะ cachedFetchAll ไม่รับ order (ตารางเล็ก · ใบสั่งผลิตไม่กี่ร้อยแถว) */
export async function fetchPurchaseOrders(force = false) {
  try {
    const r = await cachedFetchAll('tmk_production_orders', PO_SEL, force);
    if (r?.error) return { rows: [], missing: needsMigration(r.error), error: r.error };
    const rows = [...(r?.data || [])].sort((a, b) => String(b.order_date || '').localeCompare(String(a.order_date || '')));
    return { rows, missing: false };
  } catch (e) { return { rows: [], missing: false, error: e }; }
}

/**
 * บันทึกใบสั่งผลิต
 * @param opts.isNew  true = ใบใหม่ (กันเลขซ้ำ: ถ้ามีเลขนี้แล้วให้เลื่อนเลขถัดไปอัตโนมัติ)
 *
 * กันชนกันสองแบบ (ทั้งคู่เกิดจริงเมื่อมีคนใช้พร้อมกัน):
 *  1) เลขใบซ้ำ — เลขสร้างจากลิสต์ในเครื่อง สองคนสร้างวันเดียวกันได้เลขเดียวกัน แล้ว upsert ทับใบแรก
 *  2) เซฟทับยอดรับเข้า — ใบที่เปิดค้างไว้ถือ items เก่า (received เดิม) พอกดเซฟจะย้อนยอดที่คนอื่นเพิ่งรับเข้า
 *     → อ่านแถวล่าสุดก่อนเขียน แล้ว "คงค่า received ที่มากกว่า" ไว้เสมอ
 */
export async function savePurchaseOrder(po, { isNew = false } = {}) {
  let id = String(po.id || '').trim();
  const items = (po.items || []).map(it => ({ design: String(it.design || '').trim(), color: it.color, size: it.size, qty: num(it.qty), received: num(it.received) }));

  const cur = await supabase.from('tmk_production_orders').select('id,items,status,received_date').eq('id', id).maybeSingle();
  if (cur.error && needsMigration(cur.error)) return { error: cur.error, missing: true };
  /* ⚠️ error อื่น (เน็ต/5xx/RLS) ต้องหยุด ไม่ใช่เดินต่อ — cur.data = null จะถูกตีความว่า "ไม่มีใบนี้"
     ทำให้ข้ามด่านทั้งสองที่ pre-read มีไว้:
       · isNew  → ไม่ rename เลขที่ชน → upsert ทับใบของคนอื่นทั้งใบ (items/ผู้รับผิดชอบ/received หายหมด)
       · แก้ใบ → ไม่คง received ที่มากกว่า → ย้อนยอดรับเข้าที่คนอื่นเพิ่งลงไปเป็น 0
     ทั้งคู่จบด้วย toast สีเขียว "บันทึกแล้ว" (กับดัก "อ่านไม่ได้ ≠ ไม่มีข้อมูล") */
  if (cur.error) return { error: cur.error, readFailed: true };

  if (isNew && cur.data) {
    // เลขชน — หาเลขว่างถัดไปจากของจริงในฐานข้อมูล (ไม่ใช่จากลิสต์ในเครื่อง)
    const prefix = id.slice(0, id.lastIndexOf('-') + 1);
    const all = await supabase.from('tmk_production_orders').select('id').like('id', `${prefix}%`);
    const used = (all.data || []).map(r => Number(String(r.id).slice(prefix.length)) || 0);
    id = `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`;
  } else if (!isNew && cur.data) {
    // แก้ใบเดิม — อย่าย้อนยอดที่รับเข้าไปแล้ว (เทียบทีละบรรทัดด้วย ลาย/สี/ไซซ์)
    const recvOf = new Map((cur.data.items || []).map(it => [skuKey(it.design, it.color, it.size), num(it.received)]));
    items.forEach(it => {
      const server = recvOf.get(skuKey(it.design, it.color, it.size));
      if (server != null && server > it.received) it.received = server;
    });
  }

  const row = {
    id, order_date: iso(po.order_date), due_date: iso(po.due_date), supplier: String(po.supplier || ''),
    responsible: String(po.responsible || ''), status: po.status || 'ordered',
    items,
    note: String(po.note || ''), received_date: iso(po.received_date), created_by: String(po.created_by || ''),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('tmk_production_orders').upsert(row, { onConflict: 'id' });
  if (error) return { error, missing: needsMigration(error) };
  invalidateSaleCache('tmk_production_orders');   // เซฟแล้วต้องเห็นทันที ไม่ค้าง cache
  return { row, renamedTo: id !== String(po.id || '').trim() ? id : null };
}

export async function deletePurchaseOrder(id) {
  const { error } = await supabase.from('tmk_production_orders').delete().eq('id', id);
  if (!error) invalidateSaleCache('tmk_production_orders');
  return { error, missing: needsMigration(error) };
}
