/* ============================================================
   stockMoves.js — สมุดเคลื่อนไหวสต็อก (PLAN-STOCK-V2 ระยะ 2) · pure ล้วน
   ============================================================
   คงเหลือ = หมุดนับล่าสุด + (รับเข้า/ปรับ หลังหมุด) − (ขาย หลังหมุด)
           = "ตั้งต้น + PO รับเข้า − Sale ขาย"  โดยการนับจริงรีเซ็ตทุกอย่างก่อนหน้า

   ต่างจากโมเดลเดิม (stockCount.stockBalance) ตรงที่:
   - การรับเข้าเป็น "แถวบวก" ไม่ใช่หมุดที่คำนวณฝั่งเบราว์เซอร์ (เดิม = คงเหลือ + ที่รับ
     ซึ่งเป็น read-modify-write บนข้อมูลเงิน — หน้าจอค้างเมื่อไหร่เลขผิดถูกอบไว้ถาวร)
   - มีประวัติครบ ตอบได้ว่า "ทำไมเหลือ 12"
   - รองรับ "นับตอนเช้าก่อนขาย" (eod=false) ที่โมเดลเดิมทำไม่ได้

   ⚠️ ยอดขายไม่เก็บเป็นแถว (kind='out') — คิดจาก tmk_mp_skus เหมือนเดิม
      เพราะออเดอร์ถูกแก้/ยกเลิก/re-import ตลอด เก็บซ้ำแล้วต้องคอยซิงก์ = เปราะ
   ============================================================ */
import { skuKey, normSizeStock } from './stockCount.js';

const num = (v) => Number(v) || 0;
const iso = (v) => String(v ?? '').slice(0, 10);
/* ============================================================
   ยกเลิกรอบ ในสมุดที่ลบแถวไม่ได้
   ============================================================
   tmk_stock_moves เป็น append-only จริง (revoke update, delete) → "ยกเลิกรอบ" = ลงแถวกลับ
   แถว kind='void' ชี้ ref_id ของรอบที่ต้องการยกเลิก แล้วตอนอ่านค่อยกรองทิ้งทั้งรอบ
   ใช้ได้ทั้งรอบนับ (ref_id = session_id) และการรับเข้าจาก PO (ref_id = po.id)
   ============================================================ */
const VOID_KIND = 'void';

/* คีย์ของ "งวด" — หน่วยที่เล็กที่สุดที่ยกเลิกได้
   ⚠️ ห้ามใช้ ref_id เฉย ๆ: การรับเข้าทุกงวดของ PO ใบเดียวกันใช้ ref_id เท่ากันหมด
      → ยกเลิก 1 งวด = ฆ่าทั้งใบทั้งอดีตและอนาคต (บั๊กจริง 7 ก.ย. 69: รับใหม่หลังยกเลิกแล้วของหายเงียบ)
   seq = จำนวนที่เคยรับมาแล้วก่อนงวดนี้ → แยกงวดในวันเดียวกันได้ด้วย */
export const roundId = (refType, refId, seq = 0) => `${refType}::${String(refId || '')}::${seq}`;

/* แถวเก่าที่บันทึกก่อนมีคอลัมน์ round_id → ถอดจาก id (moveId ขึ้นต้นด้วย refType::refId::seq เสมอ) */
const roundOf = (m) => {
  const r = String(m?.round_id || '').trim();
  if (r) return r;
  const parts = String(m?.id || '').split('::');
  if (parts.length >= 3) return parts.slice(0, 3).join('::');
  return roundId(m?.ref_type, m?.ref_id, 0);
};

