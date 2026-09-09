/* homeAgg — ตรรกะหน้าแรก (pure) · เขียนเทสก่อนโค้ด (TDD) */
import { describe, it, expect } from 'vitest';
import { teamDaily, dailySeries, todayPulse, monthPace, sellerRank, buildTodos, missingFunnelYesterday, countNoSeller } from '../homeAgg.js';

/* ---------- teamDaily ---------- */
describe('teamDaily', () => {
  it('รวมยอด/ออเดอร์/คนทัก รายวันของทุกเซลล์', () => {
    const rows = [
      { daily: [{ day: 1, sales: 100, orders: 1, leads: 5 }, { day: 2, sales: 200, orders: 2, leads: 4 }] },
      { daily: [{ day: 1, sales: 50, orders: 1, leads: 3 }, { day: 2, sales: 0, orders: 0, leads: 0 }] },
    ];
    const d = teamDaily(rows, 2);
    expect(d).toEqual([
      { day: 1, sales: 150, orders: 2, leads: 8 },
      { day: 2, sales: 200, orders: 2, leads: 4 },
    ]);
  });
  it('ไม่มีเซลล์ = ทุกวันเป็น 0 (ยาวเท่า dim)', () => {
    const d = teamDaily([], 3);
    expect(d).toHaveLength(3);
    expect(d.every(x => x.sales === 0)).toBe(true);
  });
  it('ข้ามวันที่เกิน dim (ข้อมูลเพี้ยนไม่ทำให้พัง)', () => {
    const d = teamDaily([{ daily: [{ day: 99, sales: 999, orders: 1, leads: 1 }] }], 2);
    expect(d.reduce((a, x) => a + x.sales, 0)).toBe(0);
  });
});

