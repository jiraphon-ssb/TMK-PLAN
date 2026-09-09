import { describe, it, expect } from 'vitest';
import {
  channelTable, customerInsight, customerSeries, funnelSummary, manualEntryAgg,
  crmTeamOf, isMergedEra, MERGE_CUTOFF, REPEAT_TARGET, mpExtraRevenue, mergeBounds } from '../salesOverviewAgg.js';
import { mpRevByDateOf } from '../../../supabase/functions/_shared/saleFormulas.js';

/* ล็อก decision จาก docs/PLAN-SALES-MERGE.md — ทุกเคสคือกฎธุรกิจที่ user เคาะแล้ว */

const ord = (o) => ({ status: 'confirmed', qty: 1, source: 'shipnity', ...o });

describe('D6 cutoff', () => {
  it('ก่อน 1 ก.ย. 69 = ยุคเก่า · ตั้งแต่ 1 ก.ย. = สูตรใหม่', () => {
    expect(MERGE_CUTOFF).toBe('2026-08-01');
    expect(isMergedEra('2026-07-31')).toBe(false);
    expect(isMergedEra('2026-08-01')).toBe(true);
    expect(isMergedEra('2026-12-15')).toBe(true);
  });
});

describe('D8 ทีม CRM = คนที่มีเป้า CRM > 0', () => {
  it('คัดเฉพาะคนที่ตั้งเป้าจริง', () => {
    const team = crmTeamOf([
      { salesperson: 'FAH', sales_target: 100000 },
      { salesperson: 'PAI', sales_target: 0 },
      { salesperson: '', sales_target: 500 },
    ]);
    expect([...team]).toEqual(['FAH']);
  });
});

describe('manualEntryAgg — ค่าแอด/ยอด mp/โน้ต/เวลาแชท ที่กรอกมือ', () => {
  const rows = [
    { date: '2026-09-01', channels: { Facebook: { ad: 1000 }, Shopee: { rev: 5000, ad: 200 } }, note: 'ไลฟ์เย็น', avg_reply_minutes: 10 },
    { date: '2026-09-02', channels: { Facebook: { ad: 500 }, Shopee: { rev: 2000 } }, avg_reply_minutes: 20 },
  ];
  it('รวมค่าแอดต่อช่องทาง + ยอด mp + โน้ต + เวลาตอบแชทเฉลี่ย', () => {
    const m = manualEntryAgg(rows);
    expect(m.ad.Facebook).toBe(1500);
    expect(m.ad.Shopee).toBe(200);
    expect(m.mpRev.Shopee).toBe(7000);
    expect(m.notes).toEqual([{ date: '2026-09-01', note: 'ไลฟ์เย็น' }]);
    expect(m.replyMins).toBe(15);
  });
  it('ไม่เก็บ rev ของช่องแชท (กรอกได้เฉพาะมาร์เก็ตเพลส · D4)', () => {
    const m = manualEntryAgg([{ date: '2026-09-01', channels: { Facebook: { rev: 9999, ad: 100 } } }]);
    expect(m.mpRev.Facebook).toBeUndefined();
    expect(m.ad.Facebook).toBe(100);
  });
});