/** ตัดงวดที่ถูกยกเลิกออก (และตัดแถว void เองด้วย) — ต้องเรียกก่อนคำนวณทุกครั้ง */
export function activeMoves(moves) {
  /* void 2 รูปแบบ — ความหมายต่างกัน ต้องแยกกันให้ชัด
       ใหม่ (8 ก.ย. 69+) ref_id = คีย์งวด 'po::PO-1::0'
         → ยกเลิก "งวดนั้น" เสมอ ไม่ว่าเขียนเมื่อไร (งวดคือหน่วยที่ระบุได้แน่นอน)
       เก่า (7 ก.ย. 69)  ref_id = po.id / session_id ดิบ 'PO-1'
         → ตอนนั้นมันหมายถึง "ยกเลิกสิ่งที่มีอยู่ ณ ตอนที่กด" (ยังไม่มีแนวคิดงวด)
           ⚠️ ห้ามตีความว่า "ทุกแถวของ ref นี้ตลอดกาล" — ไม่งั้นของที่รับเข้าทีหลัง
              จะถูกกลืนหายถาวร ซึ่งเป็นบั๊กเดิมที่ roundId ตั้งใจแก้ (เจอซ้ำ 8 ก.ย. รอบสอง:
              รับใหม่ 80 หลัง void → คงเหลือค้างที่ 100 แทนที่จะเป็น 180)
           → จำกัดด้วย created_at ของแถว void นั้น: กินเฉพาะของที่เกิดก่อนหน้า */
  const voidedRounds = new Set();
  const legacyVoids = [];
  for (const m of (moves || [])) {
    if (!m || m.kind !== VOID_KIND) continue;
    const id = String(m.ref_id || '');
    if (!id) continue;
    if (id.includes('::')) voidedRounds.add(id);
    else legacyVoids.push({ ref: id, at: String(m.created_at || '') });
  }
  if (!voidedRounds.size && !legacyVoids.length) return (moves || []).filter(m => m && m.kind !== VOID_KIND);
  return (moves || []).filter(m => {
    if (!m || m.kind === VOID_KIND) return false;
    if (voidedRounds.has(roundOf(m))) return false;
    const ref = String(m.ref_id || ''), at = String(m.created_at || '');
    return !legacyVoids.some(v => v.ref === ref && at < v.at);
  });
}

/** แถวยกเลิก "งวด" — ref_id เก็บ roundId · qty 0 · sku_key '*' (คอลัมน์ not null) */
export function voidMove({ roundId: rid, movedOn, by = '', note = '' }) {
  const key = String(rid || '');
  return {
    id: moveId(VOID_KIND, key, '*', movedOn, 0),
    sku_key: '*', product_code: '', design: '', color: '', size: '',
    kind: VOID_KIND, qty: 0, moved_on: movedOn, eod: true,
    ref_type: VOID_KIND, ref_id: key, round_id: moveId(VOID_KIND, key, '*', movedOn, 0),
    note, created_by: by,
  };
}

/* ชนิดที่ "ขยับยอด" ได้จริง — ต้อง allow-list ไม่ใช่ "อะไรก็ได้ที่ไม่ใช่หมุด"
   ไม่งั้นแถวที่ kind ว่าง/สะกดผิด/ชนิดใหม่ที่ยังไม่รองรับ จะถูกนับเป็นการเคลื่อนไหว
   แล้วสร้าง SKU ผี (design ว่าง) โผล่ในตารางคงเหลือ */
const MOVE_KINDS = new Set(['in', 'adjust', 'return']);
const ANCHOR_KINDS = new Set(['open', 'count']);   // หมุด = "ยอดที่นับได้จริง" → รีเซ็ตทุกอย่างก่อนหน้า

/* เคลื่อนไหวตัวนี้เกิด "หลังหมุด" ไหม → ต้องบวกเข้าคงเหลือ
   - คนละวัน: ตัดสินด้วยวันที่ล้วน · created_at ไม่เกี่ยว
     (นับของวันที่ 1 แต่มาคีย์วันที่ 3 → ของที่รับวันที่ 2 ยังต้องนับ ไม่ใช่หายไป)
   - วันเดียวกับหมุด: วันบอกอะไรไม่ได้ → ใช้ created_at ตัดสินว่านับก่อนหรือของมาก่อน
     ของมาก่อนนับ = การนับเห็นของแล้ว ห้ามบวกซ้ำ · นับก่อนของมา = ต้องบวก */
const isAfterAnchor = (m, anchor, from) => {
  const d = iso(m.moved_on);
  if (d !== from) return d > from;
  /* วันเดียวกัน: ต้องเป็น "หลังหมุดจริง ๆ" ถึงจะบวก — ใช้ > ไม่ใช่ >=
     เท่ากันเป๊ะเกิดได้จริง (insert ชุดเดียว · migration backfill ที่ now() เดียว)
     และแถวที่ไม่มี created_at จะได้ '' >= '' = true → บวกซ้ำทุกแถว
     เสมอกัน = ไม่รู้ว่าอันไหนก่อน → ถือว่าการนับเห็นของแล้ว (ฝั่งที่ปลอดภัยกว่า: ไม่บวกเกิน) */
  const a = String(anchor.created_at || ''), b = String(m.created_at || '');
  return !!b && !!a && b > a;
};

