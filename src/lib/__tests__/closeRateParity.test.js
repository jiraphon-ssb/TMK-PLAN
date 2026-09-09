/* %ปิดการขายต้องเป็นสูตรเดียวกันทุกหน้า
   กติกา (ตัดสินไว้ตั้งแต่ v3.27): ตัวเศษ = ออเดอร์ช่องแชทของ "เซลล์ที่กรอกคนทักในช่วงนั้น" เท่านั้น
   เหตุผล: ตัวส่วน (คนทัก) มีเฉพาะคนที่กรอก — ถ้าตัวเศษนับคนที่ไม่กรอกด้วย = คนละกลุ่มกัน %ปิดพองเกินจริง */
import { describe, it, expect } from 'vitest';
import { buildPerf } from '../salePerfAgg.js';
import { channelTable } from '../salesOverviewAgg.js';

const mkOrders = (sp, n, ch = 'Facebook') => Array.from({ length: n }, (_, i) => ({
  order_no: `${sp}-${i}`, source: 'shipnity', salesperson: sp, channel: ch,
  sales: 1000, qty: 1, status: 'done', order_date: '2026-09-10', customer_type: 'ลูกค้าเก่า',
}));
const RANGE = { from: '2026-09-01', to: '2026-09-30' };
const MANUAL = { adByDate: {}, mpRevByDate: {} };
const perfClose = (o, f) => buildPerf('2026-09', o, [], f, [], {}, []).team.closeRate;
const reportClose = (o, f) => channelTable(o, f, MANUAL, [], RANGE).total.closeRate;

describe('%ปิด: หน้าแรก/ประสิทธิภาพเซล ต้องตรงกับรายงานขาย', () => {
  it('เซลล์ที่ไม่กรอกคนทัก ออเดอร์ต้องไม่นับเข้าตัวเศษ', () => {
    // TUKTA กรอกคนทัก 40 · ปิด 10 || FAH ไม่กรอกเลย แต่มีออเดอร์ช่องแชท 10
    const orders = [...mkOrders('TUKTA', 10), ...mkOrders('FAH', 10)];
    const funnel = [{ date: '2026-09-10', salesperson: 'TUKTA', leads: { Facebook: { new: 20, old: 20 } } }];
    expect(perfClose(orders, funnel)).toBe(25);
    expect(perfClose(orders, funnel)).toBe(reportClose(orders, funnel));
  });

  it('ทุกคนกรอกคนทัก = เลขเท่าเดิม (ไม่กระทบเคสปกติ)', () => {
    const orders = [...mkOrders('TUKTA', 10), ...mkOrders('FAH', 10)];
    const funnel = [
      { date: '2026-09-10', salesperson: 'TUKTA', leads: { Facebook: { new: 20, old: 20 } } },
      { date: '2026-09-10', salesperson: 'FAH', leads: { Facebook: { new: 10, old: 10 } } },
    ];
    expect(perfClose(orders, funnel)).toBeCloseTo(20 / 60 * 100, 6);
    expect(perfClose(orders, funnel)).toBeCloseTo(reportClose(orders, funnel), 6);
  });

  it('ไม่มีใครกรอกคนทักเลย = คืน null ทั้งคู่ (ไม่ใช่ 0%)', () => {
    const orders = mkOrders('TUKTA', 5);
    expect(perfClose(orders, [])).toBeNull();
    expect(reportClose(orders, [])).toBeNull();
  });

  it('มาร์เก็ตเพลสไม่นับเป็นออเดอร์ช่องแชท', () => {
    const orders = [...mkOrders('TUKTA', 10), ...mkOrders('TUKTA', 5, 'Shopee')];
    const funnel = [{ date: '2026-09-10', salesperson: 'TUKTA', leads: { Facebook: { new: 20, old: 20 } } }];
    expect(perfClose(orders, funnel)).toBe(25);   // 10 ไม่ใช่ 15
  });

  it('ชื่อเซลล์มีช่องว่างหัวท้ายในตารางคนทัก ต้องจับคู่กับออเดอร์ได้', () => {
    const orders = mkOrders('TUKTA', 10);
    const funnel = [{ date: '2026-09-10', salesperson: '  TUKTA  ', leads: { Facebook: { new: 20, old: 20 } } }];
    expect(perfClose(orders, funnel)).toBe(25);
  });
});

/* ---------- TikTok: "ช่องที่ไม่มีคนทัก" ต้องใช้นิยามเดียวกันทั้งไฟล์ ---------- */
describe('ช่องที่มีคนทัก — TikTok ต้องคิด %ปิดได้', () => {
  it('TikTok มีคนทัก → ต้องมี %ปิด ไม่ใช่ขึ้น "—"', () => {
    const orders = mkOrders('TUKTA', 18, 'TikTok');
    const funnel = [{ date: '2026-09-10', salesperson: 'TUKTA', leads: { TikTok: { new: 60, old: 60 } } }];
    const row = channelTable(orders, funnel, MANUAL, [], RANGE).rows.find(r => r.ch === 'TikTok');
    expect(row).toBeTruthy();
    expect(row.closeRate).toBeCloseTo(18 / 120 * 100, 6);   // เดิมเป็น null เพราะถูกตีว่าเป็นมาร์เก็ตเพลส
  });
  it('Shopee/Lazada/POS ยังถือว่าไม่มีคนทัก (ซื้อเลย ไม่ทักก่อน)', () => {
    const funnel = [{ date: '2026-09-10', salesperson: 'TUKTA', leads: { Facebook: { new: 10, old: 0 } } }];
    ['Shopee', 'Lazada', 'POS'].forEach(ch => {
      const row = channelTable(mkOrders('TUKTA', 5, ch), funnel, MANUAL, [], RANGE).rows.find(r => r.ch === ch);
      if (row) expect(row.closeRate).toBeNull();
    });
  });
});

