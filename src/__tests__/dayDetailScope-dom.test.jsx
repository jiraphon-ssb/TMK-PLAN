// @vitest-environment jsdom
// ============================================================
// popup รายละเอียดวัน — ขอบเขตที่ user ตัดสิน 9 ก.ย. 69
// ============================================================
// เซลล์กดแท่งกราฟ "ยอดขายรายวัน" ในหน้าประสิทธิภาพเซลล์ (ภาพรวมทีม) →
// เห็น **ทั้งวันของทุกเซลล์**: ยอด · ออเดอร์ทุกใบ · คนทักรายคน · %ปิด
// เป็น "ข้อยกเว้นเฉพาะ popup นี้" ที่ user สั่งเอง — หน้าออเดอร์/⌘K ยังคุมเหมือนเดิม
// (เดิมปุ่มถูกปิดทิ้งสำหรับ non-admin → เซลล์กดวันไหนก็ไม่มีอะไรเกิดขึ้น หาสาเหตุไม่ได้)
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DayDetailSheet } from '../dayDetailSheet.jsx';

vi.mock('../lib/appBus.js', () => ({
  canEdit: () => true, isAdmin: () => false, userEmail: () => 'fah@tmk.co',
  toast: () => {}, openModal: () => {}, goSection: () => {}, refresh: () => {}, lockedSections: () => [],
}));

const DATE = '2026-09-08';
const ord = (no, seller, sales, cust) => ({
  order_no: no, source: 'shipnity', order_date: DATE, sales, qty: 1, channel: 'Facebook',
  salesperson: seller, customer_name: cust, customer_phone: '0800000000', status: '', payment_type: 'โอน',
});
const TEAM = [ord('L1', 'FAH', 1315, 'วิไลลักษณ์'), ord('L2', 'TUKTA', 8000, 'ลูกค้าของตุ๊กตา'), ord('L3', 'PAI', 3036, 'ลูกค้าของ PAI')];
const FUNNEL = [
  { date: DATE, salesperson: 'FAH', leads: { Facebook: { new: 6, old: 12 } } },
  { date: DATE, salesperson: 'TUKTA', leads: { Facebook: { new: 10, old: 5 } } },
];

afterEach(cleanup);

const renderSeller = () => render(
  <DayDetailSheet dateISO={DATE} orders={TEAM} skus={[]} funnelRows={FUNNEL}
    scopeNote="มุมมองทั้งทีมของวันนี้ — ยอด · ออเดอร์ทุกใบ · คนทักรายคน · %ปิด ของทุกเซลล์" />);

/* ⚠️ ห้ามยืนยันด้วย body.textContent — เลข 12,351 โผล่ในตารางช่องทางด้วย
   mutation test พิสูจน์แล้ว: เปลี่ยนแถบสรุปให้ใช้ชุดที่แคบลง เทสยังเขียว
   ต้องชี้ที่กล่อง "ยอดขายรวมของวัน" / กริด day-stats ตรง ๆ */
const headlineSales = () => screen.getByText('ยอดขายรวมของวัน').parentElement.querySelector('.num').textContent;
const statVal = (label) => {
  const grid = screen.getByText('ยอดขายรวมของวัน').closest('.rounded-xl').querySelector('.day-stats');
  return [...grid.children].find(c => c.textContent.startsWith(label)).querySelector('.num').textContent.trim();
};

describe('เซลล์เปิด popup วันจากกราฟภาพรวมทีม → เห็นทั้งทีม', () => {
  it('⛔ ยอดขายรวมของวัน = ทั้งทีม (฿12,351) ไม่ใช่ ฿1,315 ของตัวเอง', () => {
    renderSeller();
    expect(headlineSales()).toContain('12,351');
    expect(headlineSales()).not.toContain('1,315');
  });

  it('⛔ ออเดอร์/คนทักในแถบสรุป = ทั้งทีม (3 ใบ · ทัก 33)', () => {
    renderSeller();
    expect(statVal('ออเดอร์')).toBe('3');
    expect(statVal('คนทัก')).toBe('33');       // 18 (FAH) + 15 (TUKTA)
  });

  it('ตารางคนทักรายคน + %ปิด เห็นทุกเซลล์', () => {
    renderSeller();
    expect(screen.getAllByText('FAH').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TUKTA').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PAI').length).toBeGreaterThan(0);   // มีออเดอร์แต่ไม่ได้กรอกคนทัก
  });

  it('⛔ รายการออเดอร์ต้องเห็นทุกใบของวันนั้น (ข้อยกเว้นที่ user สั่ง — เฉพาะ popup นี้)', () => {
    renderSeller();
    expect(screen.getByText(/วิไลลักษณ์/)).toBeTruthy();
    expect(screen.getByText(/ลูกค้าของตุ๊กตา/)).toBeTruthy();
    expect(screen.getByText(/ลูกค้าของ PAI/)).toBeTruthy();
  });

  it('แถบอธิบายขอบเขตต้องขึ้น (ให้รู้ว่ากำลังดูมุมมองทั้งทีม)', () => {
    renderSeller();
    expect(screen.getByText(/มุมมองทั้งทีมของวันนี้/)).toBeTruthy();
  });
});

describe('แอดมินเปิด popup เดิม', () => {
  it('เห็นทุกใบ + ยอดทั้งทีม ตามเดิม', () => {
    render(<DayDetailSheet dateISO={DATE} orders={TEAM} skus={[]} funnelRows={FUNNEL} />);
    expect(screen.getByText(/ลูกค้าของตุ๊กตา/)).toBeTruthy();
    expect(headlineSales()).toContain('12,351');
  });
  it('ไม่ส่ง scopeNote → ไม่ขึ้นแถบอธิบาย', () => {
    render(<DayDetailSheet dateISO={DATE} orders={TEAM} skus={[]} funnelRows={FUNNEL} />);
    expect(screen.queryByText(/มุมมองทั้งทีมของวันนี้/)).toBeNull();
  });
});
