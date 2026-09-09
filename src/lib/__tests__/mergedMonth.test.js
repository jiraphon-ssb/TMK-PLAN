/* ============================================================
   mergedMonth — "อ่านไม่ได้ ≠ ไม่มีข้อมูล" + ยอดรายปีต้องไม่ข้ามช่วง/ข้ามปี (8 ก.ย. 69)
   ============================================================
   2 บั๊กที่แก้:
   1. fetchMergedMonth กลืน error ของ tmk_daily_sales / tmk_sales_funnel เงียบ ๆ
      ทั้งที่บรรทัดบนตั้งใจ `if (oR?.error) return null` ไว้แล้ว
      → ยอดมาร์เก็ตเพลสที่กรอกมือ + ค่าแอด หายทั้งเดือนบนหน้าแรก โดยไม่มีแถบเตือน
   2. fetchYearMergedActuals ไม่กรองช่วงซ้ำหลัง merge override และ bucket ด้วยเดือนอย่างเดียว
      → ใบที่ override ย้ายวันไป ก.ค. (ก่อน cutoff) สร้าง by[7] ขึ้นมาแทนยอดคลังจริง ~฿700k
   ============================================================ */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { orders: [], overrides: [], funnel: null, daily: null, crm: [], strays: [] };

vi.mock('../supabaseClient.js', () => ({
  supabase: {
    from: (table) => {
      const q = {
        select: () => q, gte: () => q, lte: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q,
        then: (res) => res(table === 'tmk_sales_funnel' ? (state.funnel || { data: [], error: null })
          : table === 'tmk_daily_sales' ? (state.daily || { data: [], error: null })
          : { data: [], error: null }),
      };
      return q;
    },
  },
}));
vi.mock('../saleData.js', async (orig) => ({
  ...(await orig()),
  cachedFetchRange: async () => ({ data: state.orders, error: null }),
  cachedFetchAll: async () => ({ data: state.overrides, error: null }),
  fetchOrdersByNos: async () => state.strays,
}));
vi.mock('../crmTargets.js', () => ({ fetchCrmTargets: async () => state.crm }));

const { fetchMergedMonth, fetchYearMergedActuals } = await import('../mergedMonth.js');

const ord = (no, date, sales, extra = {}) => ({
  order_no: no, source: 'shipnity', order_date: date, sales, channel: 'Facebook',
  salesperson: 'ฟ้า', status: '', qty: 1, ...extra,
});

beforeEach(() => {
  state.orders = []; state.overrides = []; state.funnel = null; state.daily = null; state.crm = []; state.strays = [];
});

describe('fetchMergedMonth — บอกเมื่ออ่านบางส่วนไม่สำเร็จ', () => {
  it('อ่านครบ → manualOk/funnelOk = true', async () => {
    state.orders = [ord('A1', '2026-09-03', 1000)];
    const mm = await fetchMergedMonth('2026-09');
    expect(mm.manualOk).toBe(true);
    expect(mm.funnelOk).toBe(true);
    expect(mm.sales).toBe(1000);
  });

  it('⛔ tmk_daily_sales อ่านไม่ได้ → manualOk = false (ยอดกรอกมือ+ค่าแอดหายไปจากตัวเลขนี้)', async () => {
    state.orders = [ord('A1', '2026-09-03', 1000)];
    state.daily = { data: null, error: { message: 'permission denied' } };
    const mm = await fetchMergedMonth('2026-09');
    expect(mm).not.toBeNull();          // ยอดออเดอร์ยังใช้ได้ ไม่ต้องทิ้งทั้งเดือน
    expect(mm.manualOk).toBe(false);    // แต่ต้องบอกว่าไม่ครบ
  });

  it('⛔ tmk_sales_funnel อ่านไม่ได้ → funnelOk = false (คนทัก 0 ไม่ใช่ "ไม่มีใครทัก")', async () => {
    state.orders = [ord('A1', '2026-09-03', 1000)];
    state.funnel = { data: null, error: { message: 'timeout' } };
    const mm = await fetchMergedMonth('2026-09');
    expect(mm.funnelOk).toBe(false);
  });
});

