import { describe, it, expect } from 'vitest';
import { commissionFor, commissionDisplay, targetsByPerson, targetId } from '../targets.js';

// Characterization tests — ล็อกพฤติกรรมสูตร "คอมมิชชั่น" (money-critical) ก่อน refactor
describe('commissionFor', () => {
  it('ไม่มี target → 0', () => {
    expect(commissionFor(1000, null)).toBe(0);
    expect(commissionFor(1000, undefined)).toBe(0);
    expect(commissionFor(1000, 0)).toBe(0);
  });
  it('flat commission_rate = sales × rate%', () => {
    expect(commissionFor(1000, { commission_rate: 5 })).toBe(50);
    expect(commissionFor(0, { commission_rate: 5 })).toBe(0);
    expect(commissionFor('2000', { commission_rate: 2.5 })).toBe(50);
  });
  it('tiers ว่าง → ตกไปใช้ flat rate', () => {
    expect(commissionFor(1000, { commission_rate: 5, tiers: [] })).toBe(50);
  });
  it('มี rate แต่ไม่มีเป้ายอด (sales_target=0) → คิดคอมจากยอดทั้งหมด × rate', () => {
    // สถานการณ์จริง: เซลล์ตั้ง 3% ไว้ ไม่ตั้งเป้ายอด → คอม = ยอดขายเดือน × 3%
    expect(commissionFor(9743, { sales_target: 0, commission_rate: 3 })).toBeCloseTo(292.29, 2);
  });
  it('tiers = เลือก tier สูงสุดที่ sales ถึง (min) แล้วคูณ rate ของ tier นั้น', () => {
    const t = { tiers: [{ min: 0, rate: 3 }, { min: 3000, rate: 5 }, { min: 10000, rate: 7 }] };
    expect(commissionFor(5000, t)).toBe(250);   // เข้า tier 3000 → 5%
    expect(commissionFor(3000, t)).toBe(150);   // ขอบพอดี → 5%
    expect(commissionFor(12000, t)).toBe(840);  // tier 10000 → 7%
    expect(commissionFor(0, t)).toBe(0);        // tier 0 → 3% ของ 0 = 0
  });
  it('ต่ำกว่า min ของทุก tier → 0', () => {
    expect(commissionFor(100, { tiers: [{ min: 1000, rate: 5 }] })).toBe(0);
  });
  it('ข้าม tier ที่ rate = null', () => {
    expect(commissionFor(1000, { tiers: [{ min: 0, rate: null }, { min: 0, rate: 4 }] })).toBe(40);
  });
});

describe('commissionDisplay — decision เป้า/คอม (SellerCard 3 กรณี)', () => {
  it('มีเป้ายอด → mode target', () => {
    expect(commissionDisplay({ target: 10000, comm: 300, tgt: { sales_target: 10000, commission_rate: 3 } }))
      .toEqual({ mode: 'target', comm: 300 });
  });
  it('ไม่มีเป้ายอด แต่มีคอม (flat rate) → mode commOnly + rateLabel เรต', () => {
    expect(commissionDisplay({ target: 0, comm: 292.29, tgt: { sales_target: 0, commission_rate: 3 } }))
      .toEqual({ mode: 'commOnly', comm: 292.29, rateLabel: 'เรต 3%' });
  });
  it('ไม่มีเป้ายอด คอมแบบขั้นบันได → rateLabel = ขั้นบันได', () => {
    expect(commissionDisplay({ target: 0, comm: 500, tgt: { tiers: [{ min: 0, rate: 5 }] } }).rateLabel)
      .toBe('ขั้นบันได');
  });
  it('ไม่มีทั้งเป้าและคอม → mode none', () => {
    expect(commissionDisplay({ target: 0, comm: 0 })).toEqual({ mode: 'none' });
    expect(commissionDisplay({})).toEqual({ mode: 'none' });
    expect(commissionDisplay(null)).toEqual({ mode: 'none' });
  });
});

describe('targetsByPerson / targetId', () => {
  it('targetId = salesperson::month', () => expect(targetId('A', '2026-07')).toBe('A::2026-07'));
  it('map salesperson → row', () => {
    const m = targetsByPerson([{ salesperson: 'A', x: 1 }, { salesperson: 'B', x: 2 }]);
    expect(m.get('A').x).toBe(1);
    expect(m.get('B').x).toBe(2);
    expect(m.size).toBe(2);
  });
  it('rows ว่าง/undefined → map ว่าง', () => {
    expect(targetsByPerson(null).size).toBe(0);
    expect(targetsByPerson([]).size).toBe(0);
  });
});

/* ============================================================
   saveTarget ต้องไม่ลบของที่ผู้เรียกไม่ได้ส่งมา (8 ก.ย. 69)
   ============================================================
   บั๊กจริง: saveTarget มี default `tiers = null, note = ''` แล้วเขียน `tiers: tiers || null` เสมอ
   ผู้เรียกเดียวในระบบ (views-settings-tabs.jsx) ส่งแค่ sales_target + commission_rate
   → ทุกครั้งที่แอดมินแก้เป้ายอด (auto-save on blur) ขั้นบันไดค่าคอมถูกล้างเป็น NULL เงียบ ๆ
   แต่ commissionFor() อ่าน tiers อยู่จริง → ค่าคอมกลับไปใช้ flat rate ซึ่งอาจเป็น 0 = ฿0 ทั้งกระดาน
   ============================================================ */
describe('saveTarget — ไม่ลบฟิลด์ที่ไม่ได้ส่งมา', () => {
  it('buildTargetRow: ไม่ส่ง tiers/note → ต้องไม่มีคีย์นั้นในแถวที่เขียน (ของเดิมใน DB รอด)', async () => {
    const { buildTargetRow } = await import('../targets.js');
    const row = buildTargetRow({ salesperson: 'ฟ้า', month: '2026-09', sales_target: 500000, commission_rate: 3 });
    expect(row.sales_target).toBe(500000);
    expect(row.commission_rate).toBe(3);
    expect('tiers' in row).toBe(false);
    expect('note' in row).toBe(false);
  });

  it('ส่ง tiers มา → เขียนตามที่ส่ง', async () => {
    const { buildTargetRow } = await import('../targets.js');
    const tiers = [{ min: 500000, rate: 5 }];
    expect(buildTargetRow({ salesperson: 'ฟ้า', month: '2026-09', tiers }).tiers).toEqual(tiers);
  });

  it('ส่ง tiers = null มาตรง ๆ → ตั้งใจล้าง เขียน null ได้', async () => {
    const { buildTargetRow } = await import('../targets.js');
    const row = buildTargetRow({ salesperson: 'ฟ้า', month: '2026-09', tiers: null });
    expect('tiers' in row).toBe(true);
    expect(row.tiers).toBeNull();
  });

  it('ขั้นบันไดยังทำงานหลังเซฟเป้า (คอมไม่ตกไป flat rate)', async () => {
    const { commissionFor } = await import('../targets.js');
    const target = { commission_rate: 0, tiers: [{ min: 500000, rate: 5 }, { min: 0, rate: 2 }] };
    expect(commissionFor(600000, target)).toBe(30000);      // ใช้ขั้น 5%
    expect(commissionFor(600000, { commission_rate: 0 })).toBe(0);   // ถ้า tiers ถูกล้าง = ฿0
  });
});
