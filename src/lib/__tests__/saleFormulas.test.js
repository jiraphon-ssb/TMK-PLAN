/* ============================================================
   saleFormulas.test.js — ยืนยันสูตร canonical "แหล่งเดียว" (P2-4)
   ============================================================
   ไฟล์ supabase/functions/_shared/saleFormulas.js = ตัวจริงที่ทั้ง FE (เว็บ)
   และ edge (daily-sale-report ส่ง LINE) import ร่วมกัน → เทสต์ที่นี่ครอบทั้งสองฝั่ง
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  readDailyChannels,
  importedMpRevOfDay,
  manualExtraStats,
  resolveJobType,
  ORDER_OV_KEY,
  mergeOrderOverrides,
  MARKETPLACE_CHANNELS,
  isLeadChannel,
  isMasked,
  crmCustomerKey,
  blankNoteData,
  normNoteData,
} from '../../../supabase/functions/_shared/saleFormulas.js';

describe('resolveJobType', () => {
  it('ยุบ "ส่ง" → "ปลีก"', () => {
    expect(resolveJobType('ส่ง', '')).toBe('ปลีก');
  });
  it('หมายเหตุมี DFT → promote เป็น DFT', () => {
    expect(resolveJobType('ปลีก', 'งาน DFT ด่วน')).toBe('DFT');
    expect(resolveJobType('', 'dft')).toBe('DFT');
  });
  it('เก็บเป็น DFT แต่หมายเหตุไม่มี DFT → demote เป็น ปลีก', () => {
    expect(resolveJobType('DFT', 'ลูกค้าปกติ')).toBe('ปลีก');
  });
  it('OEM ไม่แตะ', () => {
    expect(resolveJobType('OEM', '')).toBe('OEM');
    expect(resolveJobType('OEM', 'dft')).toBe('OEM');
  });
  it('ค่าว่าง/null → ปลีก', () => {
    expect(resolveJobType('', '')).toBe('ปลีก');
    expect(resolveJobType(null, null)).toBe('ปลีก');
  });
  it('DFT ต้องเป็น word-boundary (ไม่ match ในคำอื่น)', () => {
    expect(resolveJobType('ปลีก', 'abcdft')).toBe('ปลีก');
  });
});

describe('mergeOrderOverrides + ORDER_OV_KEY', () => {
  const base = [
    { source: 'shipnity', order_no: 'A1', sales: 100, qty: 1, channel: 'Facebook', salesperson: 'AA', job_type: 'ปลีก', note: '' },
    { source: 'mp', order_no: 'B2', sales: 200, qty: 2, channel: 'Shopee', salesperson: 'BB', job_type: 'ปลีก', note: '' },
  ];

  it('key = source:order_no', () => {
    expect(ORDER_OV_KEY(base[0])).toBe('shipnity:A1');
    expect(ORDER_OV_KEY({ order_no: 'X' })).toBe(':X');
  });
  it('ovMap ว่าง → คืน array เดิม (reference เดิม)', () => {
    expect(mergeOrderOverrides(base, {})).toBe(base);
    expect(mergeOrderOverrides(base, null)).toBe(base);
  });
  it('override ทับ sales/qty/channel/salesperson · แถวไม่มี override คง reference เดิม', () => {
    const ov = { [ORDER_OV_KEY(base[0])]: { sales: 999, qty: 5, channel: 'LINE', salesperson: 'ZZ' } };
    const [r0, r1] = mergeOrderOverrides(base, ov);
    expect(r0.sales).toBe(999);
    expect(r0.qty).toBe(5);
    expect(r0.channel).toBe('LINE');
    expect(r0.salesperson).toBe('ZZ');
    expect(r1).toBe(base[1]);
  });
  it('override note → re-derive job_type = DFT + เก็บ note ใหม่', () => {
    const ov = { [ORDER_OV_KEY(base[0])]: { note: 'ทำ DFT ให้ด้วย' } };
    const [r0] = mergeOrderOverrides(base, ov);
    expect(r0.job_type).toBe('DFT');
    expect(r0.note).toBe('ทำ DFT ให้ด้วย');
  });
  it('override sales=0 ชนะ (ค่าจริง 0 ไม่ใช่ค่าว่าง)', () => {
    const ov = { [ORDER_OV_KEY(base[0])]: { sales: 0 } };
    const [r0] = mergeOrderOverrides(base, ov);
    expect(r0.sales).toBe(0);
  });
  it("override channel='' → คงค่าเดิม (ว่าง = ไม่ทับ)", () => {
    const ov = { [ORDER_OV_KEY(base[0])]: { channel: '' } };
    const [r0] = mergeOrderOverrides(base, ov);
    expect(r0.channel).toBe('Facebook');
  });
});

describe('isLeadChannel / MARKETPLACE_CHANNELS', () => {
  it('มาร์เก็ตเพลส (Shopee/Lazada/POS) → ไม่ใช่ช่องคนทัก', () => {
    expect(MARKETPLACE_CHANNELS).toEqual(['Shopee', 'Lazada', 'POS']);
    for (const ch of MARKETPLACE_CHANNELS) expect(isLeadChannel(ch)).toBe(false);
  });
  it('ช่องแชท (Facebook/LINE/Phone) → เป็นช่องคนทัก', () => {
    expect(isLeadChannel('Facebook')).toBe(true);
    expect(isLeadChannel('LINE')).toBe(true);
    expect(isLeadChannel('Phone')).toBe(true);
  });
  it('ว่าง/undefined → false', () => {
    expect(isLeadChannel('')).toBe(false);
    expect(isLeadChannel(undefined)).toBe(false);
  });
});

describe('crmCustomerKey / isMasked', () => {
  it('isMasked = มี * ติดกัน 2 ตัวขึ้นไป', () => {
    expect(isMasked('ณ******์')).toBe(true);
    expect(isMasked('C**')).toBe(true);
    expect(isMasked('ปกติ')).toBe(false);
    expect(isMasked('')).toBe(false);
  });
  it('ลูกค้าปกปิด (mask ชื่อ/รหัส) → ""', () => {
    expect(crmCustomerKey({ customer_name: 'ณ******์', customer_code: '' })).toBe('');
    expect(crmCustomerKey({ customer_name: 'ก', customer_code: 'C**' })).toBe('');
  });
  it('มี customer_code → ใช้ code', () => {
    expect(crmCustomerKey({ customer_code: 'CUST01', customer_name: 'สมชาย' })).toBe('CUST01');
  });
  it('ไม่มี code แต่มีชื่อ → "N"+ชื่อ', () => {
    expect(crmCustomerKey({ customer_code: '', customer_name: 'สมหญิง' })).toBe('Nสมหญิง');
  });
  it('ไม่มีทั้ง code/ชื่อ → ""', () => {
    expect(crmCustomerKey({})).toBe('');
  });
});

describe('normNoteData / blankNoteData', () => {
  it('data ว่าง → โครงเปล่า (เท่ากับ blankNoteData)', () => {
    expect(normNoteData(undefined)).toEqual(blankNoteData());
    expect(normNoteData(null)).toEqual(blankNoteData());
    expect(normNoteData('ข้อความเก่า')).toEqual(blankNoteData());
  });
  it('เติมช่องที่ขาด + coerce ตัวเลข (string → number)', () => {
    const r = normNoteData({ calls: { d0: { total: '3', answered: 2 } }, upsellBaht: '150', ask: 'ถามไซซ์' });
    expect(r.calls.d0).toEqual({ total: 3, answered: 2 });
    expect(r.calls.d5).toEqual({ total: 0, answered: 0 });
    expect(r.calls.rep).toEqual({ total: 0, answered: 0 });
    expect(r.upsellBaht).toBe(150);
    expect(r.ask).toBe('ถามไซซ์');
    expect(r.praise).toBe('');
    expect(r.complaint).toBe('');
    expect(r.extra).toBe('');
  });
});

/* ============================================================
   PART 121 — ยุคก่อนรวมระบบ (มิ.ย.–ก.ค. 69) ต้องอ่านได้ครบ
   ============================================================
   ของจริงจากฐานข้อมูล 30 มิ.ย. 69 — 4 ช่องทาง รวม ฿24,297.47 (ตรงกับหน้าจอที่ user เห็น)
   บั๊กเดิม: 'crm' ไม่อยู่ใน LEGACY_CHANNEL_IDS → ยอด CRM หายทั้งเดือน (มิ.ย. ฿113,749 · ก.ค. ฿70,095)
   ============================================================ */
