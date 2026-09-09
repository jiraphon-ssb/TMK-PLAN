/* ============================================================
   funnelClose — สูตร "คนทัก → ปิดการขาย" ที่เดียวทั้งระบบ (7 ก.ย. 69)
   ============================================================
   เกิดจากบั๊กจริง: หัวการ์ด "%ปิดการขาย" กับแท็บ "คนทัก & ปิดการขาย" ในจอเดียวกัน
   ให้เลขคนละค่า เพราะเขียนตรรกะแยกกัน 2 ที่แล้วเพี้ยนออกจากกัน
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { funnelCloseStats, leadsOfRow, nmSeller } from '../funnelClose.js';

const fr = (salesperson, leads) => ({ salesperson, leads });
const ord = (salesperson, channel, sales, source = 'shipnity') => ({ salesperson, channel, sales, source });

describe('leadsOfRow — กรองช่องทาง', () => {
  const row = fr('ฟ้า', { Facebook: { new: 20, old: 10 }, LINE: { new: 5, old: 5 } });

  it('ไม่กรอง = รวมทุกแพลตฟอร์ม', () => {
    expect(leadsOfRow(row, null)).toBe(40);
  });
  it('กรอง Facebook = นับเฉพาะ Facebook', () => {
    expect(leadsOfRow(row, new Set(['Facebook']))).toBe(30);
  });
  it("'อื่นๆ' ฝั่งฟอร์ม = 'Direct' ฝั่งออเดอร์", () => {
    const r = fr('ฟ้า', { 'อื่นๆ': { new: 7, old: 0 } });
    expect(leadsOfRow(r, new Set(['Direct']))).toBe(7);
    expect(leadsOfRow(r, new Set(['Facebook']))).toBe(0);
  });
});

describe('funnelCloseStats', () => {
  it('%ปิด = ออเดอร์ช่องแชทของเซลล์ที่กรอกคนทัก ÷ คนทัก', () => {
    const s = funnelCloseStats(
      [fr('ฟ้า', { Facebook: { new: 60, old: 40 } })],
      [ord('ฟ้า', 'Facebook', 1000), ord('ฟ้า', 'LINE', 500)],
    );
    expect(s.leads).toBe(100);
    expect(s.orders).toBe(2);
    expect(s.pct).toBe(2);
    expect(s.sales).toBe(1500);
  });

  it('⛔ กรองช่องทางแล้ว ตัวส่วนต้องหดตาม ไม่ใช่หดแต่ตัวเศษ (บั๊กที่ทำให้ 2 การ์ดไม่ตรงกัน)', () => {
    const rows = [fr('ฟ้า', { Facebook: { new: 200, old: 0 }, LINE: { new: 100, old: 0 } })];
    const fbOnly = [ord('ฟ้า', 'Facebook', 100), ord('ฟ้า', 'Facebook', 100)];
    // ตัวเศษถูกกรองมาแล้ว (2 ใบ FB) → ตัวส่วนต้องเป็น 200 ไม่ใช่ 300
    expect(funnelCloseStats(rows, fbOnly, new Set(['Facebook'])).pct).toBe(1);
    expect(funnelCloseStats(rows, fbOnly, null).pct).toBeCloseTo(0.667, 2);   // ของเดิม = ผิด
  });

  it('⛔ ชื่อเซลล์มีช่องว่างหัวท้าย ต้องยังจับคู่ได้ (เดิมตัวเศษเป็น 0 → %ปิด 0%)', () => {
    const s = funnelCloseStats(
      [fr('FAH ', { Facebook: { new: 10, old: 0 } })],
      [ord('FAH', 'Facebook', 100)],
    );
    expect(s.orders).toBe(1);
    expect(s.pct).toBe(10);
  });

  it('ออเดอร์ของเซลล์ที่ไม่ได้กรอกคนทัก ไม่นับเป็นตัวเศษ', () => {
    const s = funnelCloseStats(
      [fr('ฟ้า', { Facebook: { new: 10, old: 0 } })],
      [ord('ฟ้า', 'Facebook', 100), ord('ตุ๊กตา', 'Facebook', 900)],
    );
    expect(s.orders).toBe(1);
  });

  it('ชื่อเซลล์ว่างในแถวคนทัก ไม่ดูดออเดอร์ที่ไม่ระบุเซลล์เข้ามาเป็นตัวเศษ', () => {
    const s = funnelCloseStats(
      [fr('', { Facebook: { new: 40, old: 0 } })],
      [ord('', 'Facebook', 100), ord(null, 'Facebook', 100)],
    );
    expect(s.orders).toBe(0);
  });

  it('มาร์เก็ตเพลสไม่ใช่ช่องแชท — ไม่นับเป็นตัวเศษ', () => {
    const s = funnelCloseStats(
      [fr('ฟ้า', { Facebook: { new: 10, old: 0 } })],
      [ord('ฟ้า', 'Shopee', 500, 'shopee'), ord('ฟ้า', 'Facebook', 100)],
    );
    expect(s.orders).toBe(1);
  });

  it('ไม่มีคนทัก → pct = null (ไม่ใช่ 0 ที่ขึ้นแดงเหมือนปิดไม่ได้)', () => {
    expect(funnelCloseStats([], []).pct).toBeNull();
  });

  it('ออเดอร์มากกว่าคนทัก → over = true (กรอกคนทักไม่ครบ)', () => {
    const s = funnelCloseStats(
      [fr('ฟ้า', { Facebook: { new: 1, old: 0 } })],
      [ord('ฟ้า', 'Facebook', 1), ord('ฟ้า', 'Facebook', 1)],
    );
    expect(s.over).toBe(true);
  });

  it('nmSeller: null/undefined/ช่องว่าง → สตริงว่าง', () => {
    expect(nmSeller(null)).toBe('');
    expect(nmSeller('  ฟ้า  ')).toBe('ฟ้า');
  });
});

/* กรองช่องทางแล้ว "ใหม่/เก่า" ต้องหดตามด้วย — ไม่งั้นการ์ดติดกันขัดกันเอง
   (เจอจริงบนหน้าจอ: "คนทัก 755" แต่บรรทัดล่างเขียน "449 คน จาก 761 ที่ระบุ") */
