/* ============================================================
   stockCount.js — สต็อกตั้งต้น + นับสต็อก (PART 112 · เฟส 1)
   ============================================================
   สูตรเดียวของทั้งระบบ:
     คงเหลือ(SKU) = จำนวนที่นับได้ครั้งล่าสุด − จำนวนที่ขายไป "หลังวันที่นับนั้น"
   - "การนับ" = จุดอ้างอิง (anchor) แบบ absolute ณ วันหนึ่ง (ไม่ใช่ยอดบวก/ลบ)
   - ของออกไม่เก็บลงตาราง — คิดสดจาก tmk_mp_skus (ตัดใบยกเลิกที่ชั้นบนแล้ว)
     → ยกเลิกใบเสร็จ = ของกลับเข้าสต็อกเอง · นับใหม่ = ทับ anchor เดิม
   ส่วนนี้ pure ล้วน (มีเทสคู่) — IO อยู่ใน stockData.js
   ============================================================ */
import { normColor, normSize, sizeRank } from './saleAgg.js';

/**
 * ไซซ์ฝั่งสต็อก — แปลง XXL/XXXL ที่คนพิมพ์ในไฟล์ Excel ให้เป็น 2XL/3XL ก่อน
 * (normSize กลางไม่แปลงให้ เพราะข้อมูลขายเก็บเป็น 2XL อยู่แล้ว · ถ้าไม่แปลงตรงนี้
 *  ไฟล์ที่เขียน XXL จะกลายเป็น SKU คนละตัวกับที่ขาย → หักสต็อกไม่ตรงตลอดกาล)
 */
export function normSizeStock(size) {
  const t = String(size || '').toUpperCase().replace(/ไซส์|ไซซ์/g, '').trim();
  const m = t.match(/^(X{2,7})L$/);                       // XXL=2XL · XXXL=3XL …
  if (m) return `${m[1].length}XL`;
  if (/^(F|FREE|ฟรีไซส์|ฟรีไซซ์)$/i.test(t)) return 'ฟรีไซส์';
  return normSize(t);
}

/** คีย์ SKU มาตรฐาน — normalize ทั้ง 3 ส่วน กันสี/ไซซ์สะกดต่างกลายเป็นคนละตัว */
export const skuKey = (design, color, size) =>
  `${String(design || '').trim()}||${normColor(color)}||${normSizeStock(size)}`;
export const splitKey = (key) => { const [design, color, size] = String(key || '').split('||'); return { design, color, size }; };

const num = (v) => Math.round(Number(v) || 0);
const iso = (v) => String(v || '').slice(0, 10);

/**
 * anchor ล่าสุดต่อ SKU (นับครั้งหลังสุดชนะ · วันเดียวกันเอาแถวที่บันทึกทีหลัง)
 * @returns { [key]: { qty, date, kind, session_id } }
 */
export function latestAnchors(counts) {
  const m = {};
  (counts || []).forEach(c => {
    const key = skuKey(c.design, c.color, c.size);
    const d = iso(c.count_date);
    if (!d) return;
    const cur = m[key];
    const newer = !cur || d > cur.date || (d === cur.date && String(c.created_at || '') >= String(cur.created_at || ''));
    if (newer) m[key] = { qty: num(c.qty), date: d, kind: c.kind || 'count', session_id: c.session_id || '', created_at: c.created_at || '', product_code: c.product_code || '' };
  });
  return m;
}

/**
 * จำนวนที่ขายไป "หลังวันที่ X" ต่อ SKU — ใช้หักออกจาก anchor
 * @param skus แถวจาก tmk_mp_skus (design/color/size/qty/order_date) ที่กรองใบยกเลิกแล้ว
 * @param afterByKey { key: 'YYYY-MM-DD' } วันที่นับของแต่ละ SKU
 */
export function soldAfter(skus, afterByKey) {
  const out = {};
  (skus || []).forEach(s => {
    const key = skuKey(s.design, s.color, s.size);
    const after = afterByKey[key];
    if (!after) return;                       // ไม่เคยนับ → ไม่รู้ฐาน ไม่คิดคงเหลือ
    const d = iso(s.order_date);
    if (!d || d <= after) return;             // ขายก่อน/วันเดียวกับวันนับ = รวมอยู่ในยอดที่นับแล้ว
    out[key] = (out[key] || 0) + num(s.qty);
  });
  return out;
}