describe('readDailyChannels — แถวยุคเก่า (channels jsonb + คอลัมน์แยก)', () => {
  const row30jun = {
    date: '2026-06-30', ad_spend: 5882.75,
    shopee: 4344, tiktok: 1671.47, lazada: 0, facebook: 13120, line_oa: 0, crm: 5162,
    channels: {
      crm: { ad: 0, inq: 0, ord: 11, rev: 5162, newC: 0, oldC: 0 },
      shopee: { ad: 729.72, inq: 0, ord: 15, rev: 4344, newC: 0, oldC: 0 },
      tiktok: { ad: 72.57, inq: 0, ord: 7, rev: 1671.47, newC: 0, oldC: 0 },
      facebook: { ad: 5080.46, inq: 247, ord: 17, rev: 13120, newC: 123, oldC: 124 },
    },
  };
  const sum = (o) => Object.values(o || {}).reduce((a, b) => a + (Number(b) || 0), 0);

  it('ยอดรวมของวันต้องเท่ากับที่หน้าจอโชว์ (฿24,297.47) — ห้ามตก CRM', () => {
    const p = readDailyChannels(row30jun);
    expect(Math.round(sum(p.rev) * 100) / 100).toBe(24297.47);
  });

  it('ยอด CRM ยุคเก่า = ช่องทาง Phone (การขายจากการโทร/ติดตาม)', () => {
    const p = readDailyChannels(row30jun);
    expect(p.rev.Phone).toBe(5162);
  });

  it('อ่านคอลัมน์แยกยุคเก่าได้ด้วยเมื่อ jsonb ไม่มีช่องนั้น', () => {
    const p = readDailyChannels({ date: '2026-06-01', channels: {}, crm: 900, facebook: 100 });
    expect(p.rev.Phone).toBe(900);
    expect(p.rev.Facebook).toBe(100);
  });

  it('jsonb ชนะคอลัมน์แยก (ไม่นับซ้ำ)', () => {
    const p = readDailyChannels({ date: '2026-06-01', channels: { crm: { rev: 500 } }, crm: 900 });
    expect(p.rev.Phone).toBe(500);
  });

  it('ค่าแอดรวมของวันยังถูกเหมือนเดิม', () => {
    const p = readDailyChannels(row30jun);
    expect(Math.round(sum(p.ad) * 100) / 100).toBe(5882.75);
  });
});

