// @vitest-environment jsdom
// ============================================================
// เทสจอ 3 ไฟล์ใหญ่ที่เดิมไม่มีอะไรคุมเลย (9 ก.ย. 69)
// ============================================================
// views-stock 1144 บรรทัด · salePerf 991 · saleDashboard 841
// ทั้ง 3 ไฟล์นี้เส้นเงินวิ่งผ่าน แต่ที่ผ่านมาพิสูจน์ได้แค่ "build ผ่าน"
// บั๊กที่หลุดถึงผู้ใช้จริงเพราะไม่มีเทสระดับนี้:
//   · คอมเมนต์บล็อกหลุดขึ้นจอกลางหน้าประสิทธิภาพเซลล์
//   · ปุ่มเจาะรายวันกดแล้วเงียบ (ด่านสิทธิ์ปิดทิ้ง)
//   · TDZ (ใช้ตัวแปรก่อนประกาศ) = จอขาวทั้งหน้า — build จับไม่ได้
// เทสชุดนี้ยืนยัน "หน้าขึ้นจริง · ไม่ crash · ไม่มีข้อความหลุด · เลขหลักผูกถูก"
// ไม่ใช่เทสทุก interaction (นั่นเป็นงานของเทสเฉพาะทางแต่ละไฟล์)
// ============================================================
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const WF = { timeout: 8000 };