/**
 * ยอดคงเหลือรายตัว (SKU) — เฉพาะ SKU ที่เคยนับ
 * @returns [{ key, design, color, size, counted, countDate, kind, sold, balance, productCode }]
 */
export function stockBalance(counts, skus) {
  const anchors = latestAnchors(counts);
  const afterByKey = Object.fromEntries(Object.entries(anchors).map(([k, a]) => [k, a.date]));
  const sold = soldAfter(skus, afterByKey);
  return Object.entries(anchors).map(([key, a]) => {
    const { design, color, size } = splitKey(key);
    const s = sold[key] || 0;
    return { key, design, color, size, counted: a.qty, countDate: a.date, kind: a.kind, productCode: a.product_code, sold: s, balance: a.qty - s };
  }).sort((x, y) => x.design.localeCompare(y.design, 'th') || x.color.localeCompare(y.color, 'th') || sizeRank(x.size) - sizeRank(y.size));
}

/** รวมยอดคงเหลือเป็นรายลาย (สำหรับตารางหน้าแรก) */
export function stockByDesign(rows) {
  const m = new Map();
  (rows || []).forEach(r => {
    const g = m.get(r.design) || { design: r.design, productCode: r.productCode || '', balance: 0, counted: 0, sold: 0, skus: 0, colors: new Set(), lastCount: '', negative: 0 };
    // counted อาจเป็น null (SKU ที่มีของรับเข้าแล้วแต่ยังไม่เคยนับ — ดู balanceFromMoves)
    g.balance += Number(r.balance) || 0; g.counted += Number(r.counted) || 0; g.sold += Number(r.sold) || 0; g.skus += 1;
    if (r.counted != null) g.everCounted = true;
    if (r.color) g.colors.add(r.color);
    if (!g.lastCount || r.countDate > g.lastCount) g.lastCount = r.countDate;
    if (r.balance < 0) g.negative += 1;
    if (!g.productCode && r.productCode) g.productCode = r.productCode;
    m.set(r.design, g);
  });
  return [...m.values()].map(g => ({ ...g, colors: g.colors.size, everCounted: !!g.everCounted })).sort((a, b) => b.balance - a.balance);
}

/** กริด สี × ไซซ์ ของลายเดียว (ใช้ทั้งหน้าคงเหลือและโหมดนับ) */
export function designGrid(rows, design) {
  const list = (rows || []).filter(r => r.design === design);
  const colors = [...new Set(list.map(r => r.color))].sort((a, b) => a.localeCompare(b, 'th'));
  const sizes = [...new Set(list.map(r => r.size))].sort((a, b) => sizeRank(a) - sizeRank(b));
  const cell = {};
  list.forEach(r => { (cell[r.color] || (cell[r.color] = {}))[r.size] = r; });
  return { colors, sizes, cell };
}

/**
 * ลายที่ "ขายจริง" — คุมสต็อกเฉพาะลายพวกนี้ (user: บางลายเลิกขาย/หมดไปแล้ว)
 * @param days จำนวนวันย้อนหลัง (0 = ทั้งหมด)
 * @returns [{ design, qty, orders, lastSold }] เรียงขายเยอะ→น้อย
 */
export function activeDesigns(skus, { days = 90, today } = {}) {
  const cut = days > 0 && today ? addDays(today, -days) : '';
  const m = new Map();
  (skus || []).forEach(s => {
    const d = String(s.design || '').trim();
    if (!d) return;
    const dt = iso(s.order_date);
    if (cut && dt && dt < cut) return;
    const g = m.get(d) || { design: d, qty: 0, orders: new Set(), lastSold: '' };
    g.qty += num(s.qty); if (s.order_no) g.orders.add(s.order_no);
    if (dt > g.lastSold) g.lastSold = dt;
    m.set(d, g);
  });
  return [...m.values()].map(g => ({ ...g, orders: g.orders.size })).sort((a, b) => b.qty - a.qty);
}

