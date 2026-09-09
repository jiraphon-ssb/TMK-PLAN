/** @vitest-environment jsdom */
/* PART 117 — popup "รายละเอียดวัน" ตัวกลางตัวเดียว (dayDetailSheet)
   คุมว่าฟีเจอร์ที่เคยกระจายอยู่ 2 ตัวมาอยู่ครบในตัวเดียว และไม่หลุดอีก:
   - เดิมมีเฉพาะฝั่งรายงานขาย : ตารางคนทักรายคน · กรองโอน/COD · เรียงลำดับ
   - เดิมมีเฉพาะฝั่งประสิทธิภาพเซล : ตารางช่องทาง · เสียงลูกค้า
   - ใหม่ทั้งคู่ : ช่องค้นหา (โผล่เมื่อออเดอร์ ≥ 8 ใบ) */
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { DayDetailSheet } from '../dayDetailSheet.jsx';

const render = (el) => {
  const div = document.createElement('div');
  const root = createRoot(div);
  act(() => root.render(el));
  const html = div.innerHTML;
  act(() => root.unmount());
  return html;
};

const D = '2026-08-23';
const ords = [
  { order_no: 'SL1', source: 'shipnity', channel: 'Facebook', salesperson: 'FAH', sales: 92500, qty: 500, order_date: D, status: 'active', payment_type: 'โอน' },
  { order_no: 'SL2', source: 'shipnity', channel: 'LINE', salesperson: 'PAI', sales: 588, qty: 3, order_date: D, status: 'active', payment_type: 'COD', cod_amount: 588 },
  { order_no: 'SL3', source: 'shipnity', channel: 'Facebook', salesperson: 'FAH', sales: 1200, qty: 4, order_date: D, status: 'active', payment_type: 'โอน' },
];
const funnelRows = [
  { salesperson: 'FAH', date: D, leads: { Facebook: { new: 40, old: 12 } }, voice: { ask: 'ถามลายใหม่', praise: '', complaint: '' } },
  { salesperson: 'PAI', date: D, leads: { LINE: { new: 30, old: 18 } } },
];

