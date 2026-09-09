import { describe, it, expect } from 'vitest';
import {
  skuKey, latestAnchors, soldAfter, stockBalance, stockByDesign, designGrid,
  activeDesigns, addDays, pasteToGrid, detectLayout, parseStockGrid, mergeStockRows, matchDesigns, sessionVariance, countedByDesign, allSessionTotals, excludeCancelled } from '../stockCount.js';

const cnt = (o) => ({ session_id: 's1', count_date: '2026-08-01', design: 'ชบา', color: 'ดำ', size: 'M', qty: 10, kind: 'open', created_at: '2026-08-01T10:00:00Z', ...o });
const sku = (o) => ({ design: 'ชบา', color: 'ดำ', size: 'M', qty: 1, order_date: '2026-08-05', order_no: 'A1', ...o });

describe('คีย์ SKU — normalize สี/ไซซ์ กันคนละตัวกลายเป็นคนละคีย์', () => {
  it('ไซซ์ XXL = 2XL · ตัดช่องว่าง', () => {
    expect(skuKey('ชบา', 'ดำ', 'xxl')).toBe(skuKey('ชบา', 'ดำ', '2XL'));
    expect(skuKey(' ชบา ', 'ดำ', 'M')).toBe(skuKey('ชบา', 'ดำ', 'M'));
  });
});

describe('คงเหลือ = นับล่าสุด − ที่ขายหลังวันนับ', () => {
  it('หักเฉพาะที่ขาย "หลัง" วันนับ (วันเดียวกันถือว่านับรวมแล้ว)', () => {
    const counts = [cnt({ qty: 20, count_date: '2026-08-10' })];
    const skus = [
      sku({ order_date: '2026-08-05', qty: 3 }),   // ก่อนนับ → ไม่หัก
      sku({ order_date: '2026-08-10', qty: 2 }),   // วันเดียวกับนับ → ไม่หัก
      sku({ order_date: '2026-08-12', qty: 4 }),   // หลังนับ → หัก
      sku({ order_date: '2026-08-20', qty: 1 }),
    ];
    const [row] = stockBalance(counts, skus);
    expect(row).toMatchObject({ counted: 20, sold: 5, balance: 15 });
  });

  it('นับใหม่ทับ anchor เดิม (ไม่ต้องล้างข้อมูล)', () => {
    const counts = [cnt({ qty: 20, count_date: '2026-08-01' }), cnt({ session_id: 's2', qty: 8, count_date: '2026-08-20', kind: 'count', created_at: '2026-08-20T09:00:00Z' })];
    const skus = [sku({ order_date: '2026-08-05', qty: 5 }), sku({ order_date: '2026-08-25', qty: 2 })];
    const [row] = stockBalance(counts, skus);
    expect(row).toMatchObject({ counted: 8, countDate: '2026-08-20', sold: 2, balance: 6 });
  });

  it('SKU ที่ยังไม่เคยนับ = ไม่โผล่ (ไม่เดาคงเหลือ)', () => {
    expect(stockBalance([], [sku()])).toEqual([]);
  });

  it('ขายเกินที่นับ → ติดลบ (เตือนว่าลืมนับ/ลืมรับเข้า ไม่ปัดเป็น 0)', () => {
    const [row] = stockBalance([cnt({ qty: 2, count_date: '2026-08-01' })], [sku({ order_date: '2026-08-09', qty: 5 })]);
    expect(row.balance).toBe(-3);
  });

  it('soldAfter ไม่นับ SKU ที่ไม่มี anchor', () => {
    expect(soldAfter([sku({ design: 'ลายอื่น' })], { [skuKey('ชบา', 'ดำ', 'M')]: '2026-08-01' })).toEqual({});
  });

  it('latestAnchors: วันเดียวกัน เอาแถวที่บันทึกทีหลัง', () => {
    const a = latestAnchors([
      cnt({ qty: 5, created_at: '2026-08-01T08:00:00Z' }),
      cnt({ qty: 9, created_at: '2026-08-01T18:00:00Z', session_id: 's2' }),
    ]);
    expect(a[skuKey('ชบา', 'ดำ', 'M')].qty).toBe(9);
  });
});

