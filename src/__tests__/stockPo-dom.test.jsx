/** @vitest-environment jsdom */
/* smoke test — แผงใบสั่งผลิต + popup รายวันแยกรายคน ต้อง render ได้จริง (จับ crash ที่ build/lint มองไม่เห็น) */
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { PoPanel, CountHistory } from '../views-stock.jsx';
import { DashDayDetail } from '../saleDashboardModals.jsx';

const render = (el) => {
  const div = document.createElement('div');
  const root = createRoot(div);
  act(() => root.render(el));
  const html = div.innerHTML;
  act(() => root.unmount());
  return html;
};

const pos = [
  { id: 'PO-690824-001', order_date: '2026-08-24', due_date: '2026-09-05', supplier: 'โรงงาน A', responsible: 'อาร์ต', status: 'producing', note: 'เร่งงาน', items: [{ design: 'ชบา', color: 'ดำ', size: 'M', qty: 100, received: 40 }, { design: 'ชบา', color: 'ขาว', size: 'L', qty: 50, received: 0 }] },
  { id: 'PO-690820-001', order_date: '2026-08-20', due_date: '', supplier: '', responsible: 'ฟ้า', status: 'received', items: [{ design: 'ราชพฤกษ์', color: 'กรมท่า', size: 'XL', qty: 30, received: 30 }] },
];

describe('ใบสั่งผลิต (PART 113)', () => {
  it('render รายการใบ + สถานะ + ผู้รับผิดชอบ', () => {
    const html = render(<PoPanel pos={pos} allPos={pos} missing={false} people={['อาร์ต', 'ฟ้า']} person="" setPerson={() => {}} status="all" setStatus={() => {}} mayEdit onNew={() => {}} onEdit={() => {}} onReceive={() => {}} />);
    expect(html).toContain('PO-690824-001');
    expect(html).toContain('กำลังผลิต');
    expect(html).toContain('อาร์ต');
    expect(html).toContain('สร้างใบสั่งผลิต');
  });

  it('ยังไม่ได้รัน migration → บอกชื่อไฟล์ ไม่พัง', () => {
    const html = render(<PoPanel pos={[]} allPos={[]} missing people={[]} person="" setPerson={() => {}} status="open" setStatus={() => {}} mayEdit onNew={() => {}} onEdit={() => {}} onReceive={() => {}} />);
    expect(html).toContain('20260824-production-orders.sql');
  });
});

describe('popup ออเดอร์ทั้งวัน — คนทักรายคน (PART 113)', () => {
  const D = '2026-08-23';
  const ords = [
    { order_no: 'SL1', source: 'shipnity', channel: 'Facebook', salesperson: 'FAH', sales: 92500, qty: 500, order_date: D, status: 'active', payment_type: 'โอน' },
    { order_no: 'SL2', source: 'shipnity', channel: 'LINE', salesperson: 'PAI', sales: 588, qty: 3, order_date: D, status: 'active', payment_type: 'โอน' },
  ];
  const funnelRows = [
    { salesperson: 'FAH', date: D, leads: { Facebook: { new: 40, old: 12 } } },
    { salesperson: 'PAI', date: D, leads: { LINE: { new: 30, old: 18 } } },
  ];
  it('โชว์ตารางรายคน + ทัก/ปิด/%ปิด', () => {
    const html = render(<DashDayDetail dateISO={D} ords={ords} skus={[]} funnelRows={funnelRows} onPickCustomer={() => {}} />);
    expect(html).toContain('คนทักรายคน');
    expect(html).toContain('FAH');
    expect(html).toContain('PAI');
    expect(html).toContain('52');   // ทักของ FAH = 40+12
  });
});

/* ============================================================
   PART 114 — หน้าสต็อกต้องยึด ลาย/สี/ไซซ์ จาก "สินค้า"
   ============================================================
   พิสูจน์ว่า: กด "นับ" ที่ลายหนึ่ง → ช่องนับกางตามสี × ไซซ์ ของสินค้า
   รวมถึงคู่ที่ "ไม่เคยขาย" (เดิมจะไม่ขึ้นเลย เพราะกริดมาจากยอดขายอย่างเดียว)
   ============================================================ */