/* ---------- จำนวนออเดอร์ MKP ที่กรอกมือ: นับเป็นออเดอร์ แต่ห้ามดัน %ปิด ---------- */
describe('ออเดอร์มาร์เก็ตเพลสที่กรอกมือ (ยุคใหม่)', () => {
  const manualWith = (ch, d, v) => ({ adByDate: {}, mpRevByDate: {}, statsByDate: { [ch]: { [d]: v } } });

  it('TikTok กรอก 20 ออเดอร์ → นับเข้าจำนวนออเดอร์ แต่ %ปิดไม่ขยับ', () => {
    const funnel = [{ date: '2026-09-10', salesperson: 'TUKTA', leads: { TikTok: { new: 50, old: 50 } } }];
    const orders = mkOrders('TUKTA', 10, 'TikTok');           // ปิดจริง 10 จาก 100
    const t = channelTable(orders, funnel, manualWith('TikTok', '2026-09-10', { ord: 20 }), [], RANGE);
    const row = t.rows.find(r => r.ch === 'TikTok');
    expect(row.orders).toBe(30);                               // 10 จริง + 20 กรอกมือ
    expect(row.closeRate).toBeCloseTo(10 / 100 * 100, 6);      // ตัวตั้งยังเป็น 10 ไม่ใช่ 30
  });

  it('Shopee กรอกจำนวน → เข้ายอดออเดอร์รวม และไม่มี %ปิด (ไม่ใช่ช่องแชท)', () => {
    const t = channelTable([], [], manualWith('Shopee', '2026-09-10', { ord: 15 }), [], RANGE);
    const row = t.rows.find(r => r.ch === 'Shopee');
    expect(row.orders).toBe(15);
    expect(row.closeRate).toBeNull();
    expect(t.total.orders).toBe(15);
  });
});

/* ============================================================
   funnel แถวที่ "ชื่อเซลล์ว่าง" — เคยให้ %ปิด 3 ค่าจากข้อมูลชุดเดียว (8 ก.ย. 69)
   ============================================================
   วัดได้จริง: channelTable 33.33% · buildPerf 29.41% · funnelCloseStats 27.78%
   เพราะ 3 ไฟล์จัดการแถวชื่อว่างคนละแบบ:
     salesOverviewAgg  → เติม '' เข้า set (ออเดอร์ที่ไม่ระบุเซลล์เข้าตัวเศษ + leads เข้าตัวส่วน)
     salePerfAgg       → ทิ้งทั้งแถว (leads หายจากตัวส่วนด้วย)
     funnelClose       → ตัด '' ออกจาก set แต่ leads ยังนับ
   กติกาที่ตัดสิน: แถวที่ระบุเซลล์ไม่ได้ = attribute ไม่ได้ → **ไม่นับทั้ง leads และ orders**
   (นับ leads แต่ไม่นับ orders = %ปิดต่ำเกินจริงของทุกคน · นับ orders ที่ไม่ระบุเซลล์ = พองเกินจริง)
   ============================================================ */
describe('funnel แถวชื่อเซลล์ว่าง ต้องได้ %ปิด เท่ากันทุกทาง', () => {
  it('ทั้ง 3 ทางต้องได้เลขเดียวกัน', async () => {
    const { funnelCloseStats } = await import('../funnelClose.js');
    const orders = [
      ...mkOrders('TUKTA', 5),
      ...mkOrders('', 1),          // ออเดอร์ที่ไม่ระบุเซลล์
    ];
    const funnel = [
      { salesperson: 'TUKTA', date: '2026-09-10', leads: { Facebook: { new: 17, old: 0 } } },
      { salesperson: '', date: '2026-09-10', leads: { Facebook: { new: 1, old: 0 } } },   // แถวชื่อว่าง
    ];
    const a = perfClose(orders, funnel);
    const b = reportClose(orders, funnel);
    const c = funnelCloseStats(funnel, orders, null).pct;
    expect(Math.round(a * 100) / 100).toBe(Math.round(b * 100) / 100);
    expect(Math.round(b * 100) / 100).toBe(Math.round(c * 100) / 100);
  });

  it('แถวชื่อว่างต้องไม่ถูกนับทั้งตัวเศษและตัวส่วน', async () => {
    const { funnelCloseStats } = await import('../funnelClose.js');
    const orders = [...mkOrders('TUKTA', 5), ...mkOrders('', 1)];
    const withBlank = [
      { salesperson: 'TUKTA', date: '2026-09-10', leads: { Facebook: { new: 17, old: 0 } } },
      { salesperson: '  ', date: '2026-09-10', leads: { Facebook: { new: 1, old: 0 } } },
    ];
    const clean = [withBlank[0]];
    expect(funnelCloseStats(withBlank, orders, null)).toMatchObject(
      { leads: funnelCloseStats(clean, orders, null).leads, orders: funnelCloseStats(clean, orders, null).orders },
    );
    expect(reportClose(orders, withBlank)).toBe(reportClose(orders, clean));
    expect(perfClose(orders, withBlank)).toBe(perfClose(orders, clean));
  });
});