describe('สรุปรายลาย + กริดสี×ไซซ์', () => {
  const counts = [
    cnt({ color: 'ดำ', size: 'M', qty: 10 }), cnt({ color: 'ดำ', size: 'L', qty: 5 }),
    cnt({ color: 'ขาว', size: 'M', qty: 3 }), cnt({ design: 'ราชพฤกษ์', color: 'กรมท่า', size: 'XL', qty: 7 }),
  ];
  const rows = stockBalance(counts, []);
  it('stockByDesign รวมยอด + นับจำนวนสี', () => {
    const g = stockByDesign(rows);
    expect(g[0]).toMatchObject({ design: 'ชบา', balance: 18, skus: 3, colors: 2 });
    expect(g[1]).toMatchObject({ design: 'ราชพฤกษ์', balance: 7 });
  });
  it('designGrid เรียงไซซ์ตามลำดับจริง (M ก่อน L)', () => {
    const g = designGrid(rows, 'ชบา');
    expect(g.sizes).toEqual(['M', 'L']);
    expect(g.colors).toEqual(['ขาว', 'ดำ']);
    expect(g.cell['ดำ'].L.balance).toBe(5);
  });
});

describe('ลายที่ขายจริง (คุมเฉพาะลายพวกนี้)', () => {
  it('กรองตามช่วงวัน + เรียงขายเยอะก่อน', () => {
    const skus = [
      sku({ design: 'ชบา', qty: 10, order_date: '2026-08-20' }),
      sku({ design: 'เก่ามาก', qty: 99, order_date: '2026-01-05' }),
      sku({ design: 'ราชพฤกษ์', qty: 4, order_date: '2026-08-10', order_no: 'B1' }),
    ];
    const act = activeDesigns(skus, { days: 90, today: '2026-08-24' });
    expect(act.map(a => a.design)).toEqual(['ชบา', 'ราชพฤกษ์']);
    expect(act[0]).toMatchObject({ qty: 10, orders: 1, lastSold: '2026-08-20' });
    expect(activeDesigns(skus, { days: 0 }).length).toBe(3);   // 0 = ทั้งหมด
  });
  it('addDays ข้ามเดือน/ปี', () => {
    expect(addDays('2026-08-24', -90)).toBe('2026-05-26');
    expect(addDays('2026-01-05', -10)).toBe('2025-12-26');
  });
});