describe('channelTable — D2/D4/D5', () => {
  const orders = [
    ord({ channel: 'Facebook', sales: 1000, customer_type: 'ลูกค้าใหม่', salesperson: 'PAI' }),
    ord({ channel: 'Facebook', sales: 500, customer_type: 'ลูกค้าเก่า', salesperson: 'PAI' }),
    ord({ channel: 'Facebook', sales: 9999, status: 'cancelled', salesperson: 'PAI' }), // ต้องถูกตัด
    ord({ channel: 'LINE', sales: 800, customer_type: 'ลูกค้าเก่า', salesperson: 'FAH' }),
  ];
  const funnel = [{ salesperson: 'PAI', date: '2026-09-01', leads: { Facebook: { new: 6, old: 4 } } }];

  it('ตัดยกเลิก · รวมต่อช่องทาง · คนทักมาจาก funnel · %ปิดใช้ออเดอร์ช่องแชท', () => {
    const { rows, total } = channelTable(orders, funnel, manualEntryAgg([]), new Set());
    const fb = rows.find(r => r.ch === 'Facebook');
    expect(fb.sales).toBe(1500);
    expect(fb.orders).toBe(2);
    expect(fb.leads).toBe(10);
    expect(fb.closeRate).toBe(20);      // 2 ปิด / 10 ทัก
    expect(fb.over).toBe(false);
    expect(fb.newC).toBe(1); expect(fb.oldC).toBe(1);
    expect(total.sales).toBe(2300);     // 1500 + 800 (ไม่นับ cancelled)
  });

  it('ปิด > ทัก → over = true (คนทักกรอกไม่ครบ · อย่าโชว์ % มั่ว)', () => {
    const many = Array.from({ length: 20 }, () => ord({ channel: 'Phone', sales: 100, salesperson: 'X' }));
    const f = [{ salesperson: 'X', date: '2026-09-01', leads: { Phone: { new: 1, old: 1 } } }];
    const { rows } = channelTable(many, f, manualEntryAgg([]), new Set());
    expect(rows.find(r => r.ch === 'Phone').over).toBe(true);
  });

  /* %ปิด ต้องเป็นสูตรเดียวทั้งจอ: ตัวตั้ง = ออเดอร์ช่องแชทของ "เซลล์ที่กรอกคนทัก" เท่านั้น
     (เดิมการ์ด KPI ใช้กติกานี้ แต่บรรทัดรวมในตารางช่องทางนับออเดอร์ทุกคน → เลขขัดกันบนจอเดียว) */
  it('%ปิด ไม่นับออเดอร์ของเซลล์ที่ไม่ได้กรอกคนทัก', () => {
    const orders = [
      ...Array.from({ length: 24 }, () => ord({ channel: 'Facebook', sales: 100, salesperson: 'FAH' })),
      ...Array.from({ length: 20 }, () => ord({ channel: 'Facebook', sales: 100, salesperson: 'NOK' })),
    ];
    const f = [{ salesperson: 'FAH', date: '2026-09-01', leads: { Facebook: { new: 100, old: 100 } } }];
    const { rows, total } = channelTable(orders, f, manualEntryAgg([]), new Set());
    const fb = rows.find(r => r.ch === 'Facebook');
    expect(fb.leads).toBe(200);
    expect(fb.chatOrders).toBe(44);          // ออเดอร์แชททั้งหมด (ยังเก็บไว้ให้ดู)
    expect(fb.chatClosed).toBe(24);          // แต่ตัวตั้ง %ปิด = เฉพาะ FAH
    expect(Math.round(fb.closeRate)).toBe(12);
    expect(Math.round(total.closeRate)).toBe(12);
  });

  it('ไม่มีใครกรอกคนทักเลย → ใช้ออเดอร์ทั้งหมดตามเดิม (ไม่ทำให้ % หายไปเฉย ๆ)', () => {
    const orders = Array.from({ length: 10 }, () => ord({ channel: 'LINE', sales: 100, salesperson: 'NOK' }));
    const { rows } = channelTable(orders, [], manualEntryAgg([]), new Set());
    expect(rows.find(r => r.ch === 'LINE').chatClosed).toBe(10);
  });

  it('มาร์เก็ตเพลส/POS ไม่มี %ปิด (ไม่มีการทักก่อนซื้อ)', () => {
    const { rows } = channelTable([ord({ channel: 'Shopee', sales: 300 }), ord({ channel: 'POS', sales: 100 })], [], manualEntryAgg([]), new Set());
    expect(rows.find(r => r.ch === 'Shopee').closeRate).toBe(null);
    expect(rows.find(r => r.ch === 'POS').closeRate).toBe(null);
  });

  it('D4 ยอด mp กรอกมือถูกใช้เมื่อ "ไม่มี import" เดือนนั้น', () => {
    const manual = manualEntryAgg([{ date: '2026-09-01', channels: { Shopee: { rev: 5000 } } }]);
    const { rows, total } = channelTable([], [], manual, new Set());
    const sp = rows.find(r => r.ch === 'Shopee');
    expect(sp.sales).toBe(5000);
    expect(sp.isManual).toBe(true);
    expect(total.sales).toBe(5000);
  });

  it('D4 import ชนะ (รายวัน) — วันที่ import แล้ว ยอดที่กรอกวันนั้นไม่ถูกบวกซ้ำ', () => {
    const manual = manualEntryAgg([{ date: '2026-09-01', channels: { Shopee: { rev: 5000 } } }]);
    const imported = [ord({ channel: 'Shopee', sales: 3000, source: 'shopee', order_date: '2026-09-01' })];
    const { rows, total } = channelTable(imported, [], manual, new Set());
    const sp = rows.find(r => r.ch === 'Shopee');
    expect(sp.sales).toBe(3000);        // ใช้ของ import ไม่ใช่ 5000 และไม่ใช่ 8000
    expect(sp.isManual).toBeFalsy();
    expect(sp.manualRev).toBe(5000);    // เก็บไว้บอก user ว่าที่กรอกไว้ถูกแทนที่
    expect(total.sales).toBe(3000);
  });

  /* ---- PART 107: กติกาที่ user เคาะ 24 ส.ค. 69 — "ยอดกรอก = ยอดทั้งวันของช่องนั้น" + "ยึดจาก import" (รายวัน) ---- */
  it('เงินต้องไม่หาย: import แค่บางวัน → วันที่เหลือยังใช้ยอดที่กรอก', () => {
    const manual = manualEntryAgg([
      { date: '2026-09-01', channels: { Shopee: { rev: 3000 } } },   // วันนี้มี import → ยึด import
      { date: '2026-09-02', channels: { Shopee: { rev: 7000 } } },   // ไม่มี import → ใช้ยอดกรอก
    ]);
    const orders = [ord({ channel: 'Shopee', sales: 2500, source: 'shopee', order_date: '2026-09-01' })];
    const { rows, total } = channelTable(orders, [], manual, new Set());
    const sp = rows.find(r => r.ch === 'Shopee');
    expect(sp.sales).toBe(9500);        // 2,500 (import วันที่ 1) + 7,000 (กรอกวันที่ 2) — เดิมได้ 2,500 (7,000 หาย)
    expect(total.sales).toBe(9500);
  });

  it('ไม่นับซ้ำ: ใบเสร็จ Shipnity ในช่อง mp ถือว่าอยู่ในยอดที่กรอกแล้ว → บวกแค่ส่วนต่าง', () => {
    const manual = manualEntryAgg([{ date: '2026-09-03', channels: { TikTok: { rev: 20000 } } }]);
    const orders = [ord({ channel: 'TikTok', sales: 500, source: 'shipnity', order_date: '2026-09-03' })];
    const { rows } = channelTable(orders, [], manual, new Set());
    const tt = rows.find(r => r.ch === 'TikTok');
    expect(tt.sales).toBe(20000);       // ไม่ใช่ 20,500 (ซ้ำ) และไม่ใช่ 500 (หาย)
  });

  it('ยอดกรอกน้อยกว่าออเดอร์จริง → ยึดออเดอร์ (ไม่ตัดยอดทิ้ง)', () => {
    const manual = manualEntryAgg([{ date: '2026-09-04', channels: { Shopee: { rev: 100 } } }]);
    const orders = [ord({ channel: 'Shopee', sales: 900, source: 'shipnity', order_date: '2026-09-04' })];
    const { rows } = channelTable(orders, [], manual, new Set());
    expect(rows.find(r => r.ch === 'Shopee').sales).toBe(900);
  });

  it('คนทัก: channelTable กรองช่วงวันเอง (เดิมรับ funnel ทั้งตาราง → คนทักรั่วข้ามเดือน)', () => {
    const orders = [ord({ channel: 'Facebook', sales: 1000, order_date: '2026-09-10' })];
    const funnel = [
      { date: '2026-09-10', salesperson: 'FAH', leads: { Facebook: { new: 5, old: 0 } } },
      { date: '2026-01-01', salesperson: 'FAH', leads: { Facebook: { new: 500, old: 0 } } },
    ];
    const t = channelTable(orders, funnel, manualEntryAgg([]), new Set(), { from: '2026-09-01', to: '2026-09-30' });
    expect(t.total.leads).toBe(5);
  });

  it('คนทัก: กรองตามเซลล์ที่เลือก', () => {
    const funnel = [
      { date: '2026-09-10', salesperson: 'FAH', leads: { LINE: { new: 4, old: 0 } } },
      { date: '2026-09-10', salesperson: 'PAI', leads: { LINE: { new: 9, old: 0 } } },
    ];
    const t = channelTable([], funnel, manualEntryAgg([]), new Set(), { from: '2026-09-01', to: '2026-09-30', salespersons: ['FAH'] });
    expect(t.total.leads).toBe(4);
  });

  it('กรองช่องทาง: ยอด mp/ค่าแอด ของช่องที่ไม่ได้เลือก ต้องไม่โผล่ในยอดรวม', () => {
    const manual = manualEntryAgg([{ date: '2026-09-05', channels: { Shopee: { rev: 50000 }, Facebook: { ad: 300 } } }]);
    const orders = [ord({ channel: 'Facebook', sales: 1000, order_date: '2026-09-05' })];
    const t = channelTable(orders, [], manual, new Set(), { from: '2026-09-01', to: '2026-09-30', channels: ['Facebook'] });
    expect(t.total.sales).toBe(1000);                       // เดิมได้ 51,000
    expect(t.rows.some(r => r.ch === 'Shopee')).toBe(false);
    expect(t.total.ad).toBe(300);
  });

  it('allowManual=false (กรองรายเซลล์ ฯลฯ) → ไม่บวกยอดกรอกมือ/ค่าแอด', () => {
    const manual = manualEntryAgg([{ date: '2026-09-05', channels: { Shopee: { rev: 50000 }, Facebook: { ad: 300 } } }]);
    const t = channelTable([ord({ channel: 'Facebook', sales: 1000, order_date: '2026-09-05' })], [], manual, new Set(), { allowManual: false });
    expect(t.total.sales).toBe(1000);
    expect(t.total.ad).toBe(0);
  });

  it('ค่าแอดที่กรอกรวมไม่ระบุช่องทาง (แถวยุคเก่า) → เข้ายอดค่าแอดรวม ไม่หายเงียบ', () => {
    const manual = manualEntryAgg([{ date: '2026-07-05', ad_spend: 5000 }]);
    const t = channelTable([ord({ channel: 'Facebook', sales: 10000, order_date: '2026-07-05' })], [], manual, new Set());
    expect(t.unassignedAd).toBe(5000);
    expect(t.total.ad).toBe(5000);
    expect(Math.round(t.total.roas)).toBe(2);
  });

  it('ค่าแอด → ROAS/CPI (CPI หารด้วยคนทักจริง)', () => {
    const manual = manualEntryAgg([{ date: '2026-09-01', channels: { Facebook: { ad: 300 } } }]);
    const { rows } = channelTable(orders, funnel, manual, new Set());
    const fb = rows.find(r => r.ch === 'Facebook');
    expect(fb.ad).toBe(300);
    expect(fb.roas).toBe(5);            // 1500 / 300
    expect(fb.cpi).toBe(30);            // 300 / 10 คนทัก
    expect(fb.cpo).toBe(150);           // 300 / 2 ออเดอร์
  });

  it('D3 แถว CRM = LINE+Phone ของทีม CRM · ไม่บวกเข้ายอดรวม · ช่องอื่นของคนเดียวกันไม่นับ', () => {
    const os = [
      ord({ channel: 'LINE', sales: 800, salesperson: 'FAH' }),
      ord({ channel: 'Phone', sales: 200, salesperson: 'FAH' }),
      ord({ channel: 'Facebook', sales: 1000, salesperson: 'FAH' }),  // FAH ขายช่องอื่น = ไม่ใช่ CRM
      ord({ channel: 'LINE', sales: 700, salesperson: 'PAI' }),       // คนอื่น = ไม่ใช่ CRM
    ];
    const { rows, total, crmRow } = channelTable(os, [], manualEntryAgg([]), crmTeamOf([{ salesperson: 'FAH', sales_target: 1 }]));
    expect(crmRow.sales).toBe(1000);          // 800 + 200 เท่านั้น
    expect(crmRow.orders).toBe(2);
    expect(crmRow.excluded).toBe(true);
    expect(total.sales).toBe(2700);           // ยอดรวม = ทุกออเดอร์ตามช่องทาง (ไม่บวก CRM ซ้ำ)
    expect(rows.find(r => r.ch === 'LINE').sales).toBe(1500); // LINE ยังโชว์ยอดเต็มทั้ง FAH+PAI
  });
});

