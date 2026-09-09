// @vitest-environment jsdom
/* หน้าแรกใหม่ (PART 122) — เรนเดอร์จริงด้วยข้อมูลปลอม แล้วเช็คว่าตัวเลข/ปุ่มขึ้นครบ
   mock ทุกอย่างที่ยิงเน็ต (supabase / fetch*) — เทสนี้พิสูจน์ "หน้าเรนเดอร์และผูกเลขถูก" ไม่ใช่การดึงข้อมูล */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';


/* waitFor default = 1000ms — แคบเกินไปตอนรันทั้งชุดพร้อมกัน (เทสเคยแดงเป็นครั้งคราว
   ทั้งที่รันเดี่ยวผ่าน 6/6) · เทสพวกนี้รอ "ค่าโผล่บนจอ" ไม่ได้วัดความเร็ว จึงยืดได้ปลอดภัย */
const WF = { timeout: 5000 };
const TODAY = new Date();
const YM = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}`;
const DAY = TODAY.getDate();

/* ---------- mock ชั้นข้อมูล ---------- */
export const QUERIES = [];   // บันทึกว่ายิงตารางไหน ช่วงไหน (ใช้เช็คขอบเดือน)
vi.mock('../lib/supabaseClient.js', () => ({
  supabase: {
    from: (table) => {
      const rec = { table, gte: null, lte: null };
      QUERIES.push(rec);
      const q = {
        select: () => q, gte: (_c, v) => { rec.gte = v; return q; }, lte: (_c, v) => { rec.lte = v; return q; },
        eq: () => q, order: () => q, limit: () => q,
        then: (res) => res({ data: [], error: null }),
      };
      return q;
    },
  },
}));
vi.mock('../lib/saleRealtime.js', () => ({ useSaleRealtime: () => {} }));
vi.mock('../lib/useSaleLive.js', () => ({ useSaleLiveReload: () => {} }));
vi.mock('../lib/saleData.js', async (orig) => ({
  ...(await orig()),
  cachedFetchRange: async () => ({ data: [], error: null }),
  cachedFetchAll: async () => ({ data: [], error: null }),
}));
const TARGET_ROWS = [{ salesperson: 'ฟ้า', sales_target: 200000, commission_rate: 3 }];
vi.mock('../lib/targets.js', async (orig) => ({
  ...(await orig()),
  fetchTargets: async () => TARGET_ROWS,
  // ต้อง mock ตัวนี้ด้วย — homeView เปลี่ยนไปใช้ fetchTargetsResult (แยก "อ่านไม่ได้" ออกจาก "ไม่มีเป้า")
  // เดิม mock แค่ fetchTargets แล้วเทสผ่านเพราะบังเอิญรันวันที่ 1 (เมื่อวานอยู่เดือนก่อน เลยไปใช้ fetchTargets)
  fetchTargetsResult: async () => ({ rows: TARGET_ROWS, error: null }),
}));
vi.mock('../lib/mergedMonth.js', () => ({
  isMergedMonth: () => true,
  fetchMergedMonth: async () => ({
    sales: 900000, orders: 30, ad: 0, channels: [],
    days: [{ day: Math.max(1, DAY - 1), sales: 100000, orders: 4 }, { day: DAY, sales: 250000, orders: 9 }],
  }),
}));
vi.mock('../lib/monthTarget.js', () => ({
  useMonthTarget: () => ({
    ym: YM, has: true, isCur: true, dim: 30, passed: DAY, target: 1500000,
    chT: {}, chAdBudget: {}, chAd: {}, adBudget: 0,
    sales: 900000, orders: 30, chSales: {}, ad: 0, projected: 1500000, label: 'เดือนนี้',
  }),
}));
vi.mock('../lib/productionOrders.js', () => ({
  fetchPurchaseOrders: async () => ({ rows: [{ id: 1, status: 'open', due_date: '2020-01-01', qty: 10, received: 0 }] }),
  isPoOpen: () => true,
  poSummary: () => ({ pending: 10 }),
}));
vi.mock('../lib/stockData.js', () => ({ fetchStockCounts: async () => ({ rows: [] }) }));
// การ์ดที่ใช้ร่วม + ส่วนกราฟ (lazy) — ตัดออกเพื่อโฟกัสที่หน้าแรก
vi.mock('../views-1.jsx', () => ({
  TeamTodayCard: () => <div>ทีมวันนี้(mock)</div>,
  CampaignsCard: () => <div>แคมเปญ(mock)</div>,
}));
vi.mock('../homeCharts.jsx', () => ({
  HomeGauge: () => <div>เกจ(mock)</div>,
  HomeSpark: () => <div>สปาร์ค(mock)</div>,
}));
vi.mock('../userContext.jsx', () => ({ useUser: () => ({ user: { name: 'อาร์ต' } }) }));

/* buildPerf จริง — เอาเลขรายคนจากออเดอร์ปลอม (ไม่ mock เพื่อให้ทดสอบการผูกจริง) */
vi.mock('../lib/salePerfAgg.js', async (orig) => {
  const m = await orig();
  return {
    ...m,
    buildPerf: () => ({
      dim: 30,
      team: { sales: 800000, orders: 28, chatOrders: 14, leads: 40, newC: 5, closeRate: 35, qty: 30, dSales: null },
      rows: [
        { name: 'ฟ้า', sales: 500000, target: 200000, pctTarget: 250, pace: 'over', daily: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, sales: i + 1 === DAY ? 120000 : 0, orders: 0, leads: i + 1 === DAY ? 12 : 0 })) },
        { name: 'มิ้น', sales: 300000, target: 900000, pctTarget: 33, pace: 'risk', daily: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, sales: 0, orders: 0, leads: 0 })) },
        { name: 'ไม่ระบุเซลล์', sales: 999999, target: 0, pctTarget: null, pace: null, daily: Array.from({ length: 30 }, () => ({ day: 1, sales: 0, orders: 0, leads: 0 })) },
      ],
    }),
  };
});

let HomeView;
beforeEach(async () => { ({ HomeView } = await import('../homeView.jsx')); });
afterEach(cleanup);

describe('หน้าแรก (PART 122)', () => {
  it('โชว์ยอดวันนี้จาก mergedMonth (ยอดบริษัท ไม่ใช่ผลรวมรายคน)', async () => {
    render(<HomeView go={() => {}} />);
    await waitFor(() => expect(screen.getByText('ยอดวันนี้')).toBeInTheDocument(), WF);
    // 250,000 = ยอดบริษัทของวันนี้ · 120,000 = ยอดรายคนของฟ้า → ต้องไม่สลับกัน
    await waitFor(() => expect(document.body.textContent).toContain('250,000'), WF);
  });

  it('อันดับเซลล์ตัด "ไม่ระบุเซลล์" ออก และเรียงตามยอด', async () => {
    render(<HomeView go={() => {}} />);
    await waitFor(() => expect(screen.getByText('อันดับเซลล์เดือนนี้')).toBeInTheDocument(), WF);
    // ชื่อ 'ฟ้า' โผล่ทั้งในอันดับเซลล์และในเตือน "ยังไม่กรอกคนทัก" → เจาะเฉพาะกระดานอันดับ
    const board = screen.getByText('อันดับเซลล์เดือนนี้').closest('[data-slot="card"]') || document.body;
    await waitFor(() => expect(board.textContent).toContain('ฟ้า'), WF);
    expect(board.textContent).toContain('มิ้น');
    expect(board.textContent).not.toContain('ไม่ระบุเซลล์');
    expect(board.textContent.indexOf('ฟ้า')).toBeLessThan(board.textContent.indexOf('มิ้น'));   // เรียงตามยอด
  });

  it('%ปิดกำกับสโคปว่าเป็น "เดือนนี้" (กันเข้าใจผิดว่าเป็นของวันนี้)', async () => {
    render(<HomeView go={() => {}} />);
    await waitFor(() => expect(screen.getByText('%ปิดเดือนนี้')).toBeInTheDocument(), WF);
  });

  it('ใบสั่งผลิตเลยกำหนด → ขึ้นใน "ต้องทำวันนี้" และกดแล้วพาไปหน้าสต็อก', async () => {
    const go = vi.fn();
    render(<HomeView go={go} />);
    const btn = await screen.findByText(/ใบสั่งผลิตเลยกำหนดรับ/);
    fireEvent.click(btn.closest('button'));
    expect(go).toHaveBeenCalledWith('catalog', 'stock');
  });

  it('เซลล์ที่มีเป้าแต่ไม่มีคนทักเมื่อวาน → ขึ้นเตือนพร้อมชื่อ', async () => {
    render(<HomeView go={() => {}} />);
    await waitFor(() => expect(screen.getByText(/ยังไม่กรอกคนทักของเมื่อวาน/)).toBeInTheDocument(), WF);
    expect(document.body.textContent).toContain('ฟ้า');
  });

  it('ไม่มี emoji เป็นไอคอนบนหน้า (กติกาสไตล์)', async () => {
    const { container } = render(<HomeView go={() => {}} />);
    await waitFor(() => expect(screen.getByText('ยอดวันนี้')).toBeInTheDocument(), WF);
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(container.textContent)).toBe(false);
  });
});

/* ---------- ขอบเดือน: ทุกวันที่ 1 "เมื่อวาน" อยู่เดือนก่อน ---------- */
describe('หน้าแรก · ขอบเดือน', () => {
  it('ดึงคนทักคร่อม "เมื่อวาน" เสมอ แม้เมื่อวานอยู่เดือนก่อน', async () => {
    QUERIES.length = 0;
    render(<HomeView go={() => {}} />);
    await waitFor(() => expect(QUERIES.some(q => q.table === 'tmk_sales_funnel')).toBe(true), WF);
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yIso = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    const f = QUERIES.find(q => q.table === 'tmk_sales_funnel');
    expect(f.gte <= yIso).toBe(true);   // ถ้าเป็น 1 ค่ำเดือน ต้องถอยไปถึงวันสุดท้ายของเดือนก่อน
  });
});

/* ---------- อ่านเป้าไม่สำเร็จ ≠ ยังไม่ได้ตั้งเป้า ---------- */
describe('หน้าแรก · เตือนเป้า', () => {
  it('อ่านเป้าไม่ได้ (error) → ต้องไม่เตือนว่า "ยังไม่ได้ตั้งเป้าเดือน"', async () => {
    vi.resetModules();
    vi.doMock('../lib/targets.js', async (orig) => ({
      ...(await orig()),
      fetchTargets: async () => [],
      fetchTargetsResult: async () => ({ rows: [], error: { message: 'permission denied' } }),
    }));
    vi.doMock('../lib/appBus.js', async (orig) => ({ ...(await orig()), isAdmin: () => true, toast: () => {}, openModal: () => {} }));
    const { HomeView: HV } = await import('../homeView.jsx');
    render(<HV go={() => {}} />);
    await waitFor(() => expect(screen.getByText('ต้องทำวันนี้')).toBeInTheDocument(), WF);
    expect(screen.queryByText(/ยังไม่ได้ตั้งเป้าเดือน/)).not.toBeInTheDocument();
    vi.doUnmock('../lib/targets.js'); vi.doUnmock('../lib/appBus.js');
  });
});

/* ---------- query "ของเสริม" พัง ต้องไม่ลากยอดขายทั้งหน้าตกไปด้วย ---------- */
describe('หน้าแรก · ทนต่อ query เสริมที่พัง', () => {
  it('อ่านวันตัดรอบคอมไม่ได้ (tmk_settings พัง) → ยอดวันนี้ยังขึ้นปกติ', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabaseClient.js', () => ({
      supabase: {
        from: (table) => {
          const q = {
            select: () => q, gte: () => q, lte: () => q, eq: () => q, order: () => q, limit: () => q,
            // tmk_settings ไม่มี maybeSingle (จำลองคอลัมน์/เมธอดหาย) → โยน TypeError
            maybeSingle: table === 'tmk_settings' ? undefined : (() => Promise.resolve({ data: null, error: null })),
            then: (res) => res({ data: [], error: null }),
          };
          return q;
        },
      },
    }));
    const { HomeView: HV } = await import('../homeView.jsx');
    render(<HV go={() => {}} />);
    await waitFor(() => expect(screen.getByText('ยอดวันนี้')).toBeInTheDocument(), WF);
    await waitFor(() => expect(document.body.textContent).toContain('250,000'), WF);
    vi.doUnmock('../lib/supabaseClient.js');
  });
});

/* ---------- รอบโหลดซ้อนกัน: คุมลำดับเอง ไม่พึ่งเวลาเดิน ----------
   เดิมใช้ setTimeout 400ms/500ms → flaky เวลารัน vitest พร้อม eslint/build (CPU แย่งกัน timer เลื่อน)
   ตอนนี้กัน promise ของรอบแรกไว้ในมือ แล้วค่อยปล่อยหลังรอบสองจบ = ลำดับแน่นอนทุกเครื่อง */
function deferredMergedMonth(firstDays, laterDays) {
  const gate = {};                       // ตัวปล่อย/ทิ้ง promise ของรอบแรก
  let call = 0;
  const mk = (days) => ({ sales: 1, orders: 1, ad: 0, channels: [], days });
  return {
    gate,
    mod: {
      isMergedMonth: () => true,
      fetchMergedMonth: (ymArg) => {
        if (ymArg !== YM) return Promise.resolve(mk([]));       // เดือนก่อน — ไม่เกี่ยว
        call += 1;
        if (call === 1) return new Promise((res, rej) => { gate.resolve = () => res(mk(firstDays)); gate.reject = rej; });
        return Promise.resolve(mk(laterDays));
      },
    },
  };
}

describe('หน้าแรก · reload ซ้อนกัน', () => {
  it('ตอบช้ารอบแรกมาทีหลัง ต้องไม่ทับผลรอบล่าสุด', async () => {
    vi.resetModules();
    const d = deferredMergedMonth([{ day: DAY, sales: 111111, orders: 1 }], [{ day: DAY, sales: 999999, orders: 1 }]);
    vi.doMock('../lib/mergedMonth.js', () => d.mod);
    let reload = null;
    vi.doMock('../lib/useSaleLive.js', () => ({ useSaleLiveReload: (_t, fn) => { reload = fn; } }));
    const { HomeView: HV } = await import('../homeView.jsx');
    render(<HV go={() => {}} />);
    expect(reload).toBeTypeOf('function');
    reload();                                                  // รอบสองสำเร็จก่อน
    await waitFor(() => expect(document.body.textContent).toContain('999,999'), WF);
    d.gate.resolve();                                          // ค่อยปล่อยรอบแรก (ของเก่า)
    /* ⚠️ setTimeout(0) เดียวไม่พอ — รอบแรกยัง await ต่ออีกหลาย microtask (overrides/stray/targets)
       ก่อนจะถึงจุดที่ *อาจ* setState · เทสเคยแดงเป็นครั้งคราวตอนเครื่องช้าเพราะเช็คเร็วเกินไป
       รอให้ event loop ว่างจริง ๆ หลายรอบ แล้วค่อยยืนยันว่าของเก่าไม่โผล่ */
    for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 50));
    expect(document.body.textContent).toContain('999,999');
    expect(document.body.textContent).not.toContain('111,111');
    vi.doUnmock('../lib/mergedMonth.js'); vi.doUnmock('../lib/useSaleLive.js');
  });
});

/* ---------- รอบที่ "พัง" และมาช้า ต้องไม่ล้างผลรอบที่สำเร็จ ---------- */
describe('หน้าแรก · รอบที่ล้มเหลวมาทีหลัง', () => {
  it('โหลดรอบแรกพัง ต้องไม่ลบยอดที่รอบสองโหลดมาได้แล้ว', async () => {
    vi.resetModules();
    const d = deferredMergedMonth([], [{ day: DAY, sales: 777777, orders: 1 }]);
    vi.doMock('../lib/mergedMonth.js', () => d.mod);
    let reload = null;
    vi.doMock('../lib/useSaleLive.js', () => ({ useSaleLiveReload: (_t, fn) => { reload = fn; } }));
    const { HomeView: HV } = await import('../homeView.jsx');
    render(<HV go={() => {}} />);
    expect(reload).toBeTypeOf('function');
    reload();
    await waitFor(() => expect(document.body.textContent).toContain('777,777'), WF);
    d.gate.reject(new Error('เน็ตหลุด'));                       // รอบแรกพังทีหลัง
    await new Promise(r => setTimeout(r, 0));
    await waitFor(() => expect(document.body.textContent).toContain('777,777'), WF);
    expect(document.body.textContent).toContain('777,777');     // ต้องยังอยู่ ไม่ถูกล้างเป็น ฿0
    vi.doUnmock('../lib/mergedMonth.js'); vi.doUnmock('../lib/useSaleLive.js');
  });
});

/* ---------- อ่านยอดไม่ได้ ≠ ขายไม่ได้ (7 ก.ย. 69) ----------
   fetchMergedMonth คืน null แปลว่า "อ่านไม่ได้" (คอมเมนต์ในไฟล์นั้นเขียนไว้เอง)
   แต่หน้าแรกเอา null ไป render เป็น ฿0 · ออเดอร์ 0 · เกจหายเป็นกล่องเปล่า โดยไม่มีอะไรบอก
   ทั้งที่ salePerf/saleDashboard ขึ้นแถบเตือนทั้งคู่ — หน้าแรกคือจอแรกหลังล็อกอิน
   จึงเป็นจุดที่รายงาน ฿0 เป็นข้อเท็จจริงได้เสียหายที่สุด */
describe('หน้าแรก · อ่านยอดไม่สำเร็จ', () => {
  it('อ่านยอดเดือนไม่ได้ → ต้องเตือน ไม่ใช่โชว์ ฿0 เฉย ๆ', async () => {
    vi.resetModules();
    vi.doMock('../lib/mergedMonth.js', () => ({
      isMergedMonth: () => true,
      fetchMergedMonth: async () => null,        // null = อ่านไม่ได้
    }));
    const { HomeView: HV } = await import('../homeView.jsx');
    render(<HV go={() => {}} />);
    await waitFor(() => expect(screen.getByText('ยอดวันนี้')).toBeInTheDocument(), WF);
    expect(await screen.findByText(/อ่านยอดขายไม่สำเร็จ/)).toBeInTheDocument();
    // ห้ามยืนยันเป็นตัวเลขว่าวันนี้ขายได้ 0 บาท
    expect(screen.queryByText('฿0')).not.toBeInTheDocument();
    vi.doUnmock('../lib/mergedMonth.js');
  });

  it('อ่านได้แต่ยอดเป็น 0 จริง ๆ → โชว์ ฿0 ได้ ไม่ต้องเตือน', async () => {
    vi.resetModules();
    vi.doMock('../lib/mergedMonth.js', () => ({
      isMergedMonth: () => true,
      fetchMergedMonth: async () => ({ sales: 0, orders: 0, ad: 0, channels: [], days: [] }),
    }));
    const { HomeView: HV } = await import('../homeView.jsx');
    render(<HV go={() => {}} />);
    /* ⚠️ ต้องรอ 2 เงื่อนไข "พร้อมกัน" ใน waitFor เดียว
       รอ 'ยอดวันนี้' อย่างเดียวไม่พอ — label นั้นขึ้นพร้อมแถบเตือนได้ (ช่วงที่ยังโหลดไม่เสร็จ)
         → บนเครื่องช้าอย่าง CI จะเช็คแถบเตือนตอนที่มันยังอยู่ = แดง (เกิดจริง 9 ก.ย. 69 commit bdd3ab1)
       รอ "แถบเตือนหาย" อย่างเดียวก็ไม่พอ — ตอนยังเป็นโครงร่าง (skeleton) ก็ไม่มีแถบเตือนอยู่แล้ว
         → ผ่านทันทีตั้งแต่ยังไม่โหลด แล้ว getByText('ยอดวันนี้') ล้มเพราะหน้ายังไม่ขึ้น
       รวมไว้ในก้อนเดียว = retry จนกว่าจะ "โหลดเสร็จ และ ไม่มีแถบเตือน" พร้อมกันจริง ๆ */
    await waitFor(() => {
      expect(screen.getByText('ยอดวันนี้')).toBeInTheDocument();
      expect(screen.queryByText(/อ่านยอดขายไม่สำเร็จ/)).not.toBeInTheDocument();
    }, WF);
    vi.doUnmock('../lib/mergedMonth.js');
  });
});

/* ออเดอร์อ่านไม่ได้ แต่ mm มาจาก cache เดิม → ต้องเตือน (เดิม moneyReadOk ดูแค่ mm) */
describe('หน้าแรก · ออเดอร์อ่านไม่ได้แต่ยอดเดือนมาจาก cache', () => {
  it('อันดับเซลล์ว่างทั้งกระดาน = ต้องมีแถบเตือน ไม่ใช่โชว์เป็นข้อเท็จจริง', async () => {
    vi.resetModules();
    // mergedMonth สำเร็จ (เหมือนได้จาก cache) แต่ query ออเดอร์พัง
    vi.doMock('../lib/mergedMonth.js', () => ({
      isMergedMonth: () => true,
      fetchMergedMonth: async () => ({ sales: 900000, orders: 30, ad: 0, channels: [], days: [] }),
    }));
    vi.doMock('../lib/saleData.js', async (orig) => ({
      ...(await orig()),
      cachedFetchRange: async (table) => (table === 'tmk_mp_orders'
        ? { data: null, error: { message: 'JWT expired', code: 'PGRST301' } }
        : { data: [], error: null }),
      cachedFetchAll: async () => ({ data: [], error: null }),
    }));
    const { HomeView: HV } = await import('../homeView.jsx');
    render(<HV go={() => {}} />);
    await waitFor(() => expect(screen.getByText('ยอดวันนี้')).toBeInTheDocument(), WF);
    expect(await screen.findByText(/อ่านยอดขายไม่สำเร็จ/)).toBeInTheDocument();
    vi.doUnmock('../lib/mergedMonth.js'); vi.doUnmock('../lib/saleData.js');
  });
});

/* ---------- ยอดขาดของบางส่วน (manualOk/funnelOk) ต้องเตือน ----------
   บทเรียนจาก mutation test: เทสเดิมพิสูจน์แค่ว่า mergedMonth "ตั้ง flag" ได้
   แต่ไม่มีเทสไหนพิสูจน์ว่า "มีใครใช้ flag นั้น" ซึ่งคือทั้งหมดของ fix
   → ถอด clause ใน homeView ออกแล้วเทสยังเขียวทั้งชุด */
describe('หน้าแรก · ยอดขาดของบางส่วน', () => {
  const mockMM = (extra) => {
    vi.resetModules();
    vi.doMock('../lib/mergedMonth.js', () => ({
      isMergedMonth: () => true,
      fetchMergedMonth: async () => ({ sales: 900000, orders: 30, ad: 0, channels: [], days: [], ...extra }),
    }));
  };

  it('⛔ อ่าน tmk_daily_sales ไม่ได้ (manualOk=false) → ต้องเตือน ไม่ใช่โชว์ยอดที่ขาดเป็นข้อเท็จจริง', async () => {
    mockMM({ manualOk: false, funnelOk: true });
    const { HomeView: HV } = await import('../homeView.jsx');
    render(<HV go={() => {}} />);
    await waitFor(() => expect(screen.getByText('ยอดวันนี้')).toBeInTheDocument(), WF);
    expect(await screen.findByText(/อ่านยอดขายไม่สำเร็จ/)).toBeInTheDocument();
    vi.doUnmock('../lib/mergedMonth.js');
  });

  it('⛔ อ่านคนทักไม่ได้ (funnelOk=false) → ต้องเตือนเช่นกัน', async () => {
    mockMM({ manualOk: true, funnelOk: false });
    const { HomeView: HV } = await import('../homeView.jsx');
    render(<HV go={() => {}} />);
    await waitFor(() => expect(screen.getByText('ยอดวันนี้')).toBeInTheDocument(), WF);
    expect(await screen.findByText(/อ่านยอดขายไม่สำเร็จ/)).toBeInTheDocument();
    vi.doUnmock('../lib/mergedMonth.js');
  });

  it('อ่านครบทุกส่วน → ไม่เตือน', async () => {
    mockMM({ manualOk: true, funnelOk: true });
    const { HomeView: HV } = await import('../homeView.jsx');
    render(<HV go={() => {}} />);
    /* ⚠️ ต้องรอ 2 เงื่อนไข "พร้อมกัน" ใน waitFor เดียว
       รอ 'ยอดวันนี้' อย่างเดียวไม่พอ — label นั้นขึ้นพร้อมแถบเตือนได้ (ช่วงที่ยังโหลดไม่เสร็จ)
         → บนเครื่องช้าอย่าง CI จะเช็คแถบเตือนตอนที่มันยังอยู่ = แดง (เกิดจริง 9 ก.ย. 69 commit bdd3ab1)
       รอ "แถบเตือนหาย" อย่างเดียวก็ไม่พอ — ตอนยังเป็นโครงร่าง (skeleton) ก็ไม่มีแถบเตือนอยู่แล้ว
         → ผ่านทันทีตั้งแต่ยังไม่โหลด แล้ว getByText('ยอดวันนี้') ล้มเพราะหน้ายังไม่ขึ้น
       รวมไว้ในก้อนเดียว = retry จนกว่าจะ "โหลดเสร็จ และ ไม่มีแถบเตือน" พร้อมกันจริง ๆ */
    await waitFor(() => {
      expect(screen.getByText('ยอดวันนี้')).toBeInTheDocument();
      expect(screen.queryByText(/อ่านยอดขายไม่สำเร็จ/)).not.toBeInTheDocument();
    }, WF);
    vi.doUnmock('../lib/mergedMonth.js');
  });
});
