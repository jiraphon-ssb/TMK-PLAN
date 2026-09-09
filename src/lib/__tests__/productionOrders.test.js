import { describe, it, expect } from 'vitest';
import { nextPoId, poTotals, poSummary, incomingBySku, poPeople, poStatusMeta, isPoOpen, PO_STATUS } from '../productionOrders.js';
import { skuKey } from '../stockCount.js';

const po = (o) => ({ id: 'PO-690824-001', order_date: '2026-08-24', status: 'ordered', responsible: 'อาร์ต', items: [], ...o });
const it_ = (o) => ({ design: 'ชบา', color: 'ดำ', size: 'M', qty: 10, received: 0, ...o });

describe('เลขใบสั่งผลิต', () => {
  it('รันเลขต่อในวันเดียวกัน (ปี พ.ศ.)', () => {
    expect(nextPoId([], '2026-08-24')).toBe('PO-690824-001');
    expect(nextPoId([{ id: 'PO-690824-001' }, { id: 'PO-690824-002' }], '2026-08-24')).toBe('PO-690824-003');
    expect(nextPoId([{ id: 'PO-690823-009' }], '2026-08-24')).toBe('PO-690824-001');   // คนละวัน = เริ่มใหม่
  });
});

describe('สรุปจำนวนในใบ', () => {
  it('นับสั่ง/รับแล้ว/ค้าง + %', () => {
    const p = po({ items: [it_({ qty: 10, received: 4 }), it_({ size: 'L', qty: 6, received: 6 })] });
    expect(poTotals(p)).toEqual({ lines: 2, qty: 16, received: 10, pending: 6, pct: 63 });
  });
  it('ใบเปล่า/ไม่มี items ไม่พัง', () => {
    expect(poTotals(po())).toEqual({ lines: 0, qty: 0, received: 0, pending: 0, pct: 0 });
    expect(poTotals(null)).toEqual({ lines: 0, qty: 0, received: 0, pending: 0, pct: 0 });
  });
  it('รับเกินที่สั่ง ไม่ทำให้ค้างติดลบ', () => {
    expect(poTotals(po({ items: [it_({ qty: 5, received: 8 })] })).pending).toBe(0);
  });
});

describe('สถานะ + สรุปรวม', () => {
  it('ใบที่รับครบ/ยกเลิกแล้ว ไม่นับเป็นค้าง', () => {
    const list = [
      po({ id: 'A', items: [it_({ qty: 10 })] }),
      po({ id: 'B', status: 'received', items: [it_({ qty: 20, received: 20 })] }),
      po({ id: 'C', status: 'cancelled', items: [it_({ qty: 30 })] }),
      po({ id: 'D', status: 'producing', items: [it_({ qty: 5, received: 2 })] }),
    ];
    expect(poSummary(list)).toEqual({ open: 2, all: 4, qty: 15, pending: 13 });
    expect(isPoOpen(list[1])).toBe(false);
    expect(poStatusMeta('producing').label).toBe('กำลังผลิต');
    expect(PO_STATUS.map(s => s.id)).toEqual(['draft', 'ordered', 'producing', 'received', 'cancelled']);
  });
  it('ของที่กำลังจะเข้า แยกตาม SKU (เฉพาะใบที่ยังไม่ปิด)', () => {
    const list = [
      po({ id: 'A', items: [it_({ qty: 10, received: 3 }), it_({ color: 'ขาว', qty: 4 })] }),
      po({ id: 'B', status: 'received', items: [it_({ qty: 99, received: 99 })] }),
    ];
    const inc = incomingBySku(list);
    expect(inc[skuKey('ชบา', 'ดำ', 'M')]).toBe(7);
    expect(inc[skuKey('ชบา', 'ขาว', 'M')]).toBe(4);
    expect(Object.keys(inc).length).toBe(2);
  });
  it('poPeople = รายชื่อผู้รับผิดชอบ (แยกรายคน)', () => {
    expect(poPeople([po({ responsible: 'อาร์ต' }), po({ responsible: 'ฟ้า' }), po({ responsible: '' }), po({ responsible: 'อาร์ต' })])).toEqual(['ฟ้า', 'อาร์ต']);   // เรียงตามตัวอักษรไทย
  });
});

/* buildReceiveAnchors ถูกลบ 2 ก.ย. 69 (PLAN-STOCK-V2 ระยะ 4)
   มันคำนวณ "คงเหลือปัจจุบัน + ที่รับ" ฝั่งเบราว์เซอร์ = read-modify-write บนข้อมูลเงิน
   และถ้าเขียนคู่กับ move จะทำให้ของที่รับถูกนับซ้ำเมื่อ import ของเก่าอีกรอบ
   พฤติกรรมการรับเข้าย้ายไป movesFromReceive() → เทสอยู่ที่ lib/__tests__/stockMoves.test.js */