describe('customerInsight — D11', () => {
  const os = [
    ord({ channel: 'Facebook', sales: 1000, customer_type: 'ลูกค้าใหม่', customer_code: 'C1' }),
    ord({ channel: 'Facebook', sales: 500, customer_type: 'ลูกค้าเก่า', customer_code: 'C2' }),
    ord({ channel: 'LINE', sales: 500, customer_type: 'ลูกค้าเก่า', customer_code: 'C2' }),
    ord({ channel: 'LINE', sales: 9999, status: 'cancelled', customer_code: 'C9' }),
  ];
  it('ใหม่/เก่า/ซื้อซ้ำ/CLV + เทียบเป้า 35%', () => {
    const c = customerInsight(os);
    expect(c.newC).toBe(1); expect(c.oldC).toBe(2); expect(c.totalC).toBe(3);
    expect(Math.round(c.repeatPct)).toBe(67);     // 2/3
    expect(c.hitTarget).toBe(true);               // 67% ≥ 35
    expect(c.nCustomers).toBe(2);                 // C1, C2 (ตัด cancelled)
    expect(c.clv).toBe(1000);                     // 2000 / 2
    expect(REPEAT_TARGET).toBe(35);
  });
  it('แยกใหม่/เก่า ต่อช่องทาง (ตามภาพ user)', () => {
    const c = customerInsight(os);
    expect(c.byChannel.find(g => g.ch === 'Facebook')).toMatchObject({ newC: 1, oldC: 1, total: 2 });
    expect(c.byChannel.find(g => g.ch === 'LINE')).toMatchObject({ newC: 0, oldC: 1, total: 1 });
  });
  it('ไม่มีข้อมูล → null ไม่ใช่ 0 (กันโชว์ 0% หลอกตา)', () => {
    const c = customerInsight([]);
    expect(c.repeatPct).toBe(null); expect(c.clv).toBe(null); expect(c.hitTarget).toBe(false);
  });
});