/* ============================================================
   PART 121 ชุด 2 — ออเดอร์/คนทัก/ลูกค้าใหม่-เก่า ของยุคเก่า
   ============================================================
   แถวยุคเก่าเก็บ ord (ออเดอร์) · inq (คนทัก) · newC/oldC ต่อช่องทางไว้ครบ
   แต่ตัวอ่านเดิมอ่านแค่ ad/rev → รายงานยุคเก่าเลย "ไม่มีออเดอร์ ไม่มีคนทัก"
   ============================================================ */
describe('readDailyChannels — สถิติยุคเก่า (ord/inq/newC/oldC)', () => {
  const row = {
    date: '2026-06-26', ad_spend: 6087.55,
    channels: {
      crm: { ad: 0, inq: 0, ord: 5, rev: 2306 },
      shopee: { ad: 1300, inq: 0, ord: 49, rev: 13749 },
      facebook: { ad: 4717.89, inq: 326, ord: 61, rev: 41390, newC: 110, oldC: 216 },
    },
  };
  it('คืนสถิติต่อช่องทาง (ตามชื่อชุดใหม่)', () => {
    const p = readDailyChannels(row);
    expect(p.stats.Facebook).toEqual({ ord: 61, inq: 326, newC: 110, oldC: 216 });
    expect(p.stats.Phone.ord).toBe(5);          // crm → Phone
    expect(p.stats.Shopee.ord).toBe(49);
  });
  it('ช่องที่ไม่มีสถิติ = ไม่ต้องมีคีย์ (ไม่ยัด 0 มั่ว)', () => {
    const p = readDailyChannels({ date: '2026-06-01', channels: { facebook: { rev: 100 } } });
    expect(p.stats.Facebook).toBeUndefined();
  });
  it('ของเดิมยังทำงานเหมือนเดิม (ไม่ทำ caller เก่าพัง)', () => {
    const p = readDailyChannels(row);
    expect(p.rev.Facebook).toBe(41390);
    expect(p.ad.Shopee).toBe(1300);
    expect(p.mpRev.Shopee).toBe(13749);
  });
});

