/* ============================================================
   เส้นทางนำเข้าไฟล์มาร์เก็ตเพลส — จุดที่เลขเงินเกิด (8 ก.ย. 69)
   ============================================================
   ไฟล์นี้เขียนแถวลง tmk_mp_orders ซึ่งเป็นฐานของตัวเลขทุกหน้าในระบบ
   4 บั๊กที่คุมไว้:
   1. อัปไฟล์ทับกัน/ไฟล์เดิมซ้ำ → byOrder บวกสะสม = ยอดคูณสอง แล้ว upsert ทับถาวร
   2. คอลัมน์เปลี่ยนชื่อ → indexer คืน -1 → mpNum(undefined)=0 = "อ่านไม่ได้" กลายเป็น "ไม่มีเงิน"
      และ status อ่านไม่ได้ → ใบที่ยกเลิกกลายเป็น active (นับยอดเข้าเต็ม)
   3. TikTok ไฟล์ที่มีออเดอร์เดียว → guard length > 2 ตัดทิ้งทั้งไฟล์
   4. payment_type ส่งค่าดิบจากไฟล์ → หลุดนอก PAYMENT_TYPES → ยอดไม่เข้าทั้งช่องโอนและ COD
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { buildMaster, dedupeGridRows, auditColumns } from '../mpReport.js';
import { PAYMENT_TYPES } from '../saleFields.js';

const SHOPEE_HEAD = ['หมายเลขคำสั่งซื้อ', 'สถานะการสั่งซื้อ', 'เวลาการสั่งซื้อสินค้า', 'ชื่อผู้รับ', 'จำนวน', 'ราคาขายสุทธิ', 'จังหวัด', 'ช่องทางการชำระเงิน'];
const shopeeRow = (o, qty, price, pay = 'บัตรเครดิต/เดบิต', status = 'สำเร็จแล้ว') =>
  [o, status, '2026-09-01 10:00', 'คุณเอ', String(qty), String(price), 'กรุงเทพมหานคร', pay];

describe('อัปไฟล์ซ้ำ ต้องไม่ทำให้ยอดคูณ', () => {
  it('⛔ แถวเดียวกันเป๊ะโผล่ 2 ครั้ง = อัปซ้ำ ต้องนับครั้งเดียว', () => {
    const row = shopeeRow('B1', 2, 1500);
    const rows = buildMaster({ shopee: [SHOPEE_HEAD, row, row] });
    expect(rows).toHaveLength(1);
    expect(rows[0].sales).toBe(1500);
    expect(rows[0].qty).toBe(2);
    expect(rows[0].cod_amount).toBe(0);
  });

  it('ออเดอร์เดียวกันแต่คนละ SKU (คนละราคา) = ของจริง ต้องบวกกัน', () => {
    const rows = buildMaster({ shopee: [SHOPEE_HEAD, shopeeRow('B1', 1, 1000), shopeeRow('B1', 2, 500)] });
    expect(rows).toHaveLength(1);
    expect(rows[0].sales).toBe(1500);
    expect(rows[0].qty).toBe(3);
  });

  it('dedupeGridRows: คืนจำนวนที่ตัดทิ้งให้เอาไปบอกผู้ใช้', () => {
    const row = shopeeRow('B1', 2, 1500);
    const r = dedupeGridRows([SHOPEE_HEAD, row, row, shopeeRow('B2', 1, 900)]);
    expect(r.grid).toHaveLength(3);      // หัว + B1 + B2
    expect(r.dropped).toBe(1);
  });

  it('หัวตารางไม่ถูกนับเป็นแถวซ้ำ', () => {
    const r = dedupeGridRows([SHOPEE_HEAD, SHOPEE_HEAD]);
    expect(r.grid).toHaveLength(2);
    expect(r.dropped).toBe(0);
  });
});

describe('คอลัมน์หาย ต้องไม่กลายเป็นเลข 0 เงียบ ๆ', () => {
  it('⛔ "จำนวน" กับ "สถานะการสั่งซื้อ" ต้องอยู่ในรายการคอลัมน์บังคับ', () => {
    const head = SHOPEE_HEAD.map(h => h === 'จำนวน' ? 'Quantity' : h);
    const issues = auditColumns([{ kind: 'shopee', name: 'a.xlsx', grid: [head, shopeeRow('B1', 2, 1500)] }]);
    expect(issues.some(i => /จำนวน/.test(JSON.stringify(i)))).toBe(true);
  });

  it('⛔ อ่านสถานะไม่ได้ ต้องไม่ตีความว่า "ไม่ยกเลิก"', () => {
    const head = SHOPEE_HEAD.map(h => h === 'สถานะการสั่งซื้อ' ? 'Order Status' : h);
    const rows = buildMaster({ shopee: [head, shopeeRow('B1', 2, 1500, 'COD', 'ยกเลิกแล้ว')] });
    expect(rows[0].status).toBe('unknown');   // ไม่ใช่ 'active'
  });

  it('อ่านสถานะได้ตามปกติ → active / cancelled ถูกต้อง', () => {
    const a = buildMaster({ shopee: [SHOPEE_HEAD, shopeeRow('B1', 1, 100)] });
    const c = buildMaster({ shopee: [SHOPEE_HEAD, shopeeRow('B2', 1, 100, 'COD', 'ยกเลิกแล้ว')] });
    expect(a[0].status).toBe('active');
    expect(c[0].status).toBe('cancelled');
  });
});

describe('payment_type ต้องอยู่ในชุดมาตรฐานเสมอ', () => {
  it('⛔ ค่าดิบจากไฟล์ (บัตรเครดิต) → มาร์เก็ตเพลส ไม่ใช่ปล่อยผ่าน', () => {
    const rows = buildMaster({ shopee: [SHOPEE_HEAD, shopeeRow('B1', 1, 100, 'บัตรเครดิต/เดบิต')] });
    expect(PAYMENT_TYPES).toContain(rows[0].payment_type);
  });

  it('COD ยังเป็น COD และมี cod_amount', () => {
    const rows = buildMaster({ shopee: [SHOPEE_HEAD, shopeeRow('B1', 1, 100, 'เก็บเงินปลายทาง (COD)')] });
    expect(rows[0].payment_type).toBe('COD');
    expect(rows[0].cod_amount).toBe(100);
  });

  it('ช่องจ่ายเงินว่าง → ไม่ระบุ', () => {
    const rows = buildMaster({ shopee: [SHOPEE_HEAD, shopeeRow('B1', 1, 100, '')] });
    expect(PAYMENT_TYPES).toContain(rows[0].payment_type);
  });
});

describe('TikTok ไฟล์ที่มีออเดอร์เดียว', () => {
  const TT_HEAD = ['Order ID', 'Order Status', 'Created Time', 'Quantity', 'SKU Subtotal After Discount', 'Province', 'Payment Method'];
  const ttRow = (o) => [o, 'Completed', '2026-09-01 10:00', '1', '900', 'กรุงเทพมหานคร', 'COD'];

  it('⛔ 1 ออเดอร์ต้องนำเข้าได้ (เดิม guard length > 2 ตัดทิ้งทั้งไฟล์)', () => {
    expect(buildMaster({ tiktok: [TT_HEAD, ttRow('1234567890')] })).toHaveLength(1);
  });

  it('2 ออเดอร์ยังทำงานปกติ', () => {
    expect(buildMaster({ tiktok: [TT_HEAD, ttRow('1234567890'), ttRow('1234567891')] })).toHaveLength(2);
  });
});

/* ============================================================
   planRematch ต้องไม่ทับค่าที่แก้มือของแถวอื่นในกลุ่ม (8 ก.ย. 69)
   ============================================================
   เดิมจัดกลุ่มด้วย (source, raw, product_code) แล้วคิด patch จากแถวตัวอย่างแถวเดียว
   แต่ผลลัพธ์ขึ้นกับ design/color/size ของแถวนั้น ซึ่งไม่อยู่ในคีย์ → UPDATE โดนทั้งกลุ่ม
   → แถวที่แก้ 'กรมท่า/S' ไว้ด้วยมือ ถูกทับเป็น 'ดำ/XS' ตามแถวที่ยังว่าง
   ============================================================ */