describe('customerSeries + funnelSummary', () => {
  it('ซีรีส์ต่อ bucket + %ซื้อซ้ำ', () => {
    const os = [
      ord({ order_date: '2026-09-01', customer_type: 'ลูกค้าใหม่' }),
      ord({ order_date: '2026-09-01', customer_type: 'ลูกค้าเก่า' }),
      ord({ order_date: '2026-09-08', customer_type: 'ลูกค้าเก่า' }),
    ];
    const s = customerSeries(os, ['w1', 'w2'], (d) => (d === '2026-09-01' ? 'w1' : 'w2'));
    expect(s[0]).toMatchObject({ newC: 1, oldC: 1, repeatPct: 50 });
    expect(s[1]).toMatchObject({ newC: 0, oldC: 1, repeatPct: 100 });
  });
  it('funnelSummary รวม new/old/unknown ครบ = total', () => {
    const f = [
      { leads: { Facebook: { new: 6, old: 4 } } },
      { leads: { LINE: 5 } },                        // เลขแบน → unknown
    ];
    const s = funnelSummary(f);
    expect(s.total).toBe(15);
    expect(s.new + s.old + s.unknown).toBe(s.total);
    expect(s.unknown).toBe(5);
  });
});

/* ---- ความปลอดภัยข้อมูล: key เก่า (ตัวเล็ก) กับ key ใหม่ (Proper Case) ต้องอยู่ร่วมกันได้ ---- */
describe('data safety — key เก่า/ใหม่ไม่ชนกัน', () => {
  it('แถวที่มีทั้ง key เก่าและใหม่: อ่านค่าใหม่ได้ · ไม่นับ key เก่าซ้ำ', () => {
    const rows = [{
      date: '2026-09-01',
      channels: {
        facebook: { rev: 9999, ord: 5, ad: 111 },   // ยุคเก่า (id ตัวเล็ก) — ต้องไม่ถูกอ่านเป็นค่าแอดใหม่
        Facebook: { ad: 300 },                       // ยุคใหม่
        shopee: { rev: 8888 },                       // ยุคเก่า
        Shopee: { rev: 5000 },                       // ยุคใหม่
      },
    }];
    const m = manualEntryAgg(rows);
    expect(m.ad.Facebook).toBe(300);
    expect(m.ad.facebook).toBeUndefined();  // ไม่หยิบของเก่ามาปน
    expect(m.mpRev.Shopee).toBe(5000);
    expect(m.mpRev.shopee).toBeUndefined();
  });
});

