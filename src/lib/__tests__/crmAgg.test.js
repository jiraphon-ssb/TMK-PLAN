import { describe, it, expect } from 'vitest';
import { buildCrmMonth, isCrmOrder, crmCustomerKey, crmTargetProgress, CRM_CHANNELS } from '../crmAgg.js';

// ยอด CRM = ออเดอร์ไม่ยกเลิก channel ∈ {LINE, Phone} (ADR-001) · month = 'YYYY-MM'
const o = (over) => ({ order_no: 'X', customer_code: 'C1', customer_name: 'ลูกค้า', channel: 'LINE', salesperson: 'ฟ้า', sales: 100, qty: 1, order_date: '2026-07-10', status: 'confirmed', ...over });

describe('isCrmOrder / crmCustomerKey', () => {
  it('CRM_CHANNELS = LINE + Phone', () => expect(CRM_CHANNELS).toEqual(['LINE', 'Phone']));
  it('isCrmOrder: LINE/Phone = true · อื่น = false', () => {
    expect(isCrmOrder({ channel: 'LINE' })).toBe(true);
    expect(isCrmOrder({ channel: 'Phone' })).toBe(true);
    expect(isCrmOrder({ channel: 'Facebook' })).toBe(false);
    expect(isCrmOrder({})).toBe(false);
  });
  it('crmCustomerKey: code > ชื่อ · masked → ว่าง', () => {
    expect(crmCustomerKey({ customer_code: 'P081' })).toBe('P081');
    expect(crmCustomerKey({ customer_code: '', customer_name: 'สมชาย' })).toBe('Nสมชาย');
    expect(crmCustomerKey({ customer_code: '', customer_name: 'ณ******์' })).toBe('');
    expect(crmCustomerKey({ customer_code: '', customer_name: '' })).toBe('');
  });
});

describe('buildCrmMonth', () => {
  it('กรองเฉพาะ LINE/Phone — Facebook ไม่นับ', () => {
    const r = buildCrmMonth([o({ channel: 'LINE', sales: 100 }), o({ channel: 'Facebook', sales: 999, customer_code: 'C2' })], '2026-07');
    expect(r.crmSales).toBe(100);
    expect(r.totalSales).toBe(1099);   // ยอดรวมนับทุกช่อง
    expect(r.crmOrders).toBe(1);
  });
  it('ตัดใบยกเลิก', () => {
    const r = buildCrmMonth([o({ sales: 100 }), o({ sales: 500, status: 'cancelled', customer_code: 'C2' })], '2026-07');
    expect(r.crmSales).toBe(100);
    expect(r.totalSales).toBe(100);
  });
  it('แยกยอด LINE / โทร', () => {
    const r = buildCrmMonth([o({ channel: 'LINE', sales: 300 }), o({ channel: 'Phone', sales: 200, customer_code: 'C2' })], '2026-07');
    expect(r.lineSales).toBe(300);
    expect(r.phoneSales).toBe(200);
    expect(r.crmSales).toBe(500);
  });
  it('crmShare = CRM / ยอดรวม %', () => {
    const r = buildCrmMonth([o({ channel: 'LINE', sales: 250 }), o({ channel: 'Shopee', sales: 750, customer_code: 'C2' })], '2026-07');
    expect(r.crmShare).toBe(25);
  });
  it('ยอดรวม 0 → crmShare 0 ไม่ NaN', () => {
    const r = buildCrmMonth([], '2026-07');
    expect(r.crmShare).toBe(0);
    expect(Number.isNaN(r.crmShare)).toBe(false);
  });
  it('ใหม่ vs ซื้อซ้ำ ข้ามเดือน (first CRM order = เดือนก่อน → ซื้อซ้ำ)', () => {
    const orders = [
      o({ customer_code: 'A', order_date: '2026-06-05', sales: 100 }),  // A ซื้อ CRM ครั้งแรก มิ.ย.
      o({ customer_code: 'A', order_date: '2026-07-05', sales: 100 }),  // A ซื้อซ้ำ ก.ค.
      o({ customer_code: 'B', order_date: '2026-07-08', sales: 100 }),  // B ใหม่ ก.ค.
    ];
    const r = buildCrmMonth(orders, '2026-07');
    expect(r.buyers).toBe(2);
    expect(r.newBuyers).toBe(1);      // B
    expect(r.repeatBuyers).toBe(1);   // A
    expect(r.newBuyers + r.repeatBuyers).toBe(r.buyers);
  });
  it('ลูกค้าปกปิด (masked) ไม่นับเป็น buyer แต่ยอดยังรวม', () => {
    const r = buildCrmMonth([o({ customer_code: '', customer_name: 'ก******า', channel: 'LINE', sales: 100 })], '2026-07');
    expect(r.crmSales).toBe(100);
    expect(r.buyers).toBe(0);
  });
  it('เดือนว่าง → zeros + byDay เต็มเดือน', () => {
    const r = buildCrmMonth([o({ order_date: '2026-05-10' })], '2026-07');
    expect(r.crmSales).toBe(0);
    expect(r.buyers).toBe(0);
    expect(r.byDay).toHaveLength(31);   // ก.ค. 31 วัน
    expect(r.byDay.every(d => d.line === 0 && d.phone === 0)).toBe(true);
    expect(r.byDay[0].date).toBe('2026-07-01');
  });
  it('byDay กระจายยอดถูกวัน (LINE vs โทร)', () => {
    const r = buildCrmMonth([o({ channel: 'LINE', order_date: '2026-07-10', sales: 100 }), o({ channel: 'Phone', order_date: '2026-07-10', sales: 50, customer_code: 'C2' })], '2026-07');
    expect(r.byDay[9].line).toBe(100);
    expect(r.byDay[9].phone).toBe(50);
    expect(r.byDay[0].line).toBe(0);
  });
  it('prev = เดือนก่อนหน้า (rollover ปี) + deltas', () => {
    const orders = [o({ order_date: '2026-07-10', sales: 300 }), o({ order_date: '2026-06-10', sales: 200, customer_code: 'C2' })];
    const r = buildCrmMonth(orders, '2026-07');
    expect(r.crmSales).toBe(300);
    expect(r.prev.crmSales).toBe(200);
    const rJan = buildCrmMonth([o({ order_date: '2025-12-20', sales: 500 })], '2026-01');
    expect(rJan.prev.crmSales).toBe(500);   // ธ.ค. ปีก่อน
  });
  it('bySeller จัดกลุ่มตามเซลล์ เรียงยอดมาก→น้อย', () => {
    const orders = [
      o({ salesperson: 'ฟ้า', sales: 300 }),
      o({ salesperson: 'ฟ้า', sales: 100, customer_code: 'C2' }),
      o({ salesperson: 'มะปราง', sales: 500, customer_code: 'C3' }),
    ];
    const r = buildCrmMonth(orders, '2026-07');
    expect(r.bySeller).toHaveLength(2);
    expect(r.bySeller[0]).toMatchObject({ name: 'มะปราง', sales: 500, orders: 1 });
    expect(r.bySeller[1]).toMatchObject({ name: 'ฟ้า', sales: 400, orders: 2 });
  });
});