describe('planRematch ไม่ทับแถวที่แก้มือ', () => {
  const M = { code2: {}, name2: {}, kw: [], colors: new Set() };
  const sku = (extra) => ({ source: 'shopee', raw_sku_or_name: 'SKU-A', product_code: 'P1', design: '', color: '', size: '', ...extra });

  it('แถวที่สภาพต่างกัน ต้องแยกกลุ่ม (ไม่ใช้ patch ร่วมกัน)', async () => {
    const { planRematch } = await import('../mpReport.js');
    const r = planRematch([sku({ color: '' }), sku({ color: 'กรมท่า', size: 'S' })], M);
    // อาจไม่มี change เลย (matcher ว่าง) แต่ถ้ามี ต้องไม่ใช่ change เดียวที่ครอบทั้ง 2 แถว
    r.changes.forEach(c => expect(c.rows).toBe(1));
  });

  it('change ต้องพกสภาพเดิมไปด้วย เพื่อให้ UPDATE จำกัดขอบเขตได้', async () => {
    const { planRematch } = await import('../mpReport.js');
    const M2 = { code2: { P1: { code: 'P1', design: 'ดารารัตน์' } }, name2: {}, kw: [], colors: new Set() };
    const r = planRematch([sku({ color: 'กรมท่า', size: 'S' })], M2);
    r.changes.forEach(c => {
      expect(c).toHaveProperty('curDesign');
      expect(c).toHaveProperty('curColor');
      expect(c).toHaveProperty('curSize');
    });
  });

  it('แถวเหมือนกันเป๊ะหลายแถว ยังรวมเป็นกลุ่มเดียว (ไม่ทำให้ query บาน)', async () => {
    const { planRematch } = await import('../mpReport.js');
    const M2 = { code2: { P1: { code: 'P1', design: 'ดารารัตน์' } }, name2: {}, kw: [], colors: new Set() };
    const r = planRematch([sku({}), sku({}), sku({})], M2);
    if (r.changes.length) expect(r.changes[0].rows).toBe(3);
  });
});