export function addDays(fromISO, days) {
  const d = new Date(`${iso(fromISO)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + (Number(days) || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ============================================================
   อ่านไฟล์ตั้งต้น (Excel/CSV/วางจากคลิปบอร์ด) → แถว { design, color, size, qty }
   ============================================================
   รองรับ 2 รูปแบบที่คนทำไฟล์สต็อกใช้จริง:
   (ก) คอลัมน์ยาว : หัวตารางมีคำว่า ลาย/สินค้า · สี · ไซซ์/ขนาด · จำนวน/คงเหลือ
   (ข) ตารางไขว้  : แถว = สี · คอลัมน์ = ไซซ์ (XS..7XL) · ชื่อลายอยู่บรรทัดหัวบล็อก หรือคอลัมน์แรก
   ============================================================ */
const HEAD_DESIGN = /(ลาย|แบบ|สินค้า|ชื่อ|design|product|item)/i;
const HEAD_COLOR = /(^สี$|สี|color)/i;
const HEAD_SIZE = /(ไซ|ขนาด|size)/i;
const HEAD_QTY = /(จำนวน|คงเหลือ|ยอด|qty|stock|total|amount|ชิ้น|ตัว)/i;
const SIZE_TOKEN = /^(xs|s|m|l|xl|2xl|3xl|4xl|5xl|6xl|7xl|xxl|xxxl)$/i;

const cellStr = (v) => String(v ?? '').trim();
const cellNum = (v) => {
  const t = String(v ?? '').replace(/[,\s]/g, '');
  if (t === '') return null;                       // ช่องว่าง ≠ 0 (ไม่งั้นแถว "หัวบล็อกชื่อลาย" จะถูกมองเป็นแถวข้อมูล)
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** แปลงข้อความที่วางจากคลิปบอร์ด (TSV/CSV) → grid 2 มิติ */
export function pasteToGrid(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  const sep = lines.some(l => l.includes('\t')) ? '\t' : ',';
  return lines.map(l => l.split(sep).map(c => c.trim()));
}

/** ตรวจว่ากริดเป็นรูปแบบไหน → { mode:'long'|'matrix', headerRow, cols } */
export function detectLayout(grid) {
  const rows = grid || [];
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = (rows[i] || []).map(cellStr);
    if (!cells.some(Boolean)) continue;
    const iDesign = cells.findIndex(c => HEAD_DESIGN.test(c));
    const iColor = cells.findIndex(c => HEAD_COLOR.test(c));
    const iSize = cells.findIndex(c => HEAD_SIZE.test(c));
    const iQty = cells.findIndex(c => HEAD_QTY.test(c));
    if (iColor >= 0 && iSize >= 0 && iQty >= 0) return { mode: 'long', headerRow: i, cols: { design: iDesign, color: iColor, size: iSize, qty: iQty } };
    // ตารางไขว้: แถวหัวมีชื่อไซซ์ ≥ 2 ช่อง
    const sizeCols = cells.map((c, j) => (SIZE_TOKEN.test(c) ? j : -1)).filter(j => j >= 0);
    if (sizeCols.length >= 2) return { mode: 'matrix', headerRow: i, cols: { sizes: sizeCols.map(j => ({ j, size: normSizeStock(cells[j]) })), design: iDesign, color: iColor >= 0 ? iColor : 0 } };
  }
  return { mode: 'unknown', headerRow: -1, cols: null };
}

/**
 * แปลงกริด → แถวสต็อก + รายการที่อ่านไม่ได้
 * @param fallbackDesign ใช้เมื่อไฟล์ไม่มีคอลัมน์ลาย (เช่นไฟล์ของลายเดียว)
 * @returns { rows:[{design,color,size,qty}], skipped:[{row, reason}], layout }
 */
export function parseStockGrid(grid, { fallbackDesign = '' } = {}) {
  const layout = detectLayout(grid);
  const rows = [], skipped = [];
  if (layout.mode === 'unknown') return { rows, skipped: [{ row: 0, reason: 'อ่านหัวตารางไม่ออก — ต้องมีคอลัมน์ สี/ไซซ์/จำนวน หรือหัวคอลัมน์เป็นชื่อไซซ์' }], layout };

  if (layout.mode === 'long') {
    const { design: dCol, color: cCol, size: sCol, qty: qCol } = layout.cols;
    let lastDesign = fallbackDesign;
    for (let i = layout.headerRow + 1; i < grid.length; i++) {
      const r = grid[i] || [];
      const design = (dCol >= 0 ? cellStr(r[dCol]) : '') || lastDesign;
      if (dCol >= 0 && cellStr(r[dCol])) lastDesign = cellStr(r[dCol]);   // ไฟล์ที่เว้นชื่อลายไว้แถวแรกแถวเดียว
      const color = cellStr(r[cCol]), size = cellStr(r[sCol]), qty = cellNum(r[qCol]);
      if (!color && !size && qty == null) continue;                        // แถวว่าง
      if (!design) { skipped.push({ row: i + 1, reason: 'ไม่รู้ว่าเป็นลายอะไร' }); continue; }
      if (!color || !size) { skipped.push({ row: i + 1, reason: 'ไม่มีสีหรือไซซ์' }); continue; }
      if (qty == null) { skipped.push({ row: i + 1, reason: 'จำนวนไม่ใช่ตัวเลข' }); continue; }
      rows.push({ design, color: normColor(color), size: normSizeStock(size), qty: Math.max(0, qty) });
    }
    return { rows, skipped, layout };
  }

  // matrix: แถว = สี · คอลัมน์ = ไซซ์ · ชื่อลาย = คอลัมน์ลาย หรือแถวหัวบล็อก (แถวที่มีข้อความเดียวโดดๆ)
  const { sizes, design: dCol, color: cCol } = layout.cols;
  let curDesign = fallbackDesign;
  // ไฟล์ส่วนใหญ่เขียนชื่อลายไว้ "เหนือ" แถวหัวตาราง (บล็อกแรก) → มองย้อนขึ้นไปหาบรรทัดที่มีข้อความเดียวโดดๆ
  for (let i = layout.headerRow - 1; i >= 0 && !curDesign; i--) {
    const filled = (grid[i] || []).map(cellStr).filter(Boolean);
    if (filled.length === 1) curDesign = filled[0];
  }
  for (let i = layout.headerRow + 1; i < grid.length; i++) {
    const r = (grid[i] || []).map(cellStr);
    if (!r.some(Boolean)) continue;
    const filled = r.filter(Boolean);
    const anyQty = sizes.some(({ j }) => cellNum(r[j]) != null);
    if (!anyQty && filled.length === 1) { curDesign = filled[0]; continue; }        // บรรทัดหัวบล็อก = ชื่อลาย
    if (dCol >= 0 && cellStr(r[dCol])) curDesign = cellStr(r[dCol]);
    const color = cellStr(r[cCol]);
    if (!color) { skipped.push({ row: i + 1, reason: 'ไม่มีชื่อสีในแถว' }); continue; }
    if (!curDesign) { skipped.push({ row: i + 1, reason: 'ไม่รู้ว่าเป็นลายอะไร' }); continue; }
    sizes.forEach(({ j, size }) => {
      const q = cellNum(r[j]);
      if (q == null || q === 0) return;
      rows.push({ design: curDesign, color: normColor(color), size, qty: Math.max(0, q) });
    });
  }
  return { rows, skipped, layout };
}

/** รวมแถวซ้ำ (ลาย+สี+ไซซ์เดียวกันในไฟล์) — บวกกัน กันข้อมูลหาย */
export function mergeStockRows(rows) {
  const m = new Map();
  (rows || []).forEach(r => {
    const k = skuKey(r.design, r.color, r.size);
    m.set(k, (m.get(k) || 0) + num(r.qty));
  });
  return [...m.entries()].map(([k, qty]) => ({ ...splitKey(k), qty }));
}

/**
 * จับคู่ชื่อลายในไฟล์กับแคตตาล็อก — คืนชื่อ/รหัสมาตรฐาน + รายการที่จับไม่ได้
 * @param resolve ฟังก์ชัน (text) => { name, code } | null (ส่ง resolveDesign จาก shirtCatalog เข้ามา)
 */
export function matchDesigns(rows, resolve) {
  const out = [], unmatched = new Map();
  (rows || []).forEach(r => {
    const hit = resolve ? resolve(r.design) : null;
    if (hit && hit.name) out.push({ ...r, design: hit.name, productCode: hit.code || '' });
    else { out.push({ ...r, productCode: '' }); unmatched.set(r.design, (unmatched.get(r.design) || 0) + 1); }
  });
  return { rows: out, unmatched: [...unmatched.entries()].map(([design, n]) => ({ design, rows: n })) };
}

/* ============================================================
   รายงานผลต่างของ "รอบนับ" (PART 115)
   ============================================================
   ตอนนับเสร็จเราเห็นผลต่างสด ๆ ในฟอร์ม แต่พอปิดฟอร์มไปแล้วย้อนดูไม่ได้เลย
   → ฟังก์ชันนี้คำนวณย้อนหลังว่า "ตอนนั้นระบบคิดเท่าไร" แล้วเทียบกับที่นับได้
     ระบบคิด ณ วันนับ = anchor ก่อนหน้าของ SKU นั้น − ที่ขายไประหว่าง (วัน anchor เก่า, วันนับ]
     ไม่มี anchor ก่อนหน้า = นับครั้งแรกของ SKU นั้น (ไม่มีผลต่างให้เทียบ)
   ============================================================ */

/** แถวทั้งหมดของรอบนับหนึ่ง */
export function sessionRows(counts, sessionId) {
  return (counts || []).filter(c => String(c.session_id) === String(sessionId));
}

/* ดัชนีสำหรับคิดผลต่าง — สร้างครั้งเดียวแล้วใช้ซ้ำทุกแถว/ทุกรอบ
   (เวอร์ชันแรกวนทั้ง counts และ skus ต่อ 1 แถว = O(rows × counts) + O(rows × skus)
    วัดจริงที่ขนาด 1,920 SKU × 12 รอบ × ยอดขาย 8,000 บรรทัด = 16 วิ/รอบ · ทั้งตาราง 195 วิ → แท็บค้าง) */
function buildStockIndex(counts, skus) {
  const countsByKey = new Map();
  (counts || []).forEach(c => {
    const key = skuKey(c.design, c.color, c.size);
    const d = iso(c.count_date);
    if (!d) return;
    const list = countsByKey.get(key) || [];
    list.push({ d, at: String(c.created_at || ''), qty: num(c.qty), session: String(c.session_id) });
    countsByKey.set(key, list);
  });
  countsByKey.forEach(list => list.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.at < b.at ? -1 : a.at > b.at ? 1 : 0)));

  const salesByKey = new Map();
  (skus || []).forEach(s2 => {
    const d = iso(s2.order_date);
    if (!d) return;
    const key = skuKey(s2.design, s2.color, s2.size);
    const list = salesByKey.get(key) || [];
    list.push({ d, qty: num(s2.qty) });
    salesByKey.set(key, list);
  });
  return { countsByKey, salesByKey };
}

/** ที่ขายไปในช่วง (afterISO, untilISO] ของ SKU เดียว */
function soldBetween(salesByKey, key, afterISO, untilISO) {
  const list = salesByKey.get(key);
  if (!list) return 0;
  let sum = 0;
  for (let i = 0; i < list.length; i++) {
    const d = list[i].d;
    if (d > afterISO && d <= untilISO) sum += list[i].qty;
  }
  return sum;
}

function totalsOf(rows) {
  const cmp = rows.filter(r => !r.first);
  return {
    skus: rows.length,
    counted: rows.reduce((a, r) => a + r.counted, 0),
    system: cmp.reduce((a, r) => a + r.system, 0),
    diff: cmp.reduce((a, r) => a + r.diff, 0),
    plus: cmp.filter(r => r.diff > 0).length,
    minus: cmp.filter(r => r.diff < 0).length,
    match: cmp.filter(r => r.diff === 0).length,
    first: rows.length - cmp.length,
  };
}

/** คิดผลต่างของ 1 รอบจากดัชนีที่สร้างไว้แล้ว (ภายใน) */
function varianceFromIndex(rows, sessionId, idx) {
  const out = rows.map(r => {
    const key = skuKey(r.design, r.color, r.size);
    const d = iso(r.count_date);
    const at = String(r.created_at || '');
    // anchor ก่อนหน้า = การนับของ SKU เดียวกัน ที่ไม่ใช่รอบนี้ และไม่ใหม่กว่าแถวนี้ (list เรียงเวลาแล้ว → เดินถอยหลังเจอตัวแรกคือคำตอบ)
    const list = idx.countsByKey.get(key) || [];
    let prev = null;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      if (c.session === String(sessionId)) continue;
      if (c.d > d || (c.d === d && c.at > at)) continue;
      prev = c; break;
    }
    const counted = num(r.qty);
    if (!prev) return { key, design: r.design, color: r.color, size: r.size, counted, system: null, diff: null, first: true };
    const sold = soldBetween(idx.salesByKey, key, prev.d, d);
    const system = prev.qty - sold;
    return { key, design: r.design, color: r.color, size: r.size, counted, system, diff: counted - system, first: false, prevQty: prev.qty, prevDate: prev.d, sold };
  }).sort((a, b) => Math.abs(b.diff || 0) - Math.abs(a.diff || 0) || String(a.design).localeCompare(String(b.design), 'th'));
  return { rows: out, totals: totalsOf(out) };
}

/**
 * ผลต่างของรอบนับ — คืนรายแถว + ยอดรวม
 * @returns { rows:[{key,design,color,size,counted,system,diff,first}], totals:{...} }
 */
export function sessionVariance(counts, skus, sessionId) {
  const rows = sessionRows(counts, sessionId);
  if (!rows.length) return { rows: [], totals: totalsOf([]) };
  return varianceFromIndex(rows, sessionId, buildStockIndex(counts, skus));
}

/**
 * ยอดรวมผลต่างของ "ทุกรอบ" ในครั้งเดียว — ตารางประวัติต้องใช้ทุกแถว
 * (เรียก sessionVariance ทีละรอบ = สร้างดัชนีใหม่ทุกครั้ง → ช้าเป็นทวีคูณ)
 * @returns { [sessionId]: totals }
 */
export function allSessionTotals(counts, skus) {
  const idx = buildStockIndex(counts, skus);
  const bySession = new Map();
  (counts || []).forEach(c => {
    const id = String(c.session_id);
    const list = bySession.get(id) || [];
    list.push(c); bySession.set(id, list);
  });
  const out = {};
  bySession.forEach((rows, id) => { out[id] = varianceFromIndex(rows, id, idx).totals; });
  return out;
}

/**
 * ยอด "ที่นับได้ล่าสุด" รวมต่อลาย — ใช้ในหน้าสินค้า (ไม่หักยอดขายหลังวันนับ)
 * จงใจไม่คิดคงเหลือสด: หน้าสินค้าจะได้ไม่ต้องดึงตารางยอดขายมาทั้งก้อน (egress)
 * → ป้ายในหน้าสินค้าต้องระบุ "วันที่นับ" เสมอ ไม่งั้นกลายเป็นตัวเลขที่อ้างว่าเป็นปัจจุบัน
 */
export function countedByDesign(counts) {
  const anchors = latestAnchors(counts);
  const m = {};
  Object.entries(anchors).forEach(([key, a]) => {
    const { design } = splitKey(key);
    if (!design) return;
    const g = m[design] || { qty: 0, skus: 0, date: '' };
    g.qty += num(a.qty); g.skus += 1;
    if (a.date > g.date) g.date = a.date;
    m[design] = g;
  });
  return m;
}

/**
 * ตัดบรรทัดสินค้าของ "ใบที่ยกเลิก" ออกก่อนเอาไปหักสต็อก
 * ⚠️ soldAfter รับเฉพาะข้อมูลที่ตัดใบยกเลิกแล้ว — ยกเลิกออเดอร์มาร์เก็ตเพลส/กรอกมือ
 *    แค่ตั้ง status ไม่ได้ลบบรรทัด (มีแต่ voidReceipts ที่ลบจริง และเฉพาะ shipnity)
 * คีย์เทียบ = source:order_no เพราะตาราง sku ใช้ร่วมทุกช่องทาง และเลขออเดอร์ซ้ำข้ามช่องทางได้
 * (แถวเก่าที่ไม่มี source → ถอยไปเทียบด้วยเลขออเดอร์ล้วน กันของเก่าหลุด)
 */
export function excludeCancelled(skus, orders) {
  const list = skus || [];
  const cancelled = new Set();
  const cancelledNoSrc = new Set();
  (orders || []).forEach(o => {
    if (String(o?.status || '').trim().toLowerCase() !== 'cancelled') return;
    const no = String(o?.order_no || '');
    if (!no) return;
    const src = String(o?.source || '').trim();
    if (src) cancelled.add(`${src}::${no}`); else cancelledNoSrc.add(no);
  });
  if (!cancelled.size && !cancelledNoSrc.size) return list;
  return list.filter(s => {
    const no = String(s?.order_no || '');
    const src = String(s?.source || '').trim();
    if (cancelledNoSrc.has(no)) return false;              // ใบยกเลิกที่ไม่รู้ช่องทาง → ตัดทุกช่องทางของเลขนั้น
    if (!src) return !cancelled.has(`::${no}`) && ![...cancelled].some(k => k.endsWith(`::${no}`));
    return !cancelled.has(`${src}::${no}`);
  });
}