describe('อ่านไฟล์สต็อกตั้งต้น', () => {
  it('รูปแบบคอลัมน์ยาว (ลาย/สี/ไซซ์/จำนวน)', () => {
    const grid = [
      ['รายงานสต็อก ณ 24/8/69'],
      ['ลาย', 'สี', 'ไซซ์', 'จำนวน'],
      ['ชบา', 'ดำ', 'M', '12'],
      ['ชบา', 'ดำ', 'XXL', '3'],
      ['', 'ขาว', 'L', '5'],           // เว้นชื่อลาย = ลายเดิม
      ['ราชพฤกษ์', 'กรมท่า', 'XL', '7'],
    ];
    const { rows, skipped, layout } = parseStockGrid(grid);
    expect(layout.mode).toBe('long');
    expect(skipped).toEqual([]);
    expect(rows).toEqual([
      { design: 'ชบา', color: 'ดำ', size: 'M', qty: 12 },
      { design: 'ชบา', color: 'ดำ', size: '2XL', qty: 3 },
      { design: 'ชบา', color: 'ขาว', size: 'L', qty: 5 },
      { design: 'ราชพฤกษ์', color: 'กรมท่า', size: 'XL', qty: 7 },
    ]);
  });

  it('รูปแบบตารางไขว้ (แถว=สี · คอลัมน์=ไซซ์ · หัวบล็อก=ชื่อลาย)', () => {
    const grid = [
      ['ชบา'],
      ['สี', 'S', 'M', 'L', 'XL'],
      ['ดำ', '1', '2', '', '4'],
      ['ขาว', '', '5', '6', ''],
      ['ราชพฤกษ์'],
      ['กรมท่า', '', '', '2', ''],
    ];
    const { rows, skipped } = parseStockGrid(grid);
    expect(skipped).toEqual([]);
    expect(rows).toContainEqual({ design: 'ชบา', color: 'ดำ', size: 'XL', qty: 4 });
    expect(rows).toContainEqual({ design: 'ชบา', color: 'ขาว', size: 'L', qty: 6 });
    expect(rows).toContainEqual({ design: 'ราชพฤกษ์', color: 'กรมท่า', size: 'L', qty: 2 });
    expect(rows.length).toBe(6);   // ดำ 3 (S/M/XL) + ขาว 2 (M/L) + กรมท่า 1 — ช่องว่างไม่ถูกนับ
  });

  it('บอกแถวที่อ่านไม่ได้ ไม่บันทึกเงียบ', () => {
    const grid = [['ลาย', 'สี', 'ไซซ์', 'จำนวน'], ['ชบา', '', 'M', '5'], ['ชบา', 'ดำ', 'M', 'abc']];
    const { rows, skipped } = parseStockGrid(grid);
    expect(rows).toEqual([]);
    expect(skipped.map(s => s.reason)).toEqual(['ไม่มีสีหรือไซซ์', 'จำนวนไม่ใช่ตัวเลข']);
  });

  it('ไฟล์ที่อ่านหัวตารางไม่ออก → บอกเหตุผล', () => {
    expect(parseStockGrid([['aaa', 'bbb'], ['1', '2']]).layout.mode).toBe('unknown');
  });

  it('pasteToGrid รองรับทั้ง TAB (คัดลอกจาก Excel) และ CSV', () => {
    expect(pasteToGrid('สี\tM\tL\nดำ\t1\t2')).toEqual([['สี', 'M', 'L'], ['ดำ', '1', '2']]);
    expect(pasteToGrid('สี,M\nดำ,1')).toEqual([['สี', 'M'], ['ดำ', '1']]);
  });

  it('detectLayout เจอหัวตารางที่ไม่ได้อยู่บรรทัดแรก', () => {
    expect(detectLayout([[''], ['หมายเหตุ'], ['ลาย', 'สี', 'ไซซ์', 'จำนวน']]).headerRow).toBe(2);
  });

  it('mergeStockRows รวมแถวซ้ำ (บวกกัน ไม่ทับกัน)', () => {
    const r = mergeStockRows([{ design: 'ชบา', color: 'ดำ', size: 'M', qty: 3 }, { design: 'ชบา', color: 'ดำ', size: 'm', qty: 2 }]);
    expect(r).toEqual([{ design: 'ชบา', color: 'ดำ', size: 'M', qty: 5 }]);
  });

  it('matchDesigns เติมชื่อ/รหัสมาตรฐาน + รายงานลายที่จับไม่ได้', () => {
    const resolve = (t) => (t === 'ชบา' ? { name: 'ชบา', code: 'JSK111' } : null);
    const { rows, unmatched } = matchDesigns([{ design: 'ชบา', color: 'ดำ', size: 'M', qty: 1 }, { design: 'ลายมั่ว', color: 'ดำ', size: 'M', qty: 2 }], resolve);
    expect(rows[0].productCode).toBe('JSK111');
    expect(unmatched).toEqual([{ design: 'ลายมั่ว', rows: 1 }]);
  });
});

/* ============================================================
   PART 115 — รายงานผลต่างของรอบนับ (นับได้ vs ระบบคิด ณ ตอนนั้น)
   ============================================================ */