// T1 (คิว 3): ช่วงยุคเก่า (ส.ค.) กรอกด้วย key id ตัวเล็ก — ต้องอ่านค่าแอด/ยอด mp ได้ ไม่ขึ้น "—"
describe('manualEntryAgg — key ยุคเก่า (lowercase id)', () => {
  it('map id เก่า → ชื่อชุด Sale · ค่าแอด+ยอด mp ครบ · key แปลก (crm) ข้าม', () => {
    const rows = [{ date: '2026-08-10', channels: {
      facebook: { rev: 5000, ad: 900 }, line_oa: { ad: 100 }, tiktok: { rev: 700, ad: 50 },
      shopee: { rev: 450 }, crm: { rev: 999 },
    } }];
    const m = manualEntryAgg(rows);
    expect(m.ad.Facebook).toBe(900);
    expect(m.ad.LINE).toBe(100);
    expect(m.ad.TikTok).toBe(50);
    expect(m.mpRev.Shopee).toBe(450);
    expect(m.mpRev.TikTok).toBe(700);
    expect(m.mpRev.Facebook).toBeUndefined();   // rev ช่องแชทไม่เอา (ยอดจริงมาจากออเดอร์)
    expect(Object.keys(m.ad)).not.toContain('crm');
  });

  it('ยุคใหม่ (Proper Case) ยังทำงานเหมือนเดิม', () => {
    const m = manualEntryAgg([{ date: '2026-09-05', channels: { Facebook: { ad: 300 }, Shopee: { rev: 450 } } }]);
    expect(m.ad.Facebook).toBe(300);
    expect(m.mpRev.Shopee).toBe(450);
  });
});