/** id ของ move — คำนวณได้ (deterministic) → กดซ้ำ/รัน migration ซ้ำ ไม่เกิดแถวซ้ำ */
export const moveId = (refType, refId, key, movedOn, seq = 0) =>
  `${refType}::${refId}::${seq}::${key}::${movedOn}`;

/**
 * คงเหลือรายตัว (SKU) จากสมุดเคลื่อนไหว
 * @param moves แถวจาก tmk_stock_moves
 * @param skus  แถวจาก tmk_mp_skus (กรองใบยกเลิกมาแล้ว)
 * @returns [{ key, design, color, size, productCode, counted, countDate, received, sold, balance }]
 */
export function balanceFromMoves(moves, skus) {
  const bySku = new Map();
  for (const m of activeMoves(moves)) {
    const key = m?.sku_key || skuKey(m?.design, m?.color, m?.size);
    if (!key) continue;
    (bySku.get(key) || bySku.set(key, []).get(key)).push(m);
  }

  const out = [];
  for (const [key, list] of bySku) {
    // หมุดล่าสุด: วันหลังสุดก่อน · วันเดียวกันใช้แถวที่บันทึกทีหลัง
    const anchors = list.filter(m => ANCHOR_KINDS.has(m.kind))
      .sort((a, b) => iso(a.moved_on).localeCompare(iso(b.moved_on))
        || String(a.created_at || '').localeCompare(String(b.created_at || '')));
    const anchor = anchors[anchors.length - 1];
    const moved = list.filter(m => MOVE_KINDS.has(m.kind));
    /* ไม่เคยนับเลย แต่มีของรับเข้าแล้ว → ต้องโชว์
       เดิม `continue` ทิ้งทั้งแถว: เปิด PO ลายใหม่ กดรับเข้า 100 ตัว → toast สำเร็จ สมุดมีแถว in
       แต่หน้าคงเหลือไม่มีลายนั้นเลย และช่อง "กำลังจะเข้า" ก็ 0 (วนบน rows ชุดเดียวกัน)
       = ของ 100 ตัวมองไม่เห็นจนกว่าจะมีคนไปนับ
       counted = null → UI แยก "ยังไม่นับ" ออกจาก "นับได้ 0" ได้ · ฐานคือของที่รับเข้าจริง */
    if (!anchor && !moved.length) continue;      // ไม่มีทั้งหมุดและการเคลื่อนไหว = ไม่มีอะไรให้โชว์

    const from = anchor ? iso(anchor.moved_on) : '';
    // เคลื่อนไหวหลังหมุด (รับเข้า/ปรับ/คืน) — วันเดียวกับหมุดถือว่าอยู่หลัง เพราะหมุดคือ "ยอดที่นับได้"
    // แล้วของที่รับเข้าวันเดียวกันหลังนับ ต้องบวกเพิ่ม · ไม่มีหมุด = นับทุกแถว
    const received = (anchor ? moved.filter(m => isAfterAnchor(m, anchor, from)) : moved)
      .reduce((a, m) => a + num(m.qty), 0);

    const g = anchor || moved[0];
    out.push({
      key,
      design: g.design || '', color: g.color || '', size: g.size || '',
      productCode: g.product_code || '',
      counted: anchor ? num(anchor.qty) : null,
      countDate: from,
      eod: anchor ? anchor.eod !== false : true,
      // ไม่มีหมุด → หักเฉพาะยอดขายหลังวันที่ของเข้าครั้งแรก (ก่อนหน้านั้นของยังไม่มา)
      soldFrom: anchor ? null : moved.map(m => iso(m.moved_on)).sort()[0],
      received, sold: 0, balance: 0,
    });
  }

  // ยอดขายหลังหมุดของแต่ละ SKU (eod=true → ยอดวันที่นับรวมอยู่แล้ว · eod=false → ต้องหักด้วย)
  const idx = new Map(out.map(r => [r.key, r]));
  for (const s of (skus || [])) {
    const key = skuKey(s?.design, s?.color, normSizeStock(s?.size));
    const r = idx.get(key); if (!r) continue;
    const d = iso(s.order_date); if (!d) continue;
    if (r.countDate) { if (r.eod ? d <= r.countDate : d < r.countDate) continue; }
    else if (r.soldFrom && d < r.soldFrom) continue;   // ยังไม่เคยนับ → หักเฉพาะที่ขายหลังของเข้า
    r.sold += num(s.qty);
  }
  // ติดลบปล่อยติดลบ — ติดลบ = นับตกหรือขายซ้ำ ต้องรู้ ไม่ใช่ปัดเป็น 0 ให้ดูสวย
  out.forEach(r => { r.balance = (r.counted || 0) + r.received - r.sold; });
  return out.sort((a, b) => a.design.localeCompare(b.design, 'th') || a.color.localeCompare(b.color, 'th'));
}

