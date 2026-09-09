/* ออเดอร์ที่ "วันที่หลัง override" อยู่ในช่วงที่ดู แต่ "วันที่ดิบ" ไม่อยู่
   เกิดเมื่อแก้วันที่ออเดอร์ แล้ว re-import มาร์เก็ตเพลสเขียนแถวจริงกลับเป็นวันเดิม
   → query กรอง order_date ดิบฝั่ง server จึงไม่ดึงมา = เงินหายจากรายงานเดือนนั้น */
import { describe, it, expect } from 'vitest';
import { strayOverrideOrderNos, dedupeOrders } from '../saleData.js';

const ov = (id, d) => ({ order_id: id, order_date: d });

describe('strayOverrideOrderNos', () => {
  it('เลือกเฉพาะ override ที่วันที่ใหม่อยู่ในช่วง', () => {
    const map = {
      'shopee:A1': ov('shopee:A1', '2026-09-02'),   // อยู่ในช่วง → ต้องดึงเพิ่ม
      'shopee:A2': ov('shopee:A2', '2026-08-15'),   // นอกช่วง
      'shopee:A3': ov('shopee:A3', null),           // ไม่ได้แก้วันที่
    };
    expect(strayOverrideOrderNos(map, '2026-09-01', '2026-09-30')).toEqual(['A1']);
  });
  it('order_no ที่มี ":" ในตัวเอง ต้องตัดเฉพาะ source ออก', () => {
    const map = { 'shipnity:INV:2026:77': ov('shipnity:INV:2026:77', '2026-09-05') };
    expect(strayOverrideOrderNos(map, '2026-09-01', '2026-09-30')).toEqual(['INV:2026:77']);
  });
  it('ไม่ซ้ำ และไม่มีค่าว่าง', () => {
    const map = {
      'a:X': ov('a:X', '2026-09-03'), 'b:X': ov('b:X', '2026-09-04'), 'c:': ov('c:', '2026-09-05'),
    };
    expect(strayOverrideOrderNos(map, '2026-09-01', '2026-09-30')).toEqual(['X']);
  });
  it('ไม่มี override / ช่วงว่าง = ไม่ต้องยิง query เพิ่ม', () => {
    expect(strayOverrideOrderNos({}, '2026-09-01', '2026-09-30')).toEqual([]);
    expect(strayOverrideOrderNos(null, '2026-09-01', '2026-09-30')).toEqual([]);
    expect(strayOverrideOrderNos({ 'a:X': ov('a:X', '2026-09-03') }, '', '')).toEqual([]);
  });
});

/* ============================================================
   บั๊กเงินคูณสอง (เจอ 3 ก.ย. 69 จาก preview ข้อมูลจริง)
   ============================================================
   override layer เขียนแถวไว้ให้ "ทุกใบ" ที่เคยแก้ในเว็บ พร้อม order_date
   strayOverrideOrderNos จึงคืน order_no ของใบที่ **ดึงมาแล้ว** ในช่วงนั้นด้วย
   ผู้เรียกเอาไปต่อท้ายด้วย [...base, ...strays] → ทุกใบซ้ำ 2 รอบ
   ผลจริงที่วัดได้: ออเดอร์ 39 ใบ ฿18,911 → กลายเป็น 78 ใบ ฿37,822 พอดี 2 เท่า
   ทั้งหน้าแรก · เกจเป้าเดือน · เป้ารายช่องทาง · อันดับเซลล์ · ประสิทธิภาพเซลล์
   (รายงานขายไม่โดน เพราะไม่ได้ใช้ path นี้ → เลข 2 ชุดในหน้าเดียวกัน)
   ============================================================ */
describe('กันดึงใบเดิมซ้ำ (บั๊กยอดคูณสอง)', () => {
  const row = (source, no, sales, date) => ({ source, order_no: no, sales, order_date: date });

  it('ข้าม override ของใบที่ดึงมาแล้ว — ไม่ยิง query ซ้ำ', () => {
    const map = {
      'shipnity:A1': ov('shipnity:A1', '2026-09-02'),   // มีใน base แล้ว → ข้าม
      'shipnity:A9': ov('shipnity:A9', '2026-09-02'),   // ไม่มีใน base → ต้องดึงเพิ่มจริง
    };
    const base = [row('shipnity', 'A1', 100, '2026-09-02')];
    expect(strayOverrideOrderNos(map, '2026-09-01', '2026-09-30', base)).toEqual(['A9']);
  });

  it('เลขออเดอร์เดียวกันคนละช่องทาง = คนละใบ ต้องไม่ถูกข้าม', () => {
    const map = { 'shopee:A1': ov('shopee:A1', '2026-09-02') };
    const base = [row('shipnity', 'A1', 100, '2026-09-02')];   // คนละ source
    expect(strayOverrideOrderNos(map, '2026-09-01', '2026-09-30', base)).toEqual(['A1']);
  });

  it('ไม่ส่ง base มา = ทำงานเหมือนเดิม (ผู้เรียกเก่าไม่พัง)', () => {
    const map = { 'shipnity:A1': ov('shipnity:A1', '2026-09-02') };
    expect(strayOverrideOrderNos(map, '2026-09-01', '2026-09-30')).toEqual(['A1']);
  });

  it('dedupeOrders: ต่อ base กับ stray แล้วยอดต้องไม่บวม', () => {
    const base = [row('shipnity', 'A1', 100, '2026-09-02'), row('shipnity', 'A2', 50, '2026-09-02')];
    const strays = [row('shipnity', 'A1', 100, '2026-09-02'), row('shipnity', 'A3', 25, '2026-09-02')];
    const out = dedupeOrders([...base, ...strays]);
    expect(out.map(o => o.order_no)).toEqual(['A1', 'A2', 'A3']);
    expect(out.reduce((a, o) => a + o.sales, 0)).toBe(175);
  });

  it('dedupeOrders: เลขซ้ำข้ามช่องทาง = คนละใบ ห้ามยุบ', () => {
    const out = dedupeOrders([row('shipnity', 'A1', 100), row('shopee', 'A1', 70)]);
    expect(out).toHaveLength(2);
    expect(out.reduce((a, o) => a + o.sales, 0)).toBe(170);
  });

  it('dedupeOrders: ใบที่ไม่มีเลขออเดอร์ ห้ามยุบรวมกัน (จับคู่ไม่ได้ ≠ ใบเดียวกัน)', () => {
    const out = dedupeOrders([row('manual', '', 10), row('manual', '', 20)]);
    expect(out).toHaveLength(2);
  });

  it('dedupeOrders: เก็บแถวแรกไว้ (base ชนะ stray)', () => {
    const out = dedupeOrders([row('shipnity', 'A1', 100), row('shipnity', 'A1', 999)]);
    expect(out).toEqual([row('shipnity', 'A1', 100)]);
  });
});