/* ============================================================
   PART 107 — สูตรร่วม FE ↔ edge (รายงาน LINE) ต้องให้เลขเดียวกัน
   ============================================================ */
describe('mpRevByDateOf / mpExtraRevenue — สูตรกลางที่ edge ใช้ด้วย', () => {
  const daily = [
    { date: '2026-09-01', channels: { Shopee: { rev: 3000 }, shopee: { rev: 999 } } },  // key ใหม่ชนะ key เก่า
    { date: '2026-09-02', channels: { tiktok: { rev: 1200 } } },                        // key เก่าล้วน → อ่านได้
    { date: '2026-09-03', channels: { Shopee: { rev: 500 } }, deleted_at: '2026-09-04' },// แถวที่ลบ → ไม่นับ
  ];
  it('อ่านยอดรายวันถูกต้อง (ไม่นับซ้ำ · ข้ามแถวที่ลบ)', () => {
    const by = mpRevByDateOf(daily);
    expect(by.Shopee).toEqual({ '2026-09-01': 3000 });
    expect(by.TikTok).toEqual({ '2026-09-02': 1200 });
  });
  it('เลขจาก manualEntryAgg (FE) ตรงกับ mpRevByDateOf (edge)', () => {
    expect(manualEntryAgg(daily.filter(d => !d.deleted_at)).mpRevByDate).toEqual(mpRevByDateOf(daily));
  });
  it('รวมยอดต่อวันไปเข้าเดือน (ฐานของ YoY/ไตรมาส) ไม่ตกหล่น', () => {
    const orders = [{ channel: 'Shopee', source: 'shopee', sales: 2500, status: 'active', order_date: '2026-09-01' }];
    const { byDate } = mpExtraRevenue(orders, mpRevByDateOf(daily));
    const byMonth = {};
    Object.entries(byDate).forEach(([d, v]) => { const mo = Number(d.slice(5, 7)); byMonth[mo] = (byMonth[mo] || 0) + v; });
    expect(byMonth[9]).toBe(1200);   // 1 ก.ย. มี import → ยึด import · 2 ก.ย. ไม่มี → บวก 1,200
  });
});