describe('สต็อก: ลาย/สี/ไซซ์ มาจากสินค้า (PART 114)', () => {
  it('CountSheet กางช่องนับตามแคตตาล็อก แม้สี/ไซซ์นั้นยังไม่เคยขาย', async () => {
    vi.resetModules();
    vi.doMock('../lib/appBus.js', () => ({
      toast: () => {}, canEdit: () => true, isAdmin: () => true, userEmail: () => 'a@b.c',
      confirm: async () => true, refresh: () => {},
    }));
    vi.doMock('../dataContext.jsx', () => ({ useData: () => ({ staff: [{ name: 'อาร์ต' }] }) }));
    vi.doMock('../lib/saleRealtime.js', () => ({ useSaleRealtime: () => {}, markSaleWrite: () => {} }));
    vi.doMock('../lib/audit.js', () => ({ logAudit: () => {} }));
    vi.doMock('../lib/saleData.js', async (orig) => ({
      ...(await orig()),
      cachedFetchRange: async () => ({ data: [{ order_no: 'A1', design: 'ชบา', color: 'ดำ', size: 'M', qty: 3, order_date: '2026-08-20', status: 'active', source: 'shipnity' }] }),
      cachedFetchAll: async () => ({ data: [{ code: 'JCB111', name: 'ชบา', type: 'เสื้อโปโล', colors: 'ดำ, แดง', sizes: 'M, 3XL', status: 'พร้อมขาย' }] }),
    }));
    vi.doMock('../lib/stockData.js', async (orig) => ({
      ...(await orig()),
      fetchStockCounts: async () => ({ rows: [{ id: 's1::ชบา::ดำ::M', session_id: 's1', count_date: '2026-08-01', design: 'ชบา', color: 'ดำ', size: 'M', qty: 10, kind: 'open', created_by: '', note: '' }], missing: false }),
    }));
    vi.doMock('../lib/productionOrders.js', async (orig) => ({ ...(await orig()), fetchPurchaseOrders: async () => ({ rows: [], missing: false }) }));

    const { StockView } = await import('../views-stock.jsx');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => { root.render(<StockView />); });
    await act(async () => { await Promise.resolve(); });

    // ตารางรายลายต้องมีลายจากแคตตาล็อก
    expect(document.body.textContent).toContain('ชบา');

    // กดปุ่ม "นับ" ของแถวนั้น → เปิด CountSheet
    const btn = [...div.querySelectorAll('button')].find(b => b.textContent.trim() === 'นับ');
    expect(btn).toBeTruthy();
    await act(async () => { btn.click(); });

    const txt = document.body.textContent;
    expect(txt).toContain('ลาย (จากสินค้า)');
    expect(txt).toContain('3XL');   // ไซซ์จากสินค้า ที่ยังไม่เคยขาย → ต้องมีช่องให้นับ
    expect(txt).toContain('แดง');   // สีจากสินค้า ที่ยังไม่เคยขาย

    await act(async () => { root.unmount(); });
    div.remove();
    vi.resetModules();
  });
});

/* PART 115 — ประวัติการนับ + ผลต่างรายรอบ */
describe('ประวัติการนับ (PART 115)', () => {
  const counts = [
    { session_id: 's1', count_date: '2026-08-01', design: 'ชบา', color: 'ดำ', size: 'M', qty: 10, kind: 'open', created_by: 'a@b.c', note: 'ตั้งต้นจาก Excel', created_at: '2026-08-01T00:00:00Z' },
    { session_id: 's2', count_date: '2026-08-20', design: 'ชบา', color: 'ดำ', size: 'M', qty: 6, kind: 'count', created_by: 'a@b.c', note: 'นับสิ้นเดือน', created_at: '2026-08-20T00:00:00Z' },
  ];
  const skus = [{ design: 'ชบา', color: 'ดำ', size: 'M', qty: 3, order_date: '2026-08-10' }];
  const sessions = [
    { sessionId: 's2', date: '2026-08-20', kind: 'count', by: 'a@b.c', note: 'นับสิ้นเดือน', rows: 1, qty: 6, at: '2026-08-20T00:00:00Z' },
    { sessionId: 's1', date: '2026-08-01', kind: 'open', by: 'a@b.c', note: 'ตั้งต้นจาก Excel', rows: 1, qty: 10, at: '2026-08-01T00:00:00Z' },
  ];

  it('โชว์ทุกรอบ + ผลต่างเทียบกับที่ระบบคิด (10 − ขาย 3 = 7 · นับได้ 6 → −1)', () => {
    const html = render(<CountHistory sessions={sessions} counts={counts} skus={skus} mayEdit onOpen={() => {}} onDeleted={() => {}} />);
    expect(html).toContain('ประวัติการนับ');
    expect(html).toContain('2026-08-20');
    expect(html).toContain('-1');            // ผลต่างของรอบนับ
    expect(html).toContain('นับครั้งแรก');   // รอบตั้งต้นไม่มีอะไรให้เทียบ
  });
});