describe('fetchYearMergedActuals — override ต้องไม่ทำให้เดือนอื่นเพี้ยน', () => {
  const ovRow = (source, no, date) => ({ order_id: `${source}:${no}`, order_date: date });

  it('ปกติ: รวมยอดตามเดือนของปีที่ขอ', async () => {
    state.orders = [ord('A1', '2026-09-03', 1000), ord('A2', '2026-10-05', 500)];
    const by = await fetchYearMergedActuals(2569);
    expect(by[9]).toBe(1000);
    expect(by[10]).toBe(500);
  });

  it('⛔ override ย้ายวันออกไป "ก่อน cutoff" ต้องไม่สร้างยอดเดือนนั้นขึ้นมา', async () => {
    state.orders = [ord('A1', '2026-08-05', 1500)];
    state.overrides = [ovRow('shipnity', 'A1', '2026-07-20')];   // ย้ายไป ก.ค. (นอกช่วง merged)
    const by = await fetchYearMergedActuals(2569);
    expect(by[7]).toBeUndefined();     // ต้องปล่อยให้ act() ไปใช้ยอดคลังของ ก.ค.
    expect(by[8]).toBeUndefined();     // และไม่นับที่เดือนเดิมด้วย (ใบถูกย้ายออกจริง)
  });

  it('⛔ override ย้ายข้ามปี ต้องไม่ลงเดือนเดียวกันของปีที่ขอ', async () => {
    state.orders = [ord('A1', '2026-09-03', 9000)];
    state.overrides = [ovRow('shipnity', 'A1', '2025-12-30')];
    const by = await fetchYearMergedActuals(2569);
    expect(by[12]).toBeUndefined();
    expect(by[9]).toBeUndefined();
  });

  it('ปีก่อน cutoff → {} (ใช้คลังเดิม ไม่ต้องยิง query)', async () => {
    expect(await fetchYearMergedActuals(2568)).toEqual({});
  });
});

/* ⛔ ออเดอร์อ่านไม่ได้ ต้องคืน null ("ไม่รู้") ไม่ใช่ "เดือนนี้ขายได้ ฿0"
   mutation test พบว่าลบ `if (oR?.error) return null` แล้วเทสทั้งชุดยังเขียว
   ทั้งที่นั่นคือบรรทัดที่กันไม่ให้หน้าแรกโชว์ ฿0 อย่างมั่นใจ */
describe('fetchMergedMonth — ออเดอร์อ่านไม่ได้', () => {
  it('cachedFetchRange คืน error → ต้องได้ null', async () => {
    vi.resetModules();
    vi.doMock('../saleData.js', async (orig) => ({
      ...(await orig()),
      cachedFetchRange: async () => ({ data: null, error: { message: 'permission denied', code: '42501' } }),
      cachedFetchAll: async () => ({ data: [], error: null }),
      fetchOrdersByNos: async () => [],
    }));
    vi.doMock('../crmTargets.js', () => ({ fetchCrmTargets: async () => [] }));
    const { fetchMergedMonth: f } = await import('../mergedMonth.js');
    expect(await f('2026-09')).toBeNull();
    vi.doUnmock('../saleData.js'); vi.doUnmock('../crmTargets.js');
  });

  it('อ่านออเดอร์สำเร็จแต่ว่าง → ไม่ใช่ null (รู้ว่าเป็นศูนย์จริง)', async () => {
    vi.resetModules();
    vi.doMock('../saleData.js', async (orig) => ({
      ...(await orig()),
      cachedFetchRange: async () => ({ data: [], error: null }),
      cachedFetchAll: async () => ({ data: [], error: null }),
      fetchOrdersByNos: async () => [],
    }));
    vi.doMock('../crmTargets.js', () => ({ fetchCrmTargets: async () => [] }));
    const { fetchMergedMonth: f } = await import('../mergedMonth.js');
    const mm = await f('2026-09');
    expect(mm).not.toBeNull();
    expect(mm.sales).toBe(0);
    vi.doUnmock('../saleData.js'); vi.doUnmock('../crmTargets.js');
  });
});

/* ============================================================
   ⛔ ชั้นที่สองของบั๊กเงินคูณสอง — dedupeOrders ที่ call site
   ============================================================
   บั๊ก 3 ก.ย. (39 ใบ ฿18,911 → 78 ใบ ฿37,822) แก้ 2 ชั้น:
     1) strayOverrideOrderNos(..., have) ตัดใบที่ดึงมาแล้ว — มีเทสตรงแล้ว
     2) dedupeOrders() ที่ call site กันซ้ำชั้นสอง — **ไม่มีเทสไหนผูกเลย**
   mutation test พิสูจน์: ลบ dedupeOrders ออกจาก mergedMonth แล้วทั้ง suite ยังเขียว
   เพราะ mock ตั้ง fetchOrdersByNos ให้คืน [] เสมอ = เส้นทาง stray ไม่เคยถูกรัน
   ============================================================ */