/* ============================================================
   PART 108 (ทาง 2) — ข้อมูลยุคเก่าต้องไม่ตกหล่นเวลาเปิดดูย้อนหลัง
   ============================================================ */
describe('ยุคเก่า (ก่อน 1 ส.ค. 69) — ยอดที่กรอกมือต้องถูกอ่านครบ', () => {
  it('อ่านคอลัมน์แยกยุคเก่า (shopee/tiktok/facebook/line_oa) ที่ไม่ได้อยู่ใน jsonb', () => {
    const by = mpRevByDateOf([{ date: '2026-07-05', shopee: 4000, tiktok: 2000, facebook: 9000, line_oa: 3000 }]);
    expect(by.Shopee['2026-07-05']).toBe(4000);
    expect(by.TikTok['2026-07-05']).toBe(2000);
    expect(by.Facebook['2026-07-05']).toBe(9000);   // ยุคเก่ากรอกยอดช่องแชทมือด้วย → ต้องอ่าน
    expect(by.LINE['2026-07-05']).toBe(3000);
  });

  it('jsonb ชนะคอลัมน์แยกเสมอ (ไม่นับซ้ำ)', () => {
    const by = mpRevByDateOf([{ date: '2026-07-06', shopee: 999, channels: { Shopee: { rev: 4000 } } }]);
    expect(by.Shopee['2026-07-06']).toBe(4000);
  });

  it('ยุคเก่า: ยอดกรอกช่องแชทถูกนำมาเติมส่วนที่ออเดอร์ยังไม่มี (max ต่อวัน ไม่ซ้ำ)', () => {
    const daily = [{ date: '2026-07-05', facebook: 9000 }];
    const orders = [{ channel: 'Facebook', source: 'shipnity', sales: 2000, status: 'active', order_date: '2026-07-05' }];
    const t = channelTable(orders, [], manualEntryAgg(daily), new Set(), { from: '2026-07-01', to: '2026-07-31' });
    expect(t.rows.find(r => r.ch === 'Facebook').sales).toBe(9000);   // ไม่ใช่ 11,000 (ซ้ำ) และไม่ใช่ 2,000 (ขาด)
  });

  it('ตั้งแต่ cutoff: ยอดกรอกของช่องแชทไม่ถูกนำมาบวก (ยอดมาจากใบเสร็จแล้ว)', () => {
    const daily = [{ date: '2026-08-05', channels: { Facebook: { rev: 9000 } } }];
    const orders = [{ channel: 'Facebook', source: 'shipnity', sales: 2000, status: 'active', order_date: '2026-08-05' }];
    const t = channelTable(orders, [], manualEntryAgg(daily), new Set(), { from: '2026-08-01', to: '2026-08-31' });
    expect(t.rows.find(r => r.ch === 'Facebook').sales).toBe(2000);
  });
});

/* ============================================================
   PART 121 — ขอบวันที่ของรายงานต้องครอบ "ทุกแหล่งข้อมูล"
   ============================================================
   เดิมเอาขอบจากตารางออเดอร์อย่างเดียว → ปฏิทินเลือกย้อนก่อน 15 ก.ค. 69 ไม่ได้
   ทั้งที่ยอดที่กรอกรายวันมีตั้งแต่ 1 มิ.ย. 69 (44 วันที่มองไม่เห็นเลย)
   ============================================================ */
describe('mergeBounds — รวมขอบวันที่จากหลายตาราง', () => {
  it('เอาวันเก่าสุด/ใหม่สุดของทุกแหล่ง', () => {
    const b = mergeBounds([
      { min: '2026-07-15', max: '2026-08-24' },   // ออเดอร์
      { min: '2026-06-01', max: '2026-08-23' },   // ยอดรายวัน
      { min: '2026-07-31', max: '2026-08-23' },   // คนทัก
    ]);
    expect(b).toEqual({ min: '2026-06-01', max: '2026-08-24' });
  });
  it('ข้ามแหล่งที่ว่าง/null ได้', () => {
    expect(mergeBounds([null, { min: null, max: null }, { min: '2026-06-01', max: '2026-06-30' }]))
      .toEqual({ min: '2026-06-01', max: '2026-06-30' });
  });
  it('ไม่มีข้อมูลเลย = null ทั้งคู่ (ไม่พัง)', () => {
    expect(mergeBounds([])).toEqual({ min: null, max: null });
    expect(mergeBounds(null)).toEqual({ min: null, max: null });
  });
});

