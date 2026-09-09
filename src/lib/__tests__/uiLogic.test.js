import { describe, it, expect } from 'vitest';
import { bestWeekday, dueCounts, channelRows, safeSearchTerm, mergeReceivedItems, plusDaysISO } from '../uiLogic.js';

describe('bestWeekday — วันที่ทักเยอะสุด', () => {
  const mk = (arr) => arr.map(([leads, days]) => ({ leads, days }));
  it('เลือกวันที่ค่าเฉลี่ยสูงสุด', () => {
    // index 0=อา … 3=พุธ
    const wd = mk([[0, 0], [10, 5], [30, 5], [80, 5], [0, 0], [0, 0], [0, 0]]);
    expect(bestWeekday(wd)).toBe(3);
  });
  it('ช่วงที่ไม่มีวันจันทร์เลย ต้องไม่ค้างที่วันจันทร์ (บั๊ก 0/0 = NaN)', () => {
    const wd = mk([[0, 0], [0, 0], [20, 2], [10, 2], [40, 2], [5, 2], [0, 0]]);
    expect(bestWeekday(wd)).toBe(4);
  });
  it('ไม่มีข้อมูลเลย = null (ไม่โชว์ป้ายมั่ว)', () => {
    expect(bestWeekday(mk([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]))).toBe(null);
    expect(bestWeekday(null)).toBe(null);
  });
});

describe('dueCounts — ชิปต้องนับตรงกับตัวกรอง', () => {
  it('week รวมงานที่ครบวันนี้ (เหมือนตัวกรอง d>=0..7)', () => {
    const c = dueCounts([-2, -1, 0, 0, 3, 7, 8, null]);
    expect(c.overdue).toBe(2);
    expect(c.today).toBe(2);
    expect(c.week).toBe(4);      // 0,0,3,7
  });
  it('ว่าง = 0 ทุกช่อง', () => { expect(dueCounts([])).toEqual({ overdue: 0, today: 0, week: 0 }); });
});

describe('channelRows — ช่องที่มีคนทักแต่ปิด 0 ต้องไม่หาย', () => {
  it('รวมช่องที่ไม่มียอดขายแต่มีคนทัก', () => {
    const rows = channelRows({ Facebook: 5000 }, [{ ch: 'Facebook', leads: 50, orders: 5, closeRate: 10 }, { ch: 'LINE', leads: 30, orders: 0, closeRate: 0 }]);
    expect(rows.map(r => r.ch)).toEqual(['Facebook', 'LINE']);
    expect(rows[1].closeRate).toBe(0);
  });
  it('เรียงตามยอด แล้วค่อยตามคนทัก · ตัดแถวที่ว่างทั้งหมด', () => {
    const rows = channelRows({ A: 100, Z: 0 }, [{ ch: 'B', leads: 10 }]);
    expect(rows.map(r => r.ch)).toEqual(['A', 'B']);
  });
});

describe('safeSearchTerm', () => {
  it('ตัดอักขระที่ทำ or=(...) พัง', () => {
    expect(safeSearchTerm('สมชาย, ร้านเจ๊')).toBe('สมชาย ร้านเจ๊');
    expect(safeSearchTerm('บ.ก(1)')).toBe('บ ก 1');
    expect(safeSearchTerm('   ')).toBe('');
  });
});

describe('mergeReceivedItems — ห้ามย้อนยอดรับเข้า', () => {
  const it0 = { design: 'ชบา', color: 'ดำ', size: 'M', qty: 100, received: 0 };
  it('ฝั่งเซิร์ฟเวอร์รับไปแล้ว 50 · ฟอร์มเก่าถือ 0 → ต้องได้ 50', () => {
    const out = mergeReceivedItems([{ ...it0, received: 50 }], [it0]);
    expect(out[0].received).toBe(50);
  });
  it('ฟอร์มรับเพิ่มเป็น 80 (มากกว่าเซิร์ฟเวอร์) → ใช้ค่าใหม่', () => {
    const out = mergeReceivedItems([{ ...it0, received: 50 }], [{ ...it0, received: 80 }]);
    expect(out[0].received).toBe(80);
  });
  it('บรรทัดใหม่ที่เซิร์ฟเวอร์ไม่มี → ปล่อยตามฟอร์ม', () => {
    const out = mergeReceivedItems([], [{ ...it0, received: 3 }]);
    expect(out[0].received).toBe(3);
  });
});

describe('plusDaysISO — เวลาท้องถิ่น ไม่ใช่ UTC', () => {
  it('บวก 7 วันได้วันที่ถูก (ไม่หายไป 1 วันแบบ toISOString)', () => {
    expect(plusDaysISO('2026-08-24', 7)).toBe('2026-08-31');
    expect(plusDaysISO('2026-12-28', 7)).toBe('2027-01-04');
    expect(plusDaysISO('2026-03-01', -1)).toBe('2026-02-28');
  });
});