describe('dedupeOrders ที่ call site (ชั้นกันซ้ำที่สอง)', () => {
  const ovRow = (source, no, date) => ({ order_id: `${source}:${no}`, order_date: date });

  it('⛔ fetchOrdersByNos คืนใบที่มีอยู่แล้ว ต้องไม่ทำให้ยอดคูณสอง', async () => {
    const o1 = ord('A1', '2026-09-03', 1000);
    state.orders = [o1];
    // override ของใบอื่นทำให้เกิด stray pass · แต่ query กลับคืนใบเดิมมาด้วย (order_no ซ้ำข้ามช่องทาง)
    state.overrides = [ovRow('shipnity', 'A9', '2026-09-04')];
    state.strays = [o1];
    const mm = await fetchMergedMonth('2026-09');
    expect(mm.sales).toBe(1000);      // ไม่ใช่ 2000
    expect(mm.orders).toBe(1);        // ไม่ใช่ 2
  });

  it('ใบ stray ที่เป็นของจริง (ไม่ซ้ำ) ต้องถูกนับเพิ่ม', async () => {
    state.orders = [ord('A1', '2026-09-03', 1000)];
    state.overrides = [ovRow('shipnity', 'A9', '2026-09-04')];
    state.strays = [ord('A9', '2026-09-04', 500)];
    const mm = await fetchMergedMonth('2026-09');
    expect(mm.sales).toBe(1500);
    expect(mm.orders).toBe(2);
  });

  it('เลขออเดอร์ซ้ำข้ามช่องทาง = คนละใบ ต้องนับทั้งคู่', async () => {
    state.orders = [ord('A1', '2026-09-03', 1000)];
    state.overrides = [ovRow('shopee', 'A1', '2026-09-04')];
    state.strays = [{ ...ord('A1', '2026-09-04', 700), source: 'shopee' }];
    const mm = await fetchMergedMonth('2026-09');
    expect(mm.sales).toBe(1700);
    expect(mm.orders).toBe(2);
  });
});

/* ============================================================
   ⛔ เลขในก้อนเดียวกันขัดกันเอง — mm.orders ≠ Σ mm.days[].orders
   ============================================================
   หน้าแรกโชว์ 2 อย่างจาก object เดียวกันบนจอเดียวกัน:
     · การ์ด "ออเดอร์"  = mm.orders   (= channelTable.total.orders → รวม "ออเดอร์ที่กรอกจำนวนเอง")
     · กราฟรายวัน       = mm.days[]   (= นับจากใบจริงเท่านั้น)
   → 13 ออเดอร์ในการ์ด แต่แท่งกราฟรวมได้ 7 โดยไม่มีอะไรอธิบาย
   และวันที่มีแต่ยอดมาร์เก็ตเพลสกรอกมือ จะมี "แท่งยอดขาย" แต่ orders = 0
   ต้องบอกส่วนต่างออกมาให้ผู้เรียกเห็น ไม่ใช่ให้เดาเอง
   ============================================================ */
describe('mm.orders vs Σ mm.days[].orders — ต้องอธิบายส่วนต่างได้', () => {
  const dailyRow = (date, channels) => ({ date, channels, deleted_at: null });

  it('ไม่มีของกรอกมือ → เท่ากันเป๊ะ + legacyOrders = 0', async () => {
    state.orders = [ord('A1', '2026-09-03', 1000), ord('A2', '2026-09-04', 500)];
    const mm = await fetchMergedMonth('2026-09');
    expect(mm.orders).toBe(2);
    expect(mm.days.reduce((a, d) => a + d.orders, 0)).toBe(2);
    expect(mm.legacyOrders).toBe(0);
  });

  it('⛔ มีออเดอร์ที่กรอกจำนวนเอง → ต้องคืน legacyOrders ให้ตรงกับส่วนต่าง', async () => {
    state.orders = [ord('A1', '2026-09-03', 1000)];
    // Shopee: กรอกยอด + จำนวนออเดอร์เอง วันที่ไม่มีไฟล์นำเข้า
    state.daily = { data: [dailyRow('2026-09-05', { Shopee: { rev: 4000, ord: 6 } })], error: null };
    const mm = await fetchMergedMonth('2026-09');
    const fromDays = mm.days.reduce((a, d) => a + d.orders, 0);
    expect(mm.orders - fromDays).toBe(mm.legacyOrders);   // ส่วนต่างต้องอธิบายได้ทั้งก้อน
    expect(mm.legacyOrders).toBeGreaterThan(0);
  });

  it('⛔ วันที่มีแต่ยอดกรอกมือ → แถวรายวันต้องบอกว่าเป็นยอดกรอกมือ (ไม่ใช่ "ขายได้แต่ไม่มีออเดอร์")', async () => {
    state.orders = [ord('A1', '2026-09-03', 1000)];
    state.daily = { data: [dailyRow('2026-09-07', { Shopee: { rev: 2500 } })], error: null };
    const mm = await fetchMergedMonth('2026-09');
    const d7 = mm.days.find(d => d.day === 7);
    expect(d7).toBeTruthy();
    expect(d7.sales).toBe(2500);
    expect(d7.orders).toBe(0);
    expect(d7.mpManual).toBe(2500);   // ต้องมีธงบอก ไม่ใช่แค่ยอดลอย ๆ
  });
});