/**
 * แปลง "รับเข้าจากใบสั่งผลิต" เป็นแถว move (kind='in')
 * ต่างจาก buildReceiveAnchors เดิมตรงที่ **ไม่อ่านคงเหลือปัจจุบันมาบวก** → ไม่มี read-modify-write
 * @param seq ลำดับการรับของ PO ใบนั้น (รับหลายรอบวันเดียวกันต้องไม่ชน id กัน)
 */
export function movesFromReceive({ lines, poId, movedOn, by = '', note = '', seq = 0 }) {
  return (lines || []).map(l => {
    const design = String(l?.design || '').trim();
    const color = String(l?.color || '').trim();
    const size = normSizeStock(l?.size);
    const qty = Math.round(num(l?.qty));
    if (!design || !color || !size || qty <= 0) return null;
    const key = skuKey(design, color, size);
    return {
      id: moveId('po', poId, key, movedOn, seq),
      round_id: roundId('po', poId, seq),
      sku_key: key, product_code: l.productCode || '',
      design, color, size,
      kind: 'in', qty, moved_on: movedOn, eod: true,
      ref_type: 'po', ref_id: String(poId || ''),
      note, created_by: by,
    };
  }).filter(Boolean);
}

/** แปลงรอบนับ/นำเข้าตั้งต้น เป็นแถว move (kind='open'|'count') */
export function movesFromCount({ rows, countDate, kind = 'count', sessionId, by = '', note = '', eod = true }) {
  return (rows || []).map(r => {
    const design = String(r?.design || '').trim();
    const color = String(r?.color || '').trim();
    const size = normSizeStock(r?.size);
    if (!design || !color || !size) return null;
    const key = skuKey(design, color, size);
    return {
      id: moveId('count', sessionId, key, countDate, 0),
      round_id: roundId('count', sessionId, 0),
      sku_key: key, product_code: r.productCode || '',
      design, color, size,
      kind: ANCHOR_KINDS.has(kind) ? kind : 'count',
      qty: Math.max(0, Math.round(num(r.qty))),
      moved_on: countDate, eod: eod !== false,
      ref_type: 'count', ref_id: String(sessionId || ''),
      note, created_by: by,
    };
  }).filter(Boolean);
}

/**
 * ไทม์ไลน์ของ SKU เดียว — ตอบให้ได้ว่า "ทำไมเหลือ N"
 * รวมการเคลื่อนไหว (หมุด/รับเข้า/ปรับ) กับยอดขาย (จาก tmk_mp_skus) เป็นรายการเดียว
 * ตัดทุกอย่างก่อนหมุดนับล่าสุดออก เพราะหมุดคือ "ความจริงที่รีเซ็ตทุกอย่างก่อนหน้า"
 * @returns [{ on, kind, qty, running, ref_type, ref_id, note, by }]  qty มีเครื่องหมาย
 */