describe('manualExtraStats — กันนับซ้ำกับออเดอร์จริง/คนทักที่กรอกใหม่', () => {
  const statsByDate = {
    Facebook: { '2026-06-30': { ord: 17, inq: 247, newC: 123, oldC: 124 }, '2026-07-20': { ord: 10, inq: 80, newC: 5, oldC: 5 } },
  };
  it('วันที่มีออเดอร์จริงแล้ว → ไม่นับ ord ของที่กรอกมือซ้ำ (ใบเสร็จ Shipnity ก็นับ)', () => {
    const orders = [{ channel: 'Facebook', order_date: '2026-07-20', source: 'shipnity', sales: 100 }];
    const out = manualExtraStats(orders, statsByDate, []);
    expect(out.Facebook.ord).toBe(17);      // เอาเฉพาะ 30 มิ.ย. (วันที่ไม่มี import)
  });
  it('วันที่มีแถวคนทักในระบบใหม่แล้ว → ไม่นับ inq ซ้ำ', () => {
    const out = manualExtraStats([], statsByDate, ['2026-07-20']);
    expect(out.Facebook.inq).toBe(247);     // 20 ก.ค. ถูกตัดเพราะมี funnel แล้ว
    expect(out.Facebook.ord).toBe(27);      // แต่ ord ยังนับ (ไม่มี import วันนั้น)
  });
  it('ไม่มีอะไรชน = นับครบ', () => {
    const out = manualExtraStats([], statsByDate, []);
    expect(out.Facebook).toEqual({ ord: 27, ordMp: 0, inq: 327, newC: 128, oldC: 129 });
  });
  it('ออเดอร์ที่ยกเลิกไม่นับว่า "มีของจริง"', () => {
    const orders = [{ channel: 'Facebook', order_date: '2026-07-20', source: 'shipnity', status: 'cancelled', sales: 100 }];
    expect(manualExtraStats(orders, statsByDate, []).Facebook.ord).toBe(27);
  });
  /* ตั้งแต่ 1 ส.ค. 69 เป็นต้นไป "จำนวน" มาจากออเดอร์จริง + ตารางคนทัก เท่านั้น
     แถว daily ของยุคใหม่ที่ยังมี ord/inq ค้างอยู่ (ฟอร์มเก่าเคยเขียนไว้) ต้องไม่ถูกนับ */
  it('วันตั้งแต่ 1 ส.ค. 69 ไม่เอาตัวเลขที่กรอกมาใช้เลย', () => {
    const s2 = { Facebook: { '2026-07-31': { ord: 5, inq: 10 }, '2026-08-05': { ord: 99, inq: 999 } } };
    expect(manualExtraStats([], s2, [])).toEqual({ Facebook: { ord: 5, ordMp: 0, inq: 10, newC: 0, oldC: 0 } });
  });
  it('ค่าว่าง = {} ไม่พัง', () => { expect(manualExtraStats(null, null, null)).toEqual({}); });
});