describe('sessionVariance — ย้อนดูผลต่างของรอบนับได้', () => {
  const C = (session, date, design, color, size, qty, created_at, kind = 'count') =>
    ({ session_id: session, count_date: date, design, color, size, qty, created_at, kind });
  const S = (design, color, size, qty, order_date) => ({ design, color, size, qty, order_date });

  it('นับครั้งแรกของ SKU = ไม่มีผลต่างให้เทียบ', () => {
    const counts = [C('s1', '2026-08-01', 'ชบา', 'ดำ', 'M', 10, '2026-08-01T03:00:00Z', 'open')];
    const v = sessionVariance(counts, [], 's1');
    expect(v.rows[0].first).toBe(true);
    expect(v.rows[0].diff).toBe(null);
    expect(v.totals.first).toBe(1);
    expect(v.totals.counted).toBe(10);
  });

  it('ระบบคิด = ที่นับครั้งก่อน − ที่ขายระหว่างนั้น · ผลต่างคือของหาย/ของเกิน', () => {
    const counts = [
      C('s1', '2026-08-01', 'ชบา', 'ดำ', 'M', 10, '2026-08-01T03:00:00Z', 'open'),
      C('s2', '2026-08-20', 'ชบา', 'ดำ', 'M', 6, '2026-08-20T03:00:00Z'),
    ];
    const skus = [
      S('ชบา', 'ดำ', 'M', 3, '2026-08-10'),   // ขายหลัง anchor เก่า → ระบบหักให้
      S('ชบา', 'ดำ', 'M', 5, '2026-07-20'),   // ขายก่อน anchor เก่า → ไม่นับ
      S('ชบา', 'ดำ', 'M', 4, '2026-08-25'),   // ขายหลังวันนับรอบนี้ → ไม่นับในรอบนี้
    ];
    const v = sessionVariance(counts, skus, 's2');
    const r = v.rows[0];
    expect(r.system).toBe(7);      // 10 − 3
    expect(r.counted).toBe(6);
    expect(r.diff).toBe(-1);       // ของหาย 1 ตัว
    expect(v.totals.minus).toBe(1);
    expect(v.totals.diff).toBe(-1);
  });

  // นิยามต้องตรงกับ stockBalance: ของที่ขายในวันเดียวกับวันนับ ถือว่า "ออกไปก่อนนับ"
  // (stockBalance หักเฉพาะที่ขาย 'หลัง' วันนับ) → ระบบจึงคาดว่าเหลือ 10−2=8 · นับได้ 10 = เกิน 2
  it('ขายวันเดียวกับวันนับ = ออกไปก่อนนับ (นิยามเดียวกับ stockBalance)', () => {
    const counts = [
      C('s1', '2026-08-01', 'ก', 'ดำ', 'M', 10, '2026-08-01T00:00:00Z'),
      C('s2', '2026-08-10', 'ก', 'ดำ', 'M', 10, '2026-08-10T00:00:00Z'),
    ];
    const v = sessionVariance(counts, [S('ก', 'ดำ', 'M', 2, '2026-08-10')], 's2');
    expect(v.rows[0].system).toBe(8);
    expect(v.rows[0].diff).toBe(2);
    expect(v.totals.plus).toBe(1);
  });

  it('รวมหลาย SKU: เรียงผลต่างมากสุดขึ้นก่อน + สรุปเกิน/ขาด/ตรง', () => {
    const counts = [
      C('s1', '2026-08-01', 'ก', 'ดำ', 'M', 10, '2026-08-01T00:00:00Z'),
      C('s1', '2026-08-01', 'ก', 'ขาว', 'L', 5, '2026-08-01T00:00:00Z'),
      C('s2', '2026-08-15', 'ก', 'ดำ', 'M', 4, '2026-08-15T00:00:00Z'),   // −6
      C('s2', '2026-08-15', 'ก', 'ขาว', 'L', 6, '2026-08-15T00:00:00Z'),  // +1
      C('s2', '2026-08-15', 'ก', 'แดง', '2XL', 3, '2026-08-15T00:00:00Z'), // ครั้งแรก
    ];
    const v = sessionVariance(counts, [], 's2');
    expect(v.rows[0].diff).toBe(-6);
    expect(v.totals.plus).toBe(1);
    expect(v.totals.minus).toBe(1);
    expect(v.totals.first).toBe(1);
    expect(v.totals.skus).toBe(3);
  });

  it('รอบที่ไม่มีอยู่ = คืนค่าว่าง ไม่พัง', () => {
    expect(sessionVariance([], [], 'ไม่มี').rows).toEqual([]);
    expect(sessionVariance(null, null, null).totals.counted).toBe(0);
  });
});