/* ============================================================
   PART 121 ชุด 2 — ยุคเก่าต้องมีออเดอร์/คนทัก/ลูกค้าใหม่-เก่า ในตารางช่องทาง
   ============================================================ */
describe('channelTable + สถิติยุคเก่า', () => {
  const dailyLegacy = [{
    date: '2026-06-30', ad_spend: 0,
    channels: {
      facebook: { ad: 500, rev: 13120, ord: 17, inq: 247, newC: 123, oldC: 124 },
      crm: { ad: 0, rev: 5162, ord: 11, inq: 0 },
    },
  }];

  it('ไม่มีออเดอร์รายใบเลย → เอาตัวเลขที่กรอกไว้มาใช้', () => {
    const manual = manualEntryAgg(dailyLegacy);
    const { rows, total } = channelTable([], [], manual, new Set(), { from: '2026-06-01', to: '2026-06-30' });
    const fb = rows.find(r => r.ch === 'Facebook');
    expect(fb.sales).toBe(13120);
    expect(fb.orders).toBe(17);      // จาก ord ที่กรอก
    expect(fb.leads).toBe(247);      // จาก inq ที่กรอก
    expect(fb.newC).toBe(123);
    expect(rows.find(r => r.ch === 'Phone').sales).toBe(5162);   // ยอด CRM ยุคเก่า
    expect(total.orders).toBe(28);   // 17 + 11
  });

  it('วันที่มีออเดอร์ import แล้ว ไม่นับ ord ที่กรอกซ้ำ', () => {
    const orders = [{ channel: 'Facebook', order_date: '2026-06-30', source: 'shopee', sales: 9000, status: 'confirmed', qty: 1 }];
    const manual = manualEntryAgg(dailyLegacy);
    const { rows } = channelTable(orders, [], manual, new Set(), { from: '2026-06-01', to: '2026-06-30' });
    expect(rows.find(r => r.ch === 'Facebook').orders).toBe(1);   // นับเฉพาะออเดอร์จริง
  });

  it('วันที่มีแถวคนทักในระบบใหม่แล้ว ไม่นับ inq ซ้ำ', () => {
    const funnel = [{ salesperson: 'FAH', date: '2026-06-30', leads: { Facebook: { new: 40, old: 10 } } }];
    const manual = manualEntryAgg(dailyLegacy);
    const { rows } = channelTable([], funnel, manual, new Set(), { from: '2026-06-01', to: '2026-06-30' });
    expect(rows.find(r => r.ch === 'Facebook').leads).toBe(50);   // ของตารางคนทัก ไม่บวก 247 ซ้ำ
  });
});

describe('%ปิด ยุคเก่า — ใช้ออเดอร์/คนทักที่กรอกไว้', () => {
  it('ไม่มีออเดอร์รายใบเลย แต่กรอก ord/inq ไว้ → คำนวณ %ปิด ได้', () => {
    const daily = [{ date: '2026-06-15', channels: { facebook: { rev: 10000, ord: 25, inq: 100 } } }];
    const { rows } = channelTable([], [], manualEntryAgg(daily), new Set(), { from: '2026-06-01', to: '2026-06-30' });
    const fb = rows.find(r => r.ch === 'Facebook');
    expect(fb.leads).toBe(100);
    expect(fb.chatClosed).toBe(25);
    expect(Math.round(fb.closeRate)).toBe(25);
  });
  it('มาร์เก็ตเพลสยังไม่มี %ปิด แม้ยุคเก่าจะกรอก inq ไว้', () => {
    const daily = [{ date: '2026-06-15', channels: { shopee: { rev: 5000, ord: 10, inq: 40 } } }];
    const { rows } = channelTable([], [], manualEntryAgg(daily), new Set(), { from: '2026-06-01', to: '2026-06-30' });
    expect(rows.find(r => r.ch === 'Shopee').closeRate).toBe(null);
  });
});