describe('DayDetailSheet — รวมฟีเจอร์ 2 popup เดิมไว้ที่เดียว', () => {
  it('มีตารางคนทักรายคน (เดิมมีเฉพาะรายงานขาย)', () => {
    const html = render(<DayDetailSheet dateISO={D} orders={ords} skus={[]} funnelRows={funnelRows} onPickCustomer={() => {}} />);
    expect(html).toContain('คนทักรายคน');
    expect(html).toContain('FAH');
    expect(html).toContain('PAI');
    expect(html).toContain('52');   // ทักของ FAH = 40+12
  });

  it('มีคนทักแยกใหม่/เก่า 4 ช่อง (แบบ popup รายคน) + %ปิดใช้สูตรกลาง', () => {
    const html = render(<DayDetailSheet dateISO={D} orders={ords} skus={[]} funnelRows={funnelRows} onPickCustomer={() => {}} />);
    expect(html).toContain('แยกใหม่/เก่า');
    expect(html).toContain('ทักรวม');
    expect(html).toContain('70');   // ใหม่ = 40 + 30
    expect(html).toContain('30');   // เก่า = 12 + 18
  });

  it('มีตารางช่องทาง (เดิมมีเฉพาะหน้าประสิทธิภาพเซล)', () => {
    const html = render(<DayDetailSheet dateISO={D} orders={ords} skus={[]} funnelRows={funnelRows} onPickCustomer={() => {}} />);
    expect(html).toContain('Facebook');
    expect(html).toContain('LINE');
  });

  it('มีเสียงลูกค้า (เดิมมีเฉพาะหน้าประสิทธิภาพเซล)', () => {
    const html = render(<DayDetailSheet dateISO={D} orders={ords} skus={[]} funnelRows={funnelRows} onPickCustomer={() => {}} />);
    expect(html).toContain('เสียงลูกค้า');
    expect(html).toContain('ถามลายใหม่');
  });

  it('มีชิปกรองโอน/COD + ตัวเลือกเรียงลำดับ (เดิมมีเฉพาะรายงานขาย)', () => {
    const html = render(<DayDetailSheet dateISO={D} orders={ords} skus={[]} funnelRows={funnelRows} onPickCustomer={() => {}} />);
    expect(html).toContain('โอน 2');
    expect(html).toContain('COD 1');
    expect(html).toContain('เรียง: ยอดมาก');
  });

  it('ปิดบล็อกเสริมได้ด้วย prop show', () => {
    const html = render(<DayDetailSheet dateISO={D} orders={ords} skus={[]} funnelRows={funnelRows} show={{ channelTable: false, voice: false }} onPickCustomer={() => {}} />);
    expect(html).toContain('คนทักรายคน');
    expect(html).not.toContain('เสียงลูกค้า');
  });

  it('ตัดออเดอร์ยกเลิกออกจากสรุปและรายการ (เงินต้องไม่รวมของที่ยกเลิก)', () => {
    const withCancel = [...ords, { order_no: 'SLX', source: 'shipnity', channel: 'Facebook', salesperson: 'FAH', sales: 999999, qty: 1, order_date: D, status: 'cancelled', payment_type: 'โอน' }];
    const html = render(<DayDetailSheet dateISO={D} orders={withCancel} skus={[]} funnelRows={funnelRows} onPickCustomer={() => {}} />);
    expect(html).not.toContain('999,999');
    expect(html).not.toContain('SLX');
  });

  it('ออเดอร์น้อยกว่า 8 ใบ → ไม่โชว์ช่องค้นหา (ไม่รกจอ)', () => {
    const html = render(<DayDetailSheet dateISO={D} orders={ords} skus={[]} funnelRows={funnelRows} onPickCustomer={() => {}} />);
    expect(html).not.toContain('ค้นหา เลขที่');
  });

  it('ไม่ส่ง onChangeDate → ไม่มีปุ่มเลื่อนวัน (caller เดิมไม่พัง)', () => {
    const html = render(<DayDetailSheet dateISO={D} orders={ords} skus={[]} funnelRows={funnelRows} onPickCustomer={() => {}} />);
    expect(html).not.toContain('เลื่อนวัน');
  });

  it('ส่ง onChangeDate + มีข้อมูลวันก่อนหน้า → โชว์ปุ่ม ◀ ▶ พร้อมวันที่แบบไทย', () => {
    const multiDay = [...ords, { order_no: 'SL0', source: 'shipnity', channel: 'Facebook', salesperson: 'FAH', sales: 300, qty: 1, order_date: '2026-08-22', status: 'active', payment_type: 'โอน' }];
    const html = render(<DayDetailSheet dateISO={D} orders={multiDay} skus={[]} funnelRows={funnelRows} onChangeDate={() => {}} onPickCustomer={() => {}} />);
    expect(html).toContain('เลื่อนวัน');
    expect(html).toContain('ก่อนหน้า');
    expect(html).toContain('23 ส.ค. 2569');   // ป้ายวันที่แบบไทย (พ.ศ.)
  });

  it('วันสุดขอบข้อมูล → ปุ่มถัดไปถูก disable (เลื่อนออกนอกชุดข้อมูลไม่ได้)', () => {
    const multiDay = [...ords, { order_no: 'SL0', source: 'shipnity', channel: 'Facebook', salesperson: 'FAH', sales: 300, qty: 1, order_date: '2026-08-22', status: 'active', payment_type: 'โอน' }];
    const html = render(<DayDetailSheet dateISO={D} orders={multiDay} skus={[]} funnelRows={funnelRows} onChangeDate={() => {}} onPickCustomer={() => {}} />);
    expect(html).toContain('disabled');   // 23 = วันสุดท้ายที่มีข้อมูล → ปุ่มถัดไป disabled
  });

  it('ออเดอร์ตั้งแต่ 8 ใบ → โชว์ช่องค้นหา', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ order_no: `SL${100 + i}`, source: 'shipnity', channel: 'Facebook', salesperson: 'FAH', sales: 500 + i, qty: 1, order_date: D, status: 'active', payment_type: 'โอน' }));
    const html = render(<DayDetailSheet dateISO={D} orders={many} skus={[]} funnelRows={funnelRows} onPickCustomer={() => {}} />);
    expect(html).toContain('ค้นหา เลขที่');
  });
});