/* ---------- dailySeries: ต่อเดือนก่อน+เดือนนี้เป็นเส้นเดียว (ข้ามขอบเดือน) ---------- */
describe('dailySeries', () => {
  it('ต่อวันของ 2 เดือนเรียงตามวันที่จริง', () => {
    const cur = { days: [{ day: 1, sales: 100, orders: 1 }, { day: 2, sales: 200, orders: 2 }] };
    const prev = { days: [{ day: 30, sales: 50, orders: 1 }, { day: 31, sales: 70, orders: 3 }] };
    const s = dailySeries(cur, '2026-09', prev, '2026-08');
    expect(s.map(x => x.iso)).toEqual(['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
    expect(s.map(x => x.sales)).toEqual([50, 70, 100, 200]);
  });
  it('ไม่มีเดือนก่อน = ใช้เฉพาะเดือนนี้', () => {
    const s = dailySeries({ days: [{ day: 5, sales: 9, orders: 1 }] }, '2026-09', null, '2026-08');
    expect(s).toEqual([{ iso: '2026-09-05', sales: 9, orders: 1, mpManual: 0, leads: 0 }]);
  });
  it('ไม่มีข้อมูลเลย = ลิสต์ว่าง', () => {
    expect(dailySeries(null, '2026-09', null, '2026-08')).toEqual([]);
  });
  it('เติมคนทักรายวันทับได้ (leadsByIso)', () => {
    const s = dailySeries({ days: [{ day: 1, sales: 100, orders: 1 }] }, '2026-09', null, '2026-08', { '2026-09-01': 12 });
    expect(s[0].leads).toBe(12);
  });
});

/* ---------- todayPulse ---------- */
describe('todayPulse', () => {
  const mk = (isoStart, arr) => arr.map((sales, i) => {
    const d = new Date(isoStart + 'T00:00:00'); d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { iso, sales, orders: sales ? 1 : 0, leads: sales ? 2 : 0 };
  });
  it('แยกยอดวันนี้/เมื่อวาน และเฉลี่ย 7 วันก่อนหน้า (ไม่นับวันนี้)', () => {
    const p = todayPulse(mk('2026-09-01', [100, 100, 100, 100, 100, 100, 100, 100, 300]), '2026-09-09');
    expect(p.today).toBe(300);
    expect(p.yest).toBe(100);
    expect(p.avg7).toBe(100);
    expect(p.dAvg7).toBe(200);
  });
  it('ข้ามขอบเดือนได้: 1 ก.ย. ต้องเห็นยอด 31 ส.ค. เป็น "เมื่อวาน"', () => {
    const p = todayPulse(mk('2026-08-26', [10, 20, 30, 40, 50, 60, 70, 555]), '2026-09-02');
    // 26–31 ส.ค. + 1 ก.ย. = 7 วันก่อนหน้า · วันนี้ 2 ก.ย. = 555
    expect(p.today).toBe(555);
    expect(p.yest).toBe(70);          // 1 ก.ย.
    expect(p.avg7).toBe((10 + 20 + 30 + 40 + 50 + 60 + 70) / 7);
  });
  it('วันแรกที่มีข้อมูลจริง ๆ = ไม่มีเมื่อวาน → null ไม่ใช่ 0', () => {
    const p = todayPulse(mk('2026-09-01', [500]), '2026-09-01');
    expect(p.today).toBe(500);
    expect(p.yest).toBeNull();
    expect(p.avg7).toBeNull();
    expect(p.dAvg7).toBeNull();
  });
  it('วันนี้ไม่มีแถว (ยังไม่มีออเดอร์) = 0 แต่เมื่อวานยังอ่านได้', () => {
    const p = todayPulse(mk('2026-08-30', [80, 90]), '2026-09-01');
    expect(p.today).toBe(0);
    expect(p.yest).toBe(90);          // 31 ส.ค.
    expect(p.avg7).toBe(85);
  });
  it('เฉลี่ยเป็น 0 → ไม่หารศูนย์ (dAvg7 = null)', () => {
    const p = todayPulse(mk('2026-09-01', [0, 0, 400]), '2026-09-03');
    expect(p.avg7).toBe(0);
    expect(p.dAvg7).toBeNull();
  });
  it('วันเก่าที่อยู่นอกหน้าต่าง 7 วัน ต้องไม่ถูกดึงมาคิด', () => {
    const series = [{ iso: '2026-08-01', sales: 9999, orders: 0, leads: 0 }, ...mk('2026-09-01', [100, 200])];
    const p = todayPulse(series, '2026-09-02');
    // หน้าต่าง = 26 ส.ค.–1 ก.ย. (7 วัน) · มีข้อมูลจริงแค่ 1 ก.ย. = 100 · อีก 6 วันขายไม่ได้ = 0
    // 1 ส.ค. (9999) อยู่นอกหน้าต่าง ต้องไม่ถูกนับ — นี่คือสิ่งที่เทสนี้ล็อก
    expect(p.avg7).toBeCloseTo(100 / 7, 6);
    expect(p.avg7).toBeLessThan(200);   // ถ้า 9999 หลุดเข้ามา ค่าจะพุ่งทันที
  });
});

/* ---------- monthPace ---------- */
describe('monthPace', () => {
  it('คำนวณ %เป้า · คาดการณ์สิ้นเดือน · ส่วนต่าง', () => {
    const m = monthPace(500000, 1000000, 15, 30);
    expect(m.pct).toBe(50);
    expect(m.projected).toBeCloseTo(1000000, 5);
    expect(m.gap).toBe(500000);
    expect(m.zone).toBe('ontrack');
  });
  it('ทำเกินเป้าแล้ว = over (gap เป็น 0 ไม่ติดลบ)', () => {
    const m = monthPace(1200000, 1000000, 20, 30);
    expect(m.zone).toBe('over');
    expect(m.gap).toBe(0);
  });
  it('คาดการณ์ไม่ถึงเป้า = risk', () => {
    expect(monthPace(200000, 1000000, 15, 30).zone).toBe('risk');
  });
  it('ไม่มีเป้า = null ทุกช่อง (ไม่โชว์เกจ)', () => {
    const m = monthPace(500000, 0, 15, 30);
    expect(m.pct).toBeNull();
    expect(m.zone).toBeNull();
    expect(m.projected).toBeCloseTo(1000000, 5);   // คาดการณ์ยังคำนวณได้
  });
  it('daysPassed = 0 ไม่หารศูนย์', () => {
    expect(monthPace(0, 1000000, 0, 30).projected).toBe(0);
  });
  it('paceTarget = เป้าที่ควรทำได้ถึงวันนี้', () => {
    expect(monthPace(0, 300000, 10, 30).paceTarget).toBe(100000);
  });
});

/* ---------- sellerRank ---------- */
describe('sellerRank', () => {
  const rows = [
    { name: 'A', sales: 300, target: 1000, pctTarget: 30, daily: [{ day: 1, sales: 300, orders: 1, leads: 0 }] },
    { name: 'B', sales: 500, target: 0, pctTarget: null, daily: [{ day: 1, sales: 500, orders: 2, leads: 0 }] },
    { name: 'ไม่ระบุเซลล์', sales: 900, target: 0, pctTarget: null, daily: [{ day: 1, sales: 900, orders: 3, leads: 0 }] },
  ];
  it('เรียงตามยอด และตัดแถว "ไม่ระบุเซลล์" ออก (ไม่ใช่คน)', () => {
    const r = sellerRank(rows, 5, 1);
    expect(r.map(x => x.name)).toEqual(['B', 'A']);
  });
  it('ใส่ยอดวันนี้ของแต่ละคน', () => {
    expect(sellerRank(rows, 5, 1)[0].today).toBe(500);
  });
  it('จำกัดจำนวนตาม limit', () => {
    expect(sellerRank(rows, 1, 1)).toHaveLength(1);
  });
});

/* ---------- buildTodos ---------- */
describe('buildTodos', () => {
  const base = { dueTasks: [], po: null, missingFunnel: [], noSeller: 0, outOfStock: 0 };
  it('ไม่มีอะไรค้าง = ลิสต์ว่าง', () => {
    expect(buildTodos(base)).toEqual([]);
  });
  it('เรียงตามความร้อน: bad มาก่อน warn ก่อน info', () => {
    const t = buildTodos({
      ...base,
      dueTasks: [{ title: 'งาน ก' }],                    // warn
      po: { open: 3, late: 1, sum: {} },                  // bad
      noSeller: 4,                                        // info
    });
    expect(t.map(x => x.level)).toEqual(['bad', 'warn', 'info']);
  });
  it('ใบสั่งผลิตเลยกำหนดชนะใบที่เปิดอยู่ (ไม่ขึ้นซ้ำ 2 แถว)', () => {
    const t = buildTodos({ ...base, po: { open: 5, late: 2, sum: {} } });
    expect(t).toHaveLength(1);
    expect(t[0].level).toBe('bad');
  });
  it('เซลล์ยังไม่กรอกคนทักเมื่อวาน → ขึ้นชื่อคน', () => {
    const t = buildTodos({ ...base, missingFunnel: ['ฟ้า', 'มิ้น'] });
    expect(t[0].detail).toContain('ฟ้า');
    expect(t[0].detail).toContain('มิ้น');
  });
  it('ทุกแถวมีปลายทางให้กด (key ที่ไม่ซ้ำ)', () => {
    const t = buildTodos({ ...base, dueTasks: [{ title: 'x' }], po: { open: 1, late: 0, sum: {} }, missingFunnel: ['ฟ้า'], noSeller: 2, outOfStock: 3 });
    expect(new Set(t.map(x => x.key)).size).toBe(t.length);
    expect(t.every(x => x.go && x.go.length === 2)).toBe(true);
  });
});

/* ---------- missingFunnelYesterday ---------- */
describe('missingFunnelYesterday', () => {
  const targets = { 'ฟ้า': { sales_target: 100000 }, 'มิ้น': { sales_target: 50000 }, 'เก่า': { sales_target: 0 } };
  it('คืนชื่อเซลล์ที่มีเป้า แต่ไม่มีแถวคนทักของเมื่อวาน', () => {
    const funnel = [{ date: '2026-09-01', salesperson: 'ฟ้า' }];
    expect(missingFunnelYesterday(funnel, targets, '2026-09-01')).toEqual(['มิ้น']);
  });
  it('เซลล์ที่เป้าเป็น 0 ไม่นับ (ไม่ได้ทำยอดเดือนนี้)', () => {
    expect(missingFunnelYesterday([], targets, '2026-09-01')).toEqual(['ฟ้า', 'มิ้น']);
  });
  it('ตัดช่องว่างหัวท้ายของชื่อก่อนเทียบ', () => {
    expect(missingFunnelYesterday([{ date: '2026-09-01', salesperson: ' ฟ้า ' }], targets, '2026-09-01')).toEqual(['มิ้น']);
  });
  it('ไม่มีเป้าเลย = ไม่เตือน (ยังไม่ตั้งเป้า ไม่ใช่ความผิดใคร)', () => {
    expect(missingFunnelYesterday([], {}, '2026-09-01')).toEqual([]);
  });
  it('แถวของวันอื่นไม่นับว่ากรอกแล้ว', () => {
    expect(missingFunnelYesterday([{ date: '2026-08-31', salesperson: 'ฟ้า' }], targets, '2026-09-01')).toEqual(['ฟ้า', 'มิ้น']);
  });
});

/* ---------- countNoSeller ---------- */
describe('countNoSeller', () => {
  it('นับออเดอร์ที่ไม่มีชื่อเซลล์ (ตัดใบยกเลิก)', () => {
    const orders = [
      { salesperson: 'ฟ้า', status: 'done' },
      { salesperson: '', status: 'done' },
      { salesperson: '   ', status: 'done' },
      { salesperson: '', status: 'cancelled' },
      { status: 'done' },
    ];
    expect(countNoSeller(orders)).toBe(3);
  });
  it('ลิสต์ว่าง = 0', () => expect(countNoSeller([])).toBe(0));
});

/* ---------- buildTodos: เตือนเป้าเดือนใหม่ยังไม่ได้ตั้ง (A4) ---------- */
describe('buildTodos · เป้าเดือนใหม่', () => {
  const base = { dueTasks: [], po: null, missingFunnel: [], noSeller: 0, outOfStock: 0 };
  it('แอดมิน + ยังไม่ตั้งเป้าเดือนรวม → เตือน พร้อมพาไปหน้าตั้งค่า', () => {
    const t = buildTodos({ ...base, targetGap: { isAdmin: true, month: 'ก.ย.', noMonthTarget: true, noPeopleTarget: false } });
    expect(t).toHaveLength(1);
    expect(t[0].level).toBe('warn');
    expect(t[0].go).toEqual(['settings', 'targets']);
    expect(t[0].title).toContain('ก.ย.');
  });
  it('ขาดทั้งเป้าเดือนและเป้ารายคน → ยังเป็นแถวเดียว (ไม่รก)', () => {
    const t = buildTodos({ ...base, targetGap: { isAdmin: true, month: 'ก.ย.', noMonthTarget: true, noPeopleTarget: true } });
    expect(t).toHaveLength(1);
    expect(t[0].detail).toContain('ค่าคอม');
  });
  it('ไม่ใช่แอดมิน = ไม่เตือน (แก้ไม่ได้อยู่ดี)', () => {
    expect(buildTodos({ ...base, targetGap: { isAdmin: false, month: 'ก.ย.', noMonthTarget: true, noPeopleTarget: true } })).toEqual([]);
  });
  it('ตั้งเป้าครบแล้ว = ไม่เตือน', () => {
    expect(buildTodos({ ...base, targetGap: { isAdmin: true, month: 'ก.ย.', noMonthTarget: false, noPeopleTarget: false } })).toEqual([]);
  });
  it('เตือนเป้าอยู่เหนืองานค้าง แต่ใต้ของที่เลยกำหนด', () => {
    const t = buildTodos({
      ...base, po: { open: 1, late: 1, sum: {} }, dueTasks: [{ title: 'ก' }],
      targetGap: { isAdmin: true, month: 'ก.ย.', noMonthTarget: true, noPeopleTarget: false },
    });
    expect(t.map(x => x.key)).toEqual(['po-late', 'target-gap', 'tasks']);
  });
});

/* ---------- เตือนเป้าต้องอิง "รอบค่าคอม" ไม่ใช่แค่เดือนปฏิทิน (ข้อ 2) ---------- */
describe('buildTodos · เป้าของรอบคอม', () => {
  const base = { dueTasks: [], po: null, missingFunnel: [], noSeller: 0, outOfStock: 0 };
  it('รอบคอมที่กำลังเดินจบเดือนหน้า และเดือนนั้นยังไม่มีเป้า → เตือนตั้งแต่วันที่ 26', () => {
    const t = buildTodos({
      ...base,
      targetGap: { isAdmin: true, month: 'ก.ย.', noMonthTarget: false, noPeopleTarget: false, cycleMonth: 'ต.ค.', noCycleTarget: true },
    });
    expect(t).toHaveLength(1);
    expect(t[0].key).toBe('target-gap');
    expect(t[0].title).toContain('ต.ค.');
    expect(t[0].detail).toContain('ค่าคอม');
  });
  it('เป้ารอบคอมมีแล้ว = ไม่เตือน', () => {
    expect(buildTodos({ ...base, targetGap: { isAdmin: true, month: 'ก.ย.', noMonthTarget: false, noPeopleTarget: false, cycleMonth: 'ต.ค.', noCycleTarget: false } })).toEqual([]);
  });
  it('ขาดทั้งเป้าเดือนนี้และเป้ารอบคอม → รวมเป็นแถวเดียว บอกทั้งสองเดือน', () => {
    const t = buildTodos({
      ...base,
      targetGap: { isAdmin: true, month: 'ก.ย.', noMonthTarget: true, noPeopleTarget: true, cycleMonth: 'ต.ค.', noCycleTarget: true },
    });
    expect(t).toHaveLength(1);
    expect(t[0].title).toContain('ก.ย.');
    expect(t[0].title).toContain('ต.ค.');
  });
  it('รอบคอมจบเดือนเดียวกับเดือนนี้ = ไม่พูดถึงสองเดือน', () => {
    const t = buildTodos({
      ...base,
      targetGap: { isAdmin: true, month: 'ก.ย.', noMonthTarget: true, noPeopleTarget: false, cycleMonth: 'ก.ย.', noCycleTarget: true },
    });
    expect(t[0].title).toBe('ยังไม่ได้ตั้งเป้าเดือน ก.ย.');
  });
});

/* ---------- วันที่ไม่มีออเดอร์ ต้องนับเป็น 0 ไม่ใช่หายไป (บั๊กจากรอบตรวจ 2 ก.ย.) ---------- */
describe('วันที่ขายไม่ได้เลย = ยอด 0 ไม่ใช่ "ไม่มีวันนั้น"', () => {
  it('เฉลี่ย 7 วัน ต้องหารด้วย 7 วันปฏิทิน ไม่ใช่จำนวนวันที่มีออเดอร์', () => {
    // 1-5 ก.ย. วันละ 100 · 6 ก.ย. ยอด 0 (มีแถว) · 7 ก.ย. ไม่มีแถวเลย · วันนี้ = 8 ก.ย.
    const mm = { days: [
      { day: 1, sales: 100, orders: 1 }, { day: 2, sales: 100, orders: 1 }, { day: 3, sales: 100, orders: 1 },
      { day: 4, sales: 100, orders: 1 }, { day: 5, sales: 100, orders: 1 }, { day: 6, sales: 0, orders: 0 },
    ] };
    const p = todayPulse(dailySeries(mm, '2026-09', null, '2026-08'), '2026-09-08');
    expect(p.avg7).toBeCloseTo(500 / 7, 6);      // ไม่ใช่ 500/6 = 83.33
  });

  it('คนทักของวันที่ยังไม่มีออเดอร์ ต้องไม่หาย', () => {
    // วันนี้ 2 ก.ย. ยังไม่มีออเดอร์ แต่กรอกคนทักไว้ 25
    const s = dailySeries({ days: [{ day: 1, sales: 100, orders: 1 }] }, '2026-09', null, '2026-08', { '2026-09-02': 25 });
    expect(todayPulse(s, '2026-09-02').leads).toBe(25);
  });

  it('เมื่อวานไม่มีออเดอร์แต่มีคนทัก → ยอด 0 และคนทักอยู่ครบ', () => {
    const s = dailySeries({ days: [{ day: 1, sales: 500, orders: 2 }] }, '2026-09', null, '2026-08', { '2026-09-02': 10, '2026-09-03': 7 });
    const p = todayPulse(s, '2026-09-03');
    expect(p.yest).toBe(0);       // 2 ก.ย. ไม่มีออเดอร์ = ขายไม่ได้ ไม่ใช่ "ไม่มีวัน"
    expect(p.leads).toBe(7);
  });

  it('วันที่มีแต่คนทัก ต้องถูกนับในตัวส่วนของเฉลี่ย 7 วันด้วย', () => {
    const s = dailySeries({ days: [{ day: 1, sales: 700, orders: 1 }] }, '2026-09', null, '2026-08', { '2026-09-02': 5 });
    expect(s.map(d => d.iso)).toEqual(['2026-09-01', '2026-09-02']);   // วันที่มีแต่คนทักต้องมีแถว
    /* วันนี้ 3 ก.ย. · หน้าต่าง 7 วันถูก clamp ด้วย "วันแรกที่มีข้อมูล" (1 ก.ย.)
       → ตัวส่วน = 1-2 ก.ย. = 2 วัน · ไม่แต่งศูนย์ให้ช่วงที่ระบบยังไม่มีข้อมูล */
    expect(todayPulse(s, '2026-09-03').avg7).toBeCloseTo(700 / 2, 6);
  });

  it('ไม่มีข้อมูลอะไรเลย = avg7 null (ไม่ใช่ 0)', () => {
    expect(todayPulse(dailySeries(null, '2026-09', null, '2026-08'), '2026-09-08').avg7).toBeNull();
  });
});

/* ---------- หน้าแรกต้องเคารพ "ล็อกหน้า" (locked_sections) ---------- */
describe('homeMoneyVisibility — หน้าหลักล็อกไม่ได้ แต่ของบนหน้าต้องเคารพสิทธิ์', () => {
  it('ไม่ล็อกอะไร = เห็นครบ', async () => {
    const { homeMoneyVisibility } = await import('../homeAgg.js');
    expect(homeMoneyVisibility([])).toEqual({ showCompanyMoney: true, showSellerBoard: true });
    expect(homeMoneyVisibility(null)).toEqual({ showCompanyMoney: true, showSellerBoard: true });
  });
  it('ล็อกทั้ง section ยอดขาย = ซ่อนทั้งเงินบริษัทและอันดับเซลล์', async () => {
    const { homeMoneyVisibility } = await import('../homeAgg.js');
    expect(homeMoneyVisibility(['catalog'])).toEqual({ showCompanyMoney: false, showSellerBoard: false });
  });
  it('ล็อกเฉพาะรายงานขาย = ซ่อนเงินบริษัท แต่อันดับเซลล์ยังอยู่', async () => {
    const { homeMoneyVisibility } = await import('../homeAgg.js');
    expect(homeMoneyVisibility(['catalog:report'])).toEqual({ showCompanyMoney: false, showSellerBoard: true });
  });
  it('ล็อกเฉพาะประสิทธิภาพเซล = ซ่อนอันดับเซลล์ (มี %เป้ารายคน) แต่เงินบริษัทยังอยู่', async () => {
    const { homeMoneyVisibility } = await import('../homeAgg.js');
    expect(homeMoneyVisibility(['catalog:perf'])).toEqual({ showCompanyMoney: true, showSellerBoard: false });
  });
  it('ล็อกหน้าอื่นที่ไม่เกี่ยวกับเงิน = ไม่กระทบ', async () => {
    const { homeMoneyVisibility } = await import('../homeAgg.js');
    expect(homeMoneyVisibility(['flows', 'logs', 'catalog:stock'])).toEqual({ showCompanyMoney: true, showSellerBoard: true });
  });
});

describe('buildTodos · ไม่ชี้ไปหน้าที่ถูกล็อก', () => {
  const base = { dueTasks: [{ title: 'ก' }], po: { open: 0, late: 2, sum: {} }, missingFunnel: [], noSeller: 0, outOfStock: 0 };
  it('ล็อกหน้าสต็อก → แถวใบสั่งผลิตหายไป (กดแล้วเข้าไม่ได้อยู่ดี)', () => {
    const t = buildTodos({ ...base, locked: ['catalog:stock'] });
    expect(t.map(x => x.key)).toEqual(['tasks']);
  });
  it('ล็อกทั้ง section → หายทุกแถวของ section นั้น', () => {
    expect(buildTodos({ ...base, locked: ['catalog', 'flows'] })).toEqual([]);
  });
  it('ไม่ล็อกอะไร = เหมือนเดิม', () => {
    expect(buildTodos({ ...base }).map(x => x.key)).toEqual(['po-late', 'tasks']);
  });
});

/* ============================================================
   ⛔ "−44% เทียบเฉลี่ย 7 วัน" ที่เทียบคนละฐาน (9 ก.ย. 69)
   ============================================================
   mm.days[].sales = ออเดอร์จริง **บวก** ยอดมาร์เก็ตเพลสที่กรอกมือของวันนั้น
   แต่ยอดกรอกมือถูกกรอกตามหลัง (ปกติสิ้นวัน/สิ้นสัปดาห์) → "วันนี้" แทบไม่เคยมี
   → ตัวตั้ง = ออเดอร์ล้วน · ตัวหาร = ออเดอร์ + มาร์เก็ตเพลส = ติดลบทุกวันโดยไม่มีเหตุ
   ต้องบอกออกมาว่าเทียบคนละฐาน ไม่ใช่โชว์ −44% เป็นข้อเท็จจริง
   ============================================================ */
describe('todayPulse — เทียบเฉลี่ย 7 วันต้องเป็นฐานเดียวกัน', () => {
  const d = (iso, sales, mpManual = 0) => ({ iso, sales, orders: 1, leads: 0, mpManual });

  it('ไม่มียอดกรอกมือเลย → เทียบได้ตามปกติ ไม่ต้องเตือน', () => {
    const s = [d('2026-09-06', 1000), d('2026-09-07', 1000), d('2026-09-08', 1000), d('2026-09-09', 500)];
    const p = todayPulse(s, '2026-09-09');
    expect(Math.round(p.dAvg7)).toBe(-50);
    expect(p.mixedBasis).toBe(false);
  });

  it('⛔ เฉลี่ย 7 วันมียอดกรอกมือ แต่วันนี้ยังไม่มี → ต้องตั้งธง mixedBasis', () => {
    const s = [d('2026-09-06', 1000, 600), d('2026-09-07', 1000, 600), d('2026-09-08', 1000, 600), d('2026-09-09', 500)];
    const p = todayPulse(s, '2026-09-09');
    expect(p.mixedBasis).toBe(true);
    expect(p.avg7).toBe(1000);          // ตัวเลขที่โชว์ยังเป็นยอดจริงเต็ม ไม่บิดเบือน
  });

  it('วันนี้ก็มียอดกรอกมือแล้ว → ฐานเดียวกัน ไม่ต้องเตือน', () => {
    const s = [d('2026-09-08', 1000, 600), d('2026-09-09', 900, 400)];
    expect(todayPulse(s, '2026-09-09').mixedBasis).toBe(false);
  });
});

/* dailySeries ต้องพา mpManual ต่อออกมาด้วย ไม่งั้น todayPulse ตรวจฐานไม่ได้ */
describe('dailySeries — พา mpManual ต่อจาก mm.days', () => {
  it('วันที่มีแต่ยอดมาร์เก็ตเพลสกรอกมือ ต้องติด mpManual มาด้วย', () => {
    const mm = { days: [{ day: 7, sales: 2500, orders: 0, mpManual: 2500 }] };
    const [row] = dailySeries(mm, '2026-09', null, null);
    expect(row.iso).toBe('2026-09-07');
    expect(row.mpManual).toBe(2500);
  });
});