// jsdom ไม่มี ResizeObserver (Radix/recharts เรียกใช้) — ใส่ตัวเปล่าให้พอเรนเดอร์ได้
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
const TODAY = new Date();
const YM = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}`;
const D = (n) => `${YM}-${String(n).padStart(2, '0')}`;

/* ---------- ข้อมูลปลอมชุดเดียว ใช้ทั้ง 3 หน้า ---------- */
const ORDERS = [
  { order_no: 'L1', source: 'shipnity', order_date: D(3), sales: 1000, qty: 2, channel: 'Facebook', salesperson: 'ฟ้า', customer_type: 'ลูกค้าใหม่', customer_name: 'ลูกค้า ก', status: '', payment_type: 'โอน', customer_code: 'C1' },
  { order_no: 'L2', source: 'shipnity', order_date: D(4), sales: 2000, qty: 3, channel: 'LINE', salesperson: 'ตุ๊กตา', customer_type: 'ลูกค้าเก่า', customer_name: 'ลูกค้า ข', status: '', payment_type: 'COD', cod_amount: 2000, customer_code: 'C2' },
];
const SKUS = [
  { order_no: 'L1', source: 'shipnity', design: 'ลายเอ', color: 'ดำ', size: 'M', qty: 2, sales: 1000, product_code: 'A1', channel: 'Facebook', order_date: D(3) },
  { order_no: 'L2', source: 'shipnity', design: 'ลายบี', color: 'ขาว', size: 'L', qty: 3, sales: 2000, product_code: 'B1', channel: 'LINE', order_date: D(4) },
];
const FUNNEL = [{ date: D(3), salesperson: 'ฟ้า', leads: { Facebook: { new: 4, old: 2 } } }];

const okQuery = (data = []) => {
  const q = {
    select: () => q, gte: () => q, lte: () => q, eq: () => q, neq: () => q, in: () => q,
    is: () => q, not: () => q, or: () => q, order: () => q, limit: () => q, range: () => q,
    then: (res) => res({ data, error: null }),
  };
  return q;
};
vi.mock('../lib/supabaseClient.js', () => ({ supabase: { from: () => okQuery(), rpc: async () => ({ data: [], error: null }) } }));
vi.mock('../lib/saleRealtime.js', () => ({ useSaleRealtime: () => {} }));
vi.mock('../lib/useSaleLive.js', () => ({ useSaleLiveReload: () => {} }));
vi.mock('../lib/audit.js', () => ({ logAudit: async () => {} }));
vi.mock('../lib/appBus.js', () => ({
  toast: () => {}, confirm: async () => true, openModal: () => {}, goSection: () => {}, refresh: () => {},
  canEdit: () => true, isAdmin: () => true, userEmail: () => 'admin@tmk.co', lockedSections: () => [],
  setAppState: () => {}, registerServices: () => {},
}));
vi.mock('../dataContext.jsx', () => ({
  useData: () => ({ staff: [{ name: 'ฟ้า', color: '#22c55e' }, { name: 'ตุ๊กตา', color: '#3b82f6' }], roles: [], tasks: [] }),
}));
vi.mock('../lib/saleData.js', async (orig) => ({
  ...(await orig()),
  cachedFetchRange: async (t) => ({
    data: t === 'tmk_mp_skus' ? SKUS : t === 'tmk_sales_funnel' ? FUNNEL : ORDERS, error: null,
  }),
  cachedFetchAll: async () => ({ data: [], error: null }),
  fetchOrdersByNos: async () => [],
}));
vi.mock('../lib/targets.js', async (orig) => ({
  ...(await orig()),
  fetchTargets: async () => [{ salesperson: 'ฟ้า', sales_target: 100000, commission_rate: 3 }],
  fetchTargetsResult: async () => ({ rows: [{ salesperson: 'ฟ้า', sales_target: 100000, commission_rate: 3 }], error: null }),
}));
vi.mock('../lib/stockData.js', () => ({
  fetchStockCounts: async () => ({ rows: [], error: null }),
  fetchStockMoves: async () => ({ rows: [], error: null }),
  saveStockCount: async () => ({}), deleteStockSession: async () => ({}), appendStockMoves: async () => ({}),
  sessionsOf: () => [], STOCK_MIGRATION: 'x.sql', MOVES_MIGRATION: 'y.sql', MOVES_ROUND_MIGRATION: 'z.sql',
}));
vi.mock('../lib/productionOrders.js', async (orig) => ({
  ...(await orig()),
  fetchPurchaseOrders: async () => ({ rows: [], error: null }),
  savePurchaseOrder: async () => ({}),
}));
vi.mock('../lib/productCatalog.js', async (orig) => ({
  ...(await orig()),
  fetchProductDesigns: async () => ({ rows: [], error: null }),
}));
// เก็บ export ทั้งหมดไว้ (channelColor ฯลฯ) แทนที่เฉพาะตัวที่วาด SVG จริง — jsdom วัดขนาดไม่ได้
vi.mock('../charts.jsx', async (orig) => ({
  ...(await orig()),
  DailySalesChart: () => <div>กราฟรายวัน(mock)</div>,
  ComboChart: () => <div>combo(mock)</div>,
  StackedBars: () => <div>stacked(mock)</div>,
  CumulativeCompare: () => <div>cum(mock)</div>,
  ParetoChart: () => <div>pareto(mock)</div>,
  Heatmap: () => <div>heat(mock)</div>,
  DonutChart: () => <div>donut(mock)</div>,
  AreaTrend: () => <div>area(mock)</div>,
  HBars: () => <div>hbars(mock)</div>,
  GroupBars: () => <div>group(mock)</div>,
}));
vi.mock('../userContext.jsx', () => ({
  useUser: () => ({ user: { email: 'admin@tmk.co', role: 'admin', isAdmin: true }, loading: false }),
  resolveLockedSections: () => [],
}));

afterEach(cleanup);

/* ---------- ยามร่วม: หน้าต้องไม่ crash · ไม่ขาว · ไม่มีข้อความหลุด ---------- */
const assertHealthy = () => {
  const txt = document.body.textContent || '';
  expect(txt.length).toBeGreaterThan(50);              // ไม่ใช่จอขาว
  expect(txt).not.toMatch(/\/\*|\*\//);                // คอมเมนต์โค้ดหลุด (บั๊กจริง 9 ก.ย.)
  expect(txt).not.toMatch(/undefined|NaN|\[object Object\]/);
};

describe('views-stock — StockView', () => {
  it('เรนเดอร์ได้ ไม่ crash · หัวการ์ดขึ้น', async () => {
    const { StockView } = await import('../views-stock.jsx');
    render(<StockView />);
    await waitFor(() => expect(screen.getByText(/สต็อกคงเหลือ/)).toBeInTheDocument(), WF);
    assertHealthy();
  });

  it('⛔ ยังไม่เคยนับ → การ์ด "ติดลบ" ต้องไม่บอกว่า "ปกติ" (ไม่มีข้อมูลให้ตัดสิน)', async () => {
    const { StockView } = await import('../views-stock.jsx');
    render(<StockView />);
    await waitFor(() => expect(screen.getByText('ติดลบ')).toBeInTheDocument(), WF);
    expect(document.body.textContent).toMatch(/ยังไม่เคยนับ/);
  });
});

describe('salePerf — SalePerfView', () => {
  it('เรนเดอร์ได้ · ยอดรวมทีมขึ้น (฿3,000 จาก 2 ใบ)', async () => {
    const { SalePerfView } = await import('../salePerf.jsx');
    render(<SalePerfView />);
    await waitFor(() => expect(screen.getAllByText(/ประสิทธิภาพเซลล์/).length).toBeGreaterThan(0), WF);
    await waitFor(() => expect(document.body.textContent).toContain('3,000'), WF);
    assertHealthy();
  });

  it('⛔ ข้อความใต้กราฟสัญญาว่า "คลิกวันเพื่อดูออเดอร์" → ต้องมีตัวรับคลิกจริง', async () => {
    const { SalePerfView } = await import('../salePerf.jsx');
    render(<SalePerfView />);
    await waitFor(() => expect(document.body.textContent).toMatch(/คลิกวันเพื่อดูออเดอร์/), WF);
    // ตัวกราฟถูก mock → ยืนยันที่ระดับซอร์สแทน (ดู lib/__tests__/salePerfDayWiring.test.js)
    assertHealthy();
  });
});

describe('saleDashboard — SaleDashboard', () => {
  it('เรนเดอร์ได้ · ยอดขายรวมขึ้น ไม่ crash', async () => {
    const { SaleDashboard } = await import('../saleDashboard.jsx');
    render(<SaleDashboard />);
    await waitFor(() => expect(document.body.textContent).toMatch(/ยอดขายรวม|รายงานขาย/), WF);
    assertHealthy();
  });
});