describe('ใหม่/เก่า ต้องเคารพตัวกรองช่องทางเหมือนยอดคนทัก', () => {
  const row = fr('ฟ้า', { Facebook: { new: 20, old: 10 }, LINE: { new: 5, old: 5 } });

  it('ไม่กรอง = นับทุกแพลตฟอร์ม', () => {
    const s = funnelCloseStats([row], []);
    expect([s.leads, s.n, s.o]).toEqual([40, 25, 15]);
  });

  it('กรอง Facebook → ทั้งยอดคนทักและใหม่/เก่า ต้องเป็นของ Facebook เท่านั้น', () => {
    const s = funnelCloseStats([row], [], new Set(['Facebook']));
    expect([s.leads, s.n, s.o]).toEqual([30, 20, 10]);
    expect(s.n + s.o + s.u).toBe(s.leads);   // ผลรวมต้องเท่ากับยอดคนทักเสมอ
  });
});

/* ============================================================
   parity — %ปิด ต้องมาจาก funnelClose.js ที่เดียวจริง ๆ (8 ก.ย. 69)
   ============================================================
   บทเรียน: 7 ก.ย. รวมสูตรไป 2 จุด แล้วประกาศว่า "ทั้งระบบใช้สูตรเดียวกัน"
   ทั้งที่ยังเหลืออีก 3 จุด (daySummary · ตารางรายเซลล์ · กราฟรายวัน) ที่คิดเอง
   → เทสชุดนี้บังคับว่า daySummary ต้องได้เลขเดียวกับสูตรกลางเสมอ
   ============================================================ */
describe('daySummary ต้องได้ %ปิด เท่าสูตรกลาง', () => {
  const ord = (sp, ch, sales, source = 'shipnity') => ({
    salesperson: sp, channel: ch, sales, source, qty: 1, payment_type: 'โอน', order_date: '2026-09-05',
  });

  it('เซลล์ที่ไม่ได้กรอกคนทัก ต้องไม่ดันตัวเศษให้พอง (เคสที่เคยขึ้น 40% vs 15%)', async () => {
    const { daySummary } = await import('../../orderCard.jsx');
    const dayFunnel = [{ salesperson: 'A', date: '2026-09-05', leads: { Facebook: { new: 20, old: 0 } } }];
    const ords = [...Array(3)].map(() => ord('A', 'Facebook', 100))
      .concat([...Array(5)].map(() => ord('B', 'Facebook', 100)));
    const sum = daySummary(ords, dayFunnel);
    const st = funnelCloseStats(dayFunnel, ords, null);
    expect(sum.close).toBe(Math.round(st.pct));
    expect(sum.close).toBe(15);          // ไม่ใช่ 40
    expect(sum.chatOrders).toBe(st.orders);
    expect(sum.leads).toBe(st.leads);
  });

  it('ไม่มีคนทักในวันนั้น → close = null (ไม่ใช่ 0 ที่ขึ้นแดง)', async () => {
    const { daySummary } = await import('../../orderCard.jsx');
    expect(daySummary([ord('A', 'Facebook', 100)], []).close).toBeNull();
  });

  it('มาร์เก็ตเพลสไม่เข้าตัวเศษ (ตรงกับสูตรกลาง)', async () => {
    const { daySummary } = await import('../../orderCard.jsx');
    const dayFunnel = [{ salesperson: 'A', date: '2026-09-05', leads: { Facebook: { new: 10, old: 0 } } }];
    const ords = [ord('A', 'Shopee', 500, 'shopee'), ord('A', 'Facebook', 100)];
    expect(daySummary(ords, dayFunnel).chatOrders).toBe(1);
  });
});