export function skuLedger(key, moves, skus) {
  const mine = activeMoves(moves).filter(m => (m?.sku_key || skuKey(m?.design, m?.color, m?.size)) === key);
  const anchors = mine.filter(m => ANCHOR_KINDS.has(m.kind))
    .sort((a, b) => iso(a.moved_on).localeCompare(iso(b.moved_on))
      || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const anchor = anchors[anchors.length - 1];
  const moved = mine.filter(m => MOVE_KINDS.has(m.kind));
  /* ไม่มีหมุดแต่มีของรับเข้า → ต้องตอบได้ว่า "ทำไมเหลือ N"
     balanceFromMoves โชว์ SKU แบบนี้แล้ว (counted = null) ถ้าตรงนี้คืน [] จะกลายเป็น
     "ตารางมีเลข 92 แต่กดดูประวัติได้ 0 รายการ" = ตอบไม่ได้ ซึ่งเป็นเหตุผลทั้งหมดที่มีสมุดนี้ */
  if (!anchor && !moved.length) return [];      // ไม่มีอะไรเลย = ไม่มีฐานจริง ๆ

  const from = anchor ? iso(anchor.moved_on) : '';
  const eod = anchor ? anchor.eod !== false : true;
  const soldFrom = anchor ? '' : moved.map(m => iso(m.moved_on)).sort()[0];
  const items = anchor ? [{
    on: from, kind: anchor.kind, qty: num(anchor.qty),
    ref_type: anchor.ref_type || 'count', ref_id: anchor.ref_id || '',
    note: anchor.note || '', by: anchor.created_by || '',
  }] : [];

  (anchor ? moved.filter(m => isAfterAnchor(m, anchor, from)) : moved)
    .forEach(m => items.push({
      on: iso(m.moved_on), kind: m.kind, qty: num(m.qty),
      ref_type: m.ref_type || 'manual', ref_id: m.ref_id || '',
      note: m.note || '', by: m.created_by || '',
    }));

  // ยอดขายรวมต่อวัน (ไม่แตกรายใบ — ไทม์ไลน์อ่านง่ายกว่า และตรงกับวิธีคิดคงเหลือ)
  const soldByDay = {};
  (skus || []).forEach(s => {
    if (skuKey(s?.design, s?.color, normSizeStock(s?.size)) !== key) return;
    const d = iso(s.order_date); if (!d) return;
    if (anchor) { if (eod ? d <= from : d < from) return; }
    else if (soldFrom && d < soldFrom) return;   // ยังไม่เคยนับ → นับเฉพาะที่ขายหลังของเข้าครั้งแรก
    soldByDay[d] = (soldByDay[d] || 0) + num(s.qty);
  });
  Object.entries(soldByDay).forEach(([d, q]) => {
    if (q > 0) items.push({ on: d, kind: 'out', qty: -q, ref_type: 'order', ref_id: '', note: '', by: '' });
  });

  // หมุดต้องมาก่อนเสมอในวันเดียวกัน (มันคือจุดตั้งต้น) · ที่เหลือเรียงตามวัน
  const rank = (x) => (ANCHOR_KINDS.has(x.kind) ? 0 : 1);
  items.sort((a, b) => a.on.localeCompare(b.on) || rank(a) - rank(b));
  let run = 0;
  return items.map(x => { run += x.qty; return { ...x, running: run }; });
}

/**
 * ประวัติ "รอบ" จากสมุดเคลื่อนไหว — รวมตาม ref_id (รอบนับ 1 รอบ / ใบสั่งผลิต 1 การรับ)
 * แทน sessionsOf() ที่อ่านจาก tmk_stock_counts (PLAN-STOCK-V2 ระยะ 4)
 * ต่างจากของเดิม: **การรับเข้าจาก PO ก็โผล่ในประวัติด้วย** (เดิมถูกกลบเป็น "รอบนับ" ธรรมดา)
 */
export function sessionsFromMoves(moves) {
  const m = new Map();
  activeMoves(moves).forEach(x => {
    const id = x?.ref_id || x?.id || '';
    if (!id) return;
    // group ตาม "งวด" — เดิมใช้ ${kind}::${ref_id} ทำให้ PO ที่รับหลายงวดยุบเป็นแถวเดียว
    // (qty รวมกัน · วันที่เป็นของงวดแรก · และยกเลิกทีเดียวหมดทั้งใบ)
    const key = roundOf(x);
    const g = m.get(key) || {
      sessionId: id, roundId: roundOf(x), kind: x.kind, refType: x.ref_type || 'manual',
      date: iso(x.moved_on), by: x.created_by || '', note: x.note || '',
      rows: 0, qty: 0, at: x.created_at || '',
    };
    g.rows += 1; g.qty += num(x.qty);
    if (String(x.created_at || '') > String(g.at || '')) g.at = x.created_at;
    m.set(key, g);
  });
  return [...m.values()].sort((a, b) =>
    String(b.date).localeCompare(String(a.date)) || String(b.at).localeCompare(String(a.at)));
}