describe('countedByDesign — ยอดนับล่าสุดต่อลาย (ใช้ในหน้าสินค้า)', () => {
  it('รวมทุก SKU ของลาย + วันที่นับล่าสุด', () => {
    const c = [
      { session_id: 'a', count_date: '2026-08-01', design: 'ชบา', color: 'ดำ', size: 'M', qty: 10, created_at: '2026-08-01T00:00:00Z' },
      { session_id: 'a', count_date: '2026-08-01', design: 'ชบา', color: 'ขาว', size: 'L', qty: 5, created_at: '2026-08-01T00:00:00Z' },
      { session_id: 'b', count_date: '2026-08-20', design: 'ชบา', color: 'ดำ', size: 'M', qty: 3, created_at: '2026-08-20T00:00:00Z' },
    ];
    const m = countedByDesign(c);
    expect(m['ชบา'].qty).toBe(8);      // 3 (นับใหม่ทับ) + 5
    expect(m['ชบา'].skus).toBe(2);
    expect(m['ชบา'].date).toBe('2026-08-20');
  });
  it('ไม่มีข้อมูล = ว่าง', () => { expect(countedByDesign([])).toEqual({}); });
});

describe('allSessionTotals — คิดผลต่างทุกรอบครั้งเดียว (ต้องเท่ากับคิดทีละรอบ)', () => {
  const counts = [
    { session_id: 'a', count_date: '2026-08-01', design: 'ก', color: 'ดำ', size: 'M', qty: 10, created_at: '2026-08-01T00:00:00Z' },
    { session_id: 'a', count_date: '2026-08-01', design: 'ก', color: 'ขาว', size: 'L', qty: 5, created_at: '2026-08-01T00:00:00Z' },
    { session_id: 'b', count_date: '2026-08-20', design: 'ก', color: 'ดำ', size: 'M', qty: 6, created_at: '2026-08-20T00:00:00Z' },
    { session_id: 'b', count_date: '2026-08-20', design: 'ก', color: 'ขาว', size: 'L', qty: 5, created_at: '2026-08-20T00:00:00Z' },
  ];
  const skus = [{ design: 'ก', color: 'ดำ', size: 'M', qty: 3, order_date: '2026-08-10' }];

  it('ค่าตรงกับ sessionVariance ทุกรอบ', () => {
    const all = allSessionTotals(counts, skus);
    expect(all.b).toEqual(sessionVariance(counts, skus, 'b').totals);
    expect(all.a).toEqual(sessionVariance(counts, skus, 'a').totals);
    expect(all.b.diff).toBe(-1);     // ดำ M: 10−3=7 นับได้ 6 → −1 · ขาว L ตรง
    expect(all.b.match).toBe(1);
    expect(all.a.first).toBe(2);     // รอบแรก ไม่มีอะไรเทียบ
  });

  it('ไม่มีข้อมูล = {}', () => { expect(allSessionTotals([], [])).toEqual({}); });
});

/* ============================================================
   PART 118 — ตัดใบยกเลิกออกจากยอดขายที่เอาไปหักสต็อก
   ============================================================
   ตาราง tmk_mp_skus ใช้ร่วมทุกช่องทาง (shipnity/shopee/tiktok) และ "เลขออเดอร์ซ้ำข้ามช่องทางได้"
   → ต้องเทียบด้วย source:order_no ไม่ใช่ order_no ล้วน ไม่งั้นยกเลิกฝั่งหนึ่ง = หักฝั่งอื่นหายไปด้วย
   ============================================================ */