/* ============================================================
   ระยะ 1 (PLAN-STOCK-V2): กรอก "จำนวนออเดอร์" ของมาร์เก็ตเพลสได้ในยุคใหม่
   ============================================================
   กติกาเดียวกับเงิน (mpExtraRevenue): วันไหน+ช่องไหนมี import → ใช้ของจริง ไม่บวกกรอกมือ
   ต่างจากยุคเก่าตรงที่ ord ของ MP ยุคใหม่ **ห้าม** ไปเป็นตัวตั้ง %ปิด (ไม่มีการทักก่อนซื้อ)
   ============================================================ */
describe('manualExtraStats — จำนวนออเดอร์ MKP ยุคใหม่', () => {
  const stats = (ch, d, v) => ({ [ch]: { [d]: v } });

  it('ไม่มี import วันนั้น → นับจำนวนที่กรอก (แยกไว้ที่ ordMp)', () => {
    const r = manualExtraStats([], stats('Shopee', '2026-09-10', { ord: 12 }), []);
    expect(r.Shopee.ordMp).toBe(12);
    expect(r.Shopee.ord).toBe(0);          // ord = ของยุคเก่าเท่านั้น
  });

  it('มี import วันนั้น → ไม่บวกกรอกมือ (กันนับซ้ำ)', () => {
    const orders = [{ source: 'shopee', channel: 'Shopee', order_date: '2026-09-10', status: 'done', sales: 100 }];
    const r = manualExtraStats(orders, stats('Shopee', '2026-09-10', { ord: 12 }), []);
    expect(r.Shopee).toBeUndefined();
  });

  it('ใบเสร็จ Shipnity ของช่องอื่นวันเดียวกัน ไม่บล็อกการกรอก MKP', () => {
    const orders = [{ source: 'shipnity', channel: 'Facebook', order_date: '2026-09-10', status: 'done', sales: 100 }];
    const r = manualExtraStats(orders, stats('Shopee', '2026-09-10', { ord: 12 }), []);
    expect(r.Shopee.ordMp).toBe(12);
  });

  it('ช่องที่ไม่ใช่มาร์เก็ตเพลส กรอกจำนวนในยุคใหม่ไม่ได้', () => {
    const r = manualExtraStats([], stats('Facebook', '2026-09-10', { ord: 9 }), []);
    expect(r.Facebook).toBeUndefined();
  });

  it('TikTok เป็นช่องแชท แต่จำนวนที่กรอกยุคใหม่ต้องไม่เป็นตัวตั้ง %ปิด', () => {
    const r = manualExtraStats([], stats('TikTok', '2026-09-10', { ord: 20 }), []);
    expect(r.TikTok.ordMp).toBe(20);
    expect(r.TikTok.ord).toBe(0);          // channelTable ใช้ ord (ไม่ใช่ ordMp) ทำ legacyChat
  });

  it('ยุคเก่ายังทำงานเหมือนเดิมทุกอย่าง (ไม่ถูกกระทบ)', () => {
    const r = manualExtraStats([], stats('Shopee', '2026-07-10', { ord: 5, inq: 3, newC: 2, oldC: 1 }), []);
    expect(r.Shopee).toEqual({ ord: 5, ordMp: 0, inq: 3, newC: 2, oldC: 1 });
  });

  it('ยุคเก่า: วันที่มีออเดอร์จริง (ใบเสร็จก็นับ) ไม่บวก ord ซ้ำ', () => {
    const orders = [{ source: 'shipnity', channel: 'Shopee', order_date: '2026-07-10', status: 'done', sales: 50 }];
    const r = manualExtraStats(orders, stats('Shopee', '2026-07-10', { ord: 5 }), []);
    expect(r.Shopee).toBeUndefined();
  });
});