describe('buildCrmMonth — scope ต่อเซลล์ (param seller)', () => {
  const orders = [
    o({ salesperson: 'ฟ้า', channel: 'LINE', sales: 300, customer_code: 'A' }),
    o({ salesperson: 'ฟ้า', channel: 'Phone', sales: 100, customer_code: 'B' }),
    o({ salesperson: 'มะปราง', channel: 'LINE', sales: 500, customer_code: 'C' }),
    o({ salesperson: 'มะปราง', channel: 'Shopee', sales: 900, customer_code: 'D' }),  // ไม่ใช่ CRM
  ];
  it('seller filter → นับเฉพาะยอด CRM ของคนนั้น', () => {
    const r = buildCrmMonth(orders, '2026-07', 'ฟ้า');
    expect(r.crmSales).toBe(400);       // 300+100 ของฟ้า
    expect(r.lineSales).toBe(300);
    expect(r.phoneSales).toBe(100);
    expect(r.crmOrders).toBe(2);
    expect(r.buyers).toBe(2);
  });
  it('totalSales/crmShare คิดจากยอดรวมทั้งบริษัท (ไม่ scope)', () => {
    const r = buildCrmMonth(orders, '2026-07', 'ฟ้า');
    expect(r.totalSales).toBe(1800);    // 300+100+500+900 ทุกคน
    expect(r.crmShare).toBeCloseTo(400 / 1800 * 100, 5);
  });
  it('bySeller ไม่โดน filter (ยังเห็นทุกคนไว้เป็น options)', () => {
    const r = buildCrmMonth(orders, '2026-07', 'ฟ้า');
    expect(r.bySeller.map(s => s.name).sort()).toEqual(['ฟ้า', 'มะปราง']);
  });
  it('seller ไม่มีออเดอร์ CRM → zeros แต่ total ยังมี', () => {
    const r = buildCrmMonth(orders, '2026-07', 'ไม่มีคนนี้');
    expect(r.crmSales).toBe(0);
    expect(r.buyers).toBe(0);
    expect(r.totalSales).toBe(1800);
  });
});