describe('excludeCancelled — ตัดบรรทัดของใบที่ยกเลิก', () => {
  const sku = (order_no, source, extra = {}) => ({ order_no, source, design: 'ก', color: 'ดำ', size: 'M', qty: 1, order_date: '2026-08-10', ...extra });

  it('ตัดเฉพาะใบที่ยกเลิกจริง', () => {
    const skus = [sku('A1', 'shipnity'), sku('A2', 'shipnity')];
    const orders = [{ order_no: 'A1', source: 'shipnity', status: 'cancelled' }, { order_no: 'A2', source: 'shipnity', status: 'confirmed' }];
    expect(excludeCancelled(skus, orders).map(s => s.order_no)).toEqual(['A2']);
  });

  it('เลขออเดอร์ซ้ำข้ามช่องทาง — ยกเลิกฝั่งเดียว อีกฝั่งต้องยังอยู่', () => {
    const skus = [sku('1001', 'shopee'), sku('1001', 'shipnity')];
    const orders = [{ order_no: '1001', source: 'shopee', status: 'cancelled' }];
    const out = excludeCancelled(skus, orders);
    expect(out.length).toBe(1);
    expect(out[0].source).toBe('shipnity');
  });

  it('แถวที่ไม่มี source (ข้อมูลเก่า) เทียบด้วยเลขออเดอร์ล้วน', () => {
    const skus = [{ order_no: 'B9', design: 'ก', color: 'ดำ', size: 'M', qty: 1, order_date: '2026-08-10' }];
    const orders = [{ order_no: 'B9', status: 'cancelled' }];
    expect(excludeCancelled(skus, orders)).toEqual([]);
  });

  it('ไม่มีออเดอร์ยกเลิกเลย = คืนของเดิมครบ · ค่าว่าง = ไม่พัง', () => {
    const skus = [sku('A1', 'shipnity')];
    expect(excludeCancelled(skus, []).length).toBe(1);
    expect(excludeCancelled(null, null)).toEqual([]);
  });

  it('สถานะพิมพ์ตัวใหญ่/มีช่องว่าง ก็ต้องจับได้', () => {
    const skus = [sku('C1', 'tiktok')];
    expect(excludeCancelled(skus, [{ order_no: 'C1', source: 'tiktok', status: ' Cancelled ' }])).toEqual([]);
  });
});

/* SKU ที่ยังไม่เคยนับแต่มีของรับเข้าแล้ว (counted = null) ต้องไม่ทำให้ยอดรวมรายลายเป็น NaN */
describe('stockByDesign กับ counted = null', () => {
  it('รวมยอดได้ ไม่ NaN และบอกว่าลายนี้ยังไม่เคยนับ', async () => {
    const { stockByDesign } = await import('../stockCount.js');
    const [g] = stockByDesign([
      { design: 'ลายใหม่', color: 'ดำ', size: 'M', counted: null, sold: 0, balance: 100, countDate: '' },
    ]);
    expect(g.counted).toBe(0);
    expect(g.balance).toBe(100);
    expect(Number.isNaN(g.balance)).toBe(false);
    expect(g.everCounted).toBe(false);
  });

  it('ปนกับลายที่นับแล้ว → everCounted = true และยอดรวมถูก', async () => {
    const { stockByDesign } = await import('../stockCount.js');
    const [g] = stockByDesign([
      { design: 'ลายA', color: 'ดำ', size: 'M', counted: null, sold: 0, balance: 10, countDate: '' },
      { design: 'ลายA', color: 'ดำ', size: 'L', counted: 40, sold: 5, balance: 35, countDate: '2026-03-01' },
    ]);
    expect(g.counted).toBe(40);
    expect(g.balance).toBe(45);
    expect(g.everCounted).toBe(true);
    expect(g.lastCount).toBe('2026-03-01');
  });
});
