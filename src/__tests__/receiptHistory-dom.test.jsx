// @vitest-environment jsdom
/* ============================================================
   receiptHistory-dom.test.jsx — ประวัติการส่งใบเสร็จ (ดูอย่างเดียว)
   ============================================================
   สิ่งที่ต้องถือให้ได้:
   - ค่าเริ่มต้นเห็น "เฉพาะของตัวเอง" (เซลล์ไม่ควรเห็นใบคนอื่นโดยไม่ตั้งใจ)
   - ใบที่ยกเลิกต้องยังเห็นอยู่ (โปร่งใส) แต่ไม่ถูกนับเป็นยอด
   - ดูอย่างเดียวจริง — ต้องไม่มีปุ่มแก้/ยกเลิกหลุดเข้ามา (แก้ทำที่หน้าออเดอร์ที่เดียว)
   ============================================================ */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReceiptHistory } from '../views-sale-submit.jsx';

afterEach(cleanup);

const ME = 'me@tmk.co';
const feed = [
  { id: 1, order_no: 'INV-001', uploader_email: ME, salesperson: 'แอน', channel: 'LINE', order_date: '2026-08-12', qty: 2, sales: 3000, status: 'confirmed' },
  { id: 2, order_no: 'INV-002', uploader_email: ME, salesperson: 'แอน', channel: 'Facebook', order_date: '2026-08-12', qty: 1, sales: 1800, status: 'confirmed' },
  { id: 3, order_no: 'INV-003', uploader_email: ME, salesperson: 'แอน', channel: 'LINE', order_date: '2026-08-11', qty: 1, sales: 900, status: 'void', void_reason: 'ลูกค้ายกเลิก' },
  { id: 4, order_no: 'INV-900', uploader_email: 'other@tmk.co', salesperson: 'บี', channel: 'LINE', order_date: '2026-08-12', qty: 5, sales: 9999, status: 'confirmed' },
];

const setup = (extra = {}) => render(
  <ReceiptHistory feed={feed} month="2026-08" onMonth={() => {}} canSeeTeam={false} myEmail={ME} loading={false} {...extra} />
);

describe('ReceiptHistory', () => {
  it('ค่าเริ่มต้น = เฉพาะใบของตัวเอง (ไม่ปนของคนอื่น)', () => {
    setup();
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.queryByText('INV-900')).toBeNull();   // ของคนอื่น
  });

  it('ยอดสรุปนับเฉพาะใบที่ยังใช้ได้ — ใบยกเลิกไม่เข้ายอด แต่ยังเห็นอยู่', () => {
    setup();
    expect(screen.getByText('฿4,800')).toBeInTheDocument();     // 3000+1800 (ไม่รวม 900 ที่ยกเลิก)
    expect(screen.getByText('2 ใบ')).toBeInTheDocument();
    expect(screen.getByText('INV-003')).toBeInTheDocument();     // ใบยกเลิกยังแสดง
    expect(screen.getByText(/ยกเลิก · ลูกค้ายกเลิก/)).toBeInTheDocument();
  });

  it('จัดกลุ่มตามวัน — วันใหม่อยู่บน', () => {
    const { container } = setup();
    const days = [...container.querySelectorAll('.text-\\[12px\\].font-semibold')].map(e => e.textContent);
    expect(days).toEqual(['12/08/26', '11/08/26']);
  });

  it('ค้นหาด้วยเลขที่ใบ → เหลือเฉพาะที่ตรง', () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText(/ค้นเลขที่/), { target: { value: 'INV-002' } });
    expect(screen.getByText('INV-002')).toBeInTheDocument();
    expect(screen.queryByText('INV-001')).toBeNull();
  });

  it('ค้นแล้วไม่เจอ → บอกว่าไม่ตรงตัวกรอง (ไม่ใช่ "ยังไม่มีข้อมูล") + ล้างได้', () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText(/ค้นเลขที่/), { target: { value: 'zzz' } });
    expect(screen.getByText('ไม่พบใบเสร็จที่ตรงกับที่ค้น')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ล้างตัวกรอง/ }));
    expect(screen.getByText('INV-001')).toBeInTheDocument();
  });

  it('ปุ่ม "เฉพาะที่ยกเลิก" กรองเหลือใบที่ถูกยกเลิก', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /เฉพาะที่ยกเลิก/ }));
    expect(screen.getByText('INV-003')).toBeInTheDocument();
    expect(screen.queryByText('INV-001')).toBeNull();
  });

  it('ไม่ใช่แอดมิน → ไม่มีปุ่มสลับดูทั้งทีม', () => {
    setup();
    expect(screen.queryByRole('button', { name: /ของฉัน|ทั้งทีม/ })).toBeNull();
  });

  it('แอดมินสลับเป็น "ทั้งทีม" → เห็นใบของคนอื่นด้วย', () => {
    setup({ canSeeTeam: true });
    expect(screen.queryByText('INV-900')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /ของฉัน/ }));
    expect(screen.getByText('INV-900')).toBeInTheDocument();
  });

  it('ยังไม่มีใบในเดือนนั้น → บอกว่าว่าง (คนละแบบกับค้นไม่เจอ)', () => {
    setup({ feed: [] });
    expect(screen.getByText(/ยังไม่มีใบเสร็จใน/)).toBeInTheDocument();
  });

  it('ดูอย่างเดียว — ไม่มีปุ่มแก้/ยกเลิกใบในรายการ', () => {
    setup();
    for (const name of [/^แก้/, /^ยกเลิกใบ/, /^ลบ/]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });
});