describe('crmQty (จำนวนตัวยอด CRM)', () => {
  it('รวม qty เฉพาะออเดอร์ CRM', () => {
    const r = buildCrmMonth([o({ channel: 'LINE', qty: 3 }), o({ channel: 'Facebook', qty: 9, customer_code: 'C2' })], '2026-07');
    expect(r.crmQty).toBe(3);   // Facebook ไม่นับ
  });
  it('scope ตามเซลล์', () => {
    const orders = [o({ salesperson: 'ฟ้า', qty: 2 }), o({ salesperson: 'มะปราง', qty: 5, customer_code: 'C2' })];
    expect(buildCrmMonth(orders, '2026-07', 'ฟ้า').crmQty).toBe(2);
  });
  it('เดือนว่าง → 0', () => {
    expect(buildCrmMonth([o({ order_date: '2026-05-10' })], '2026-07').crmQty).toBe(0);
  });
});

describe('crmTargetProgress', () => {
  it('เดือนอดีต: daysLeft 0 · projected = crmSales · pct/gap ถูก', () => {
    const r = crmTargetProgress({ crmSales: 80000, month: '2026-06', target: 100000, todayISO: '2026-07-15' });
    expect(r.daysLeft).toBe(0);
    expect(r.projected).toBe(80000);
    expect(r.pct).toBe(80);
    expect(r.gap).toBe(-20000);
  });
  it('เดือนปัจจุบัน: pace projected + daysLeft (ไม่นับวันนี้)', () => {
    // 31 วัน · วันนี้ที่ 10 → daysPassed 10, daysLeft 21 · projected = 50000/10*31
    const r = crmTargetProgress({ crmSales: 50000, month: '2026-07', target: 100000, todayISO: '2026-07-10' });
    expect(r.daysPassed).toBe(10);
    expect(r.daysLeft).toBe(21);
    expect(r.projected).toBeCloseTo(155000, 5);
    expect(r.pct).toBe(50);
  });
  it('target 0 → pct null · gap = crmSales', () => {
    const r = crmTargetProgress({ crmSales: 5000, month: '2026-07', target: 0, todayISO: '2026-07-10' });
    expect(r.pct).toBe(null);
    expect(r.gap).toBe(5000);
  });
  it('gap บวกเมื่อเกินเป้า', () => {
    const r = crmTargetProgress({ crmSales: 120000, month: '2026-06', target: 100000, todayISO: '2026-07-01' });
    expect(r.gap).toBe(20000);
    expect(r.pct).toBe(120);
  });
});

// D8 ([[crm-team-definition]]): buildCrmMonth รับ Set/array = scope "ทีม CRM" (คนมีเป้า CRM)
describe('buildCrmMonth — team scope (D8)', () => {
  const orders = [
    { order_no: 'F1', salesperson: 'FAH', channel: 'LINE', sales: 1000, order_date: '2026-09-05', status: 'confirmed', customer_code: 'C1' },
    { order_no: 'F2', salesperson: 'FAH', channel: 'Phone', sales: 500, order_date: '2026-09-06', status: 'confirmed', customer_code: 'C2' },
    { order_no: 'F3', salesperson: 'FAH', channel: 'Facebook', sales: 9999, order_date: '2026-09-06', status: 'confirmed', customer_code: 'C3' }, // ไม่ใช่ CRM channel
    { order_no: 'T1', salesperson: 'TUKTA', channel: 'LINE', sales: 700, order_date: '2026-09-07', status: 'confirmed', customer_code: 'C4' },   // นอกทีม
  ];

  it('Set(ทีม) → ยอด CRM เฉพาะสมาชิกทีม (TUKTA ที่มี LINE ไม่ถูกนับ)', () => {
    const m = buildCrmMonth(orders, '2026-09', new Set(['FAH']));
    expect(m.crmSales).toBe(1500);          // LINE 1000 + Phone 500 · Facebook ของ FAH ไม่นับ · LINE ของ TUKTA ไม่นับ
    expect(m.lineSales).toBe(1000);
    expect(m.phoneSales).toBe(500);
  });

  it('totalSales ยังเป็นยอดทั้งบริษัท (สัดส่วน CRM ไม่เพี้ยน)', () => {
    const m = buildCrmMonth(orders, '2026-09', new Set(['FAH']));
    expect(m.totalSales).toBe(1000 + 500 + 9999 + 700);
  });

  it("seller ชื่อเดียว (แบบเดิม) ยังทำงานเหมือนเดิม", () => {
    const m = buildCrmMonth(orders, '2026-09', 'TUKTA');
    expect(m.crmSales).toBe(700);
  });

  it("'' (ไม่ scope) = ยอด CRM ทุกคน — พฤติกรรมเดิมไม่เปลี่ยน", () => {
    const m = buildCrmMonth(orders, '2026-09', '');
    expect(m.crmSales).toBe(1000 + 500 + 700);
  });
});