/* ============================================================
   importedMpRevOfDay — "วันนี้ช่องทางนี้มีไฟล์นำเข้าแล้วหรือยัง" (3 ก.ย. 69)
   ============================================================
   ฟอร์มกรอกยอดรายวันใช้ตัวนี้ตัดสินว่าจะล็อกช่องไหน ต้องตรงกับกติกา hasImport
   ใน mpExtraRevenue/manualExtraStats เป๊ะ ๆ (ต่อ ช่องทาง × วัน · ข้ามใบยกเลิก · isImportedOrder)
   บั๊กเดิม: ฟอร์มเช็คทั้งเดือนแล้วล็อกทั้งเดือน → import ครอบ 1–15 ก.ย.
   ทำให้กรอกยอดวันที่ 20 ไม่ได้เลย ยอดวันนั้นค้าง ฿0 ถาวร
   ============================================================ */
describe('importedMpRevOfDay', () => {
  const o = (ch, sales, source, status) => ({ channel: ch, sales, source, status });

  it('รวมยอดเฉพาะช่องทางมาร์เก็ตเพลสที่นำเข้าจริง', () => {
    expect(importedMpRevOfDay([
      o('Shopee', 1000, 'shopee'), o('Shopee', 500, 'shopee'), o('TikTok', 300, 'tiktok'),
    ])).toEqual({ Shopee: { rev: 1500, rows: 2 }, TikTok: { rev: 300, rows: 1 } });
  });

  it('ใบจาก Shipnity ไม่ใช่ "ไฟล์นำเข้า" — ไม่ล็อกช่อง', () => {
    // เซลล์คีย์ออเดอร์ Shopee เองผ่าน Shipnity ≠ มีไฟล์นำเข้าของวันนั้น
    expect(importedMpRevOfDay([o('Shopee', 1000, 'shipnity')])).toEqual({});
  });

  it('ใบยกเลิกไม่นับ (ตรงกับ mpExtraRevenue ที่ข้ามก่อนตั้ง hasImport)', () => {
    expect(importedMpRevOfDay([
      o('Shopee', 1000, 'shopee', 'cancelled'), o('Shopee', 400, 'shopee'),
    ])).toEqual({ Shopee: { rev: 400, rows: 1 } });
  });

  it('ยกเลิกหมดทั้งวัน = ยังไม่มีไฟล์นำเข้า → ต้องกรอกมือได้', () => {
    expect(importedMpRevOfDay([o('Shopee', 1000, 'shopee', 'CANCELLED')])).toEqual({});
  });

  it('ช่องทางที่กรอกมือไม่ได้ (Facebook/LINE) ไม่เข้ามาในผล', () => {
    expect(importedMpRevOfDay([o('Facebook', 900, 'ads'), o('LINE', 200, 'x')])).toEqual({});
  });

  it('มีใบนำเข้าแต่ยอดรวมเป็น 0 → ต้องยังนับว่า "มีไฟล์นำเข้า" (ล็อกช่อง)', () => {
    // เดิมคืนตัวเลข 0 → ฟอร์มเช็ค > 0 แล้วไม่ล็อก → เซลล์กรอกยอด แล้วสูตรกลางทิ้งค่านั้น = ยอดค้าง ฿0 ถาวร
    const r = importedMpRevOfDay([o('Shopee', 0, 'shopee'), o('Shopee', null, 'shopee')]);
    expect(r.Shopee.rows).toBe(2);
    expect(r.Shopee.rev).toBe(0);
  });

  it('ไม่มีออเดอร์ = {} (ไม่ล็อกช่องไหน)', () => {
    expect(importedMpRevOfDay([])).toEqual({});
    expect(importedMpRevOfDay(null)).toEqual({});
  });
});
