import { describe, it, expect } from 'vitest';
import { blankLine, lineAmount, sumLines, sumQty, skuToLine, effectiveTotal, reconcileLines, N } from '../orderFormModel.js';

describe('orderFormModel — line unit-price', () => {
  it('N: number-or-0', () => { expect(N('12.5')).toBe(12.5); expect(N('')).toBe(0); expect(N(null)).toBe(0); });

  it('blankLine: โหมด pick · qty 1 · ราคาว่าง', () => {
    const l = blankLine();
    expect(l.mode).toBe('pick'); expect(l.qty).toBe('1'); expect(l.price).toBe(''); expect(l.id).toBe(null);
  });

  it('lineAmount: บรรทัดใหม่ = qty × price', () => {
    expect(lineAmount({ qty: '3', price: '100' })).toBe(300);
    expect(lineAmount({ qty: '2', price: '99.5' })).toBe(199);
  });

  // B1 — หัวใจ: sku เดิม ยอดหารไม่ลงตัว → เปิด-บันทึกเฉยๆ ยอดต้องเป๊ะเดิม ไม่ drift จากปัดเศษ
  it('B1: round-trip ไม่ drift — ฿1,000 / 3 ตัว คืน 1000 เป๊ะเมื่อไม่แตะ', () => {
    const l = skuToLine({ id: 'x', qty: 3, line_sales: 1000, design: 'A' });
    expect(l.price).toBe('333.33');       // ราคา/ตัว โชว์ปัด 2 ตำแหน่ง
    expect(lineAmount(l)).toBe(1000);     // แต่ยอดบรรทัดคืนของเดิมเป๊ะ (ไม่ใช่ 999.99)
  });

  it('B1: แก้จำนวน → คิดใหม่ qty × price', () => {
    const l = skuToLine({ id: 'x', qty: 2, line_sales: 500, design: 'A' }); // price=250
    expect(lineAmount({ ...l, qty: '4' })).toBe(1000);   // เปลี่ยนจำนวน → 4×250
  });

  it('B1: แก้ราคา → คิดใหม่ qty × price', () => {
    const l = skuToLine({ id: 'x', qty: 2, line_sales: 500, design: 'A' });
    expect(lineAmount({ ...l, price: '300' })).toBe(600);
  });

  // B3 — ลายไม่อยู่ในแคตตาล็อก → โหมด manual
  it('B3: known=false → โหมด "พิมพ์เอง"', () => {
    expect(skuToLine({ id: 'x', qty: 1, line_sales: 100 }, false).mode).toBe('manual');
    expect(skuToLine({ id: 'x', qty: 1, line_sales: 100 }, true).mode).toBe('pick');
  });

  it('sumLines / sumQty: รวมหลายบรรทัด (ผสม sku เดิม + ใหม่)', () => {
    const lines = [
      skuToLine({ id: 'a', qty: 3, line_sales: 1000, design: 'A' }), // 1000
      { qty: '2', price: '150' },                                     // 300
    ];
    expect(sumLines(lines)).toBe(1300);
    expect(sumQty(lines)).toBe(5);
  });

  it('effectiveTotal: กรอกเอง > 0 ใช้ที่กรอก · ว่าง = ผลรวมรายการ', () => {
    const lines = [{ qty: '2', price: '100' }];
    expect(effectiveTotal({ total: '250', lines })).toBe(250);
    expect(effectiveTotal({ total: '', lines })).toBe(200);
    expect(effectiveTotal({ total: '0', lines })).toBe(200);
  });

  it('skuToLine: qty 0 กันหารศูนย์ (price = line_sales)', () => {
    const l = skuToLine({ id: 'x', qty: 0, line_sales: 50, design: 'A' });
    expect(l.price).toBe('50'); expect(lineAmount(l)).toBe(50);
  });
});

describe('orderFormModel — reconcileLines (กระทบยอดรายการ vs ราคาเสื้อ)', () => {
  const lines = [{ qty: '1', price: '279' }];
  it('มีค่าส่ง: รายการ 279 + ส่ง 30 = ยอด 309 → match (เดิมเตือนผิด)', () => {
    const r = reconcileLines({ lines, total: '309', shipping: '30', discount: '', vat: '', subtotal: '' });
    expect(r.match).toBe(true); expect(r.expected).toBe(279); expect(r.parts).toEqual([{ label: 'ค่าส่ง', val: 30 }]); expect(r.basis).toBe('total');
  });
  it('ส่วนลด: รายการ 300 − ลด 21 = ยอด 279 → match', () => {
    const r = reconcileLines({ lines: [{ qty: '1', price: '300' }], total: '279', discount: '21', shipping: '', vat: '', subtotal: '' });
    expect(r.match).toBe(true); expect(r.expected).toBe(300);
  });
  it('ไม่ตรงจริง: รายการ 279 แต่ยอด 309 ไม่มีค่าส่ง → mismatch', () => {
    const r = reconcileLines({ lines, total: '309', shipping: '', discount: '', vat: '', subtotal: '' });
    expect(r.match).toBe(false); expect(r.expected).toBe(309);
  });
  it('ราคาเสื้อกรอกเอง = ฐานเทียบ', () => {
    const r = reconcileLines({ lines, total: '309', subtotal: '279', shipping: '30', discount: '', vat: '' });
    expect(r.match).toBe(true); expect(r.basis).toBe('subtotal');
  });
  it('ฟอร์มเปล่า → null (ไม่โชว์ ✓ เขียวหลอก)', () => {
    expect(reconcileLines({ lines: [{ qty: '1', price: '' }], total: '', shipping: '', discount: '', vat: '', subtotal: '' })).toBeNull();
  });
});
