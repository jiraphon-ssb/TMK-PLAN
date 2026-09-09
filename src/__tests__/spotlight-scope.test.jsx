// @vitest-environment jsdom
/* ============================================================
   ⌘K ต้องกรองสิทธิ์ — security regression (3 ก.ย. 69)
   ============================================================
   RLS เป็น Tier 1/2 (authenticated อ่านได้ทุกแถว) → ตัวกรองฝั่งเว็บคือด่านเดียว
   หน้าออเดอร์/ประสิทธิภาพเซลล์ใช้ orderVisibleTo เสมอ แต่ ⌘K เคยยิงตรงไม่กรองเลย
   → editor พิมพ์ชื่อลูกค้าคนอื่นแล้วเห็นเลขออเดอร์ + ยอดเงิน + เบอร์โทร ของเซลล์คนอื่น

   เทสนี้ดัก query จริงที่ยิงออกไป แล้วยืนยันว่ามี .in('salesperson', ชื่อฉัน) ติดไปด้วย
   ถ้าใครถอดตัวกรองออก เทสนี้ต้องแดง
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const CALLS = [];   // { table, in: [[col, vals]], data }

const ORDER_ROW = { order_no: 'L1', customer_name: 'ลูกค้าคนอื่น', sales: 5000, order_date: '2026-09-03', salesperson: 'คนอื่น', status: '' };
const CUST_ROW = { customer_code: 'C1', name: 'ลูกค้าคนอื่น', phone: '0800000000' };

let failAll = false;
let failCustomers = false;

vi.mock('../lib/supabaseClient.js', () => ({
  supabase: {
    from: (table) => {
      const rec = { table, in: [] };
      CALLS.push(rec);
      const q = {
        select: () => q, or: () => q, order: () => q, limit: () => q, eq: () => q,
        in: (col, vals) => { rec.in.push([col, vals]); return q; },
        then: (res) => {
          if (failAll) return res({ data: null, error: { message: 'boom', code: '500' } });
          if (failCustomers && table === 'tmk_mp_customers') return res({ data: null, error: { message: 'boom', code: '500' } });
          if (table === 'tmk_mp_orders') {
            // query ที่สองของ non-admin = เช็คว่าลูกค้ารายนี้เป็นของฉันไหม (in customer_code)
            const isOwnCheck = rec.in.some(([c]) => c === 'customer_code');
            return res({ data: isOwnCheck ? [] : [ORDER_ROW], error: null });
          }
          return res({ data: [CUST_ROW], error: null });
        },
      };
      return q;
    },
  },
  // ต้องมีคู่กับ supabase เสมอ — saleData ใช้ตัวนี้ตัดสินว่า "ตั้งค่าฐานข้อมูลแล้วหรือยัง"
  // ถ้าลืม เทสจะไปผูกกับว่าเครื่องนั้นมีไฟล์ .env หรือเปล่า (CI ไม่มี = แดง)
  isSupabaseConfigured: true,
}));
vi.mock('../lib/productCatalog.js', () => ({ fetchProductDesigns: async () => ({ list: [] }) }));
vi.mock('../data.js', () => ({ TMK: { tasks: [], campaigns: [], staff: [], channels: [] } }));

let USER = null;
// ⚠️ ของจริงคืน { user } — เคย mock เป็น USER ตรง ๆ ทำให้เทสเขียวทั้งที่โค้ดอ่าน role ไม่เจอ
vi.mock('../userContext.jsx', () => ({ useUser: () => ({ user: USER }) }));

const { Spotlight } = await import('../Spotlight.jsx');

const typeQuery = async (text) => {
  render(<Spotlight onClose={() => {}} onGo={() => {}} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  await waitFor(() => expect(CALLS.length).toBeGreaterThan(0), { timeout: 3000 });
};

beforeEach(() => { CALLS.length = 0; failAll = false; failCustomers = false; localStorage.clear(); });
afterEach(() => { cleanup(); vi.clearAllTimers(); });

describe('⌘K ขอบเขตตามสิทธิ์', () => {
  it('editor: query ออเดอร์ต้องผูก salesperson = ชื่อ/อีเมลตัวเอง', async () => {
    USER = { role: 'editor', name: 'ฟ้า', email: 'fah@tmk.co' };
    await typeQuery('ลูกค้า');
    const ordQ = CALLS.find(c => c.table === 'tmk_mp_orders');
    expect(ordQ).toBeTruthy();
    const sp = ordQ.in.find(([col]) => col === 'salesperson');
    expect(sp, 'ยิงออเดอร์โดยไม่กรอง salesperson = ข้อมูลรั่ว').toBeTruthy();
    expect(sp[1]).toEqual(['ฟ้า', 'fah@tmk.co']);
  });

  it('viewer ก็ต้องถูกกรองเหมือนกัน', async () => {
    USER = { role: 'viewer', name: 'วิว', email: 'view@tmk.co' };
    await typeQuery('ลูกค้า');
    const ordQ = CALLS.find(c => c.table === 'tmk_mp_orders');
    expect(ordQ.in.find(([col]) => col === 'salesperson')).toBeTruthy();
  });

  it('ยังไม่รู้ว่าใคร (user = null) → fail-closed ไม่ใช่เปิดหมด', async () => {
    USER = null;
    await typeQuery('ลูกค้า');
    const ordQ = CALLS.find(c => c.table === 'tmk_mp_orders');
    const sp = ordQ.in.find(([col]) => col === 'salesperson');
    expect(sp).toBeTruthy();
    expect(sp[1]).toEqual([]);        // in([]) = 0 แถว = ปิดไว้ก่อน
  });

  it('admin เห็นทั้งทีมตามเดิม — ต้องไม่มีตัวกรอง salesperson', async () => {
    USER = { role: 'admin', name: 'อาร์ต', email: 'art@tmk.co' };
    await typeQuery('ลูกค้า');
    const ordQ = CALLS.find(c => c.table === 'tmk_mp_orders');
    expect(ordQ.in.find(([col]) => col === 'salesperson')).toBeFalsy();
    expect(await screen.findByText(/L1/)).toBeInTheDocument();
  });

  it('editor: ลูกค้าที่ไม่เคยขายให้ ต้องไม่โผล่ในผลค้นหา', async () => {
    USER = { role: 'editor', name: 'ฟ้า', email: 'fah@tmk.co' };
    await typeQuery('ลูกค้า');
    // mock ตอบว่าไม่มีออเดอร์ของฉันกับลูกค้ารายนี้ → ต้องถูกตัดทิ้ง
    await waitFor(() => expect(screen.queryByText('0800000000')).not.toBeInTheDocument());
  });

  it('อ่านไม่สำเร็จ "บางส่วน" ก็ต้องเตือน แม้จะมีผลลัพธ์อยู่', async () => {
    // orders สำเร็จ (มี L1) แต่ customers พัง → เดิมไม่เตือนเลย ผู้ใช้สรุปว่า "ไม่มีลูกค้าคนนี้"
    USER = { role: 'admin', name: 'อาร์ต', email: 'art@tmk.co' };
    failCustomers = true;
    await typeQuery('ลูกค้า');
    expect(await screen.findByText(/L1/)).toBeInTheDocument();
    expect(await screen.findByText(/ผลค้นหาไม่ครบ/)).toBeInTheDocument();
  });

  it('recents ผูกกับอีเมลผู้ใช้ — เปลี่ยนคนล็อกอินแล้วต้องไม่เห็นของคนก่อน', async () => {
    const secret = [{ cat: 'ออเดอร์', icon: 'listChecks', label: 'L9999', sub: 'ลูกค้าลับ · ฿99,999', go: ['catalog', 'orders'] }];
    // ของที่ค้างอยู่จริงบนเครื่องที่ใช้ร่วมกัน — ทั้งคีย์รุ่นเก่า (ไม่ผูกผู้ใช้) และของแอดมิน
    localStorage.setItem('tmk-spotlight-recent', JSON.stringify(secret));
    localStorage.setItem('tmk-spotlight-recent:admin@tmk.co', JSON.stringify(secret));
    USER = { role: 'viewer', name: 'วิว', email: 'view@tmk.co' };
    render(<Spotlight onClose={() => {}} onGo={() => {}} />);
    // ไม่พิมพ์อะไร = โชว์ "ล่าสุด" — ของ viewer ต้องว่าง
    expect(screen.queryByText('L9999')).not.toBeInTheDocument();
    expect(screen.queryByText(/ลูกค้าลับ/)).not.toBeInTheDocument();
  });

  it('กดรายการของหน้าที่ถูกล็อก (go คืน false) → ต้องไม่จดเป็น "ล่าสุด"', async () => {
    USER = { role: 'editor', name: 'ฟ้า', email: 'fah@tmk.co' };
    render(<Spotlight onClose={() => {}} onGo={() => false} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'หน้าหลัก' } });
    const item = await screen.findByText(/ไปที่ หน้าหลัก/);
    fireEvent.click(item);
    expect(localStorage.getItem('tmk-spotlight-recent:fah@tmk.co')).toBeNull();
  });

  it('อ่านไม่สำเร็จ ต้องไม่บอกว่า "ไม่พบผลลัพธ์"', async () => {
    USER = { role: 'admin', name: 'อาร์ต', email: 'art@tmk.co' };
    failAll = true;
    await typeQuery('ลูกค้า');
    expect(await screen.findByText(/ค้นที่ฐานข้อมูลไม่สำเร็จ/)).toBeInTheDocument();
    expect(screen.queryByText(/ไม่พบผลลัพธ์/)).not.toBeInTheDocument();
  });
});

describe('recents ต้องกรองสิทธิ์ตอนอ่านด้วย', () => {
  const seed = (email) => localStorage.setItem(`tmk-spotlight-recent:${email}`, JSON.stringify([
    { cat: 'ออเดอร์', icon: 'listChecks', label: 'L777', sub: 'ลูกค้าลับ · ฿77,777', go: ['catalog', 'orders'] },
    { cat: 'นำทาง', icon: 'arrowR', label: 'ไปที่ หน้าหลัก', sub: '', go: ['home'] },
  ]));

  it('⛔ เคยเป็นแอดมินแล้วถูกลดสิทธิ์ → ต้องไม่เห็นออเดอร์/ลูกค้าใน "ล่าสุด"', async () => {
    seed('fah@tmk.co');
    USER = { role: 'editor', name: 'ฟ้า', email: 'fah@tmk.co' };
    render(<Spotlight onClose={() => {}} onGo={() => {}} />);
    expect(screen.queryByText('L777')).not.toBeInTheDocument();
    expect(screen.queryByText(/ลูกค้าลับ/)).not.toBeInTheDocument();
    expect(screen.getByText(/ไปที่ หน้าหลัก/)).toBeInTheDocument();   // รายการนำทางยังอยู่
  });

  it('แอดมินยังเห็นครบเหมือนเดิม', async () => {
    seed('art@tmk.co');
    USER = { role: 'admin', name: 'อาร์ต', email: 'art@tmk.co' };
    render(<Spotlight onClose={() => {}} onGo={() => {}} />);
    expect(screen.getByText('L777')).toBeInTheDocument();
  });
});
