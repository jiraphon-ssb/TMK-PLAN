/* ============================================================
   PART 109 — เทสกันบั๊กจากการ "ลด egress"
   ============================================================
   ตัดคอลัมน์/ตารางออกจาก query = เสี่ยง 2 แบบ
     (1) ตัดคอลัมน์ที่ helper ยังอ่านอยู่ → เลขกลายเป็น 0 เงียบๆ
     (2) ตัดตารางที่ mapToTMK ยังอ่าน → พังตอน map (จอขาว)
   เทสชุดนี้ล็อกทั้งสองแบบไว้
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { FUNNEL_SEL, funnelBreakdown, funnelTotal, funnelNewOld } from '../saleData.js';
import { funnelVoices } from '../../saleWidgets.jsx';

const cols = FUNNEL_SEL.split(',').map(c => c.trim());

describe('FUNNEL_SEL — ต้องมีทุกคอลัมน์ที่ helper อ่าน', () => {
  it('มีคีย์กรอง (date/salesperson) + leads + voice + 4 คอลัมน์ legacy', () => {
    ['date', 'salesperson', 'leads', 'voice', 'leads_fb_new', 'leads_fb_old', 'leads_line_new', 'leads_line_old']
      .forEach(c => expect(cols, `ขาดคอลัมน์ ${c}`).toContain(c));
  });

  it('รูปแบบ (ก) jsonb ใหม่ — อ่านได้ครบจากคอลัมน์ที่ select', () => {
    const row = { date: '2026-08-10', salesperson: 'FAH', leads: { Facebook: { new: 5, old: 2 } } };
    expect(funnelTotal(row)).toBe(7);
    expect(funnelNewOld(row)).toEqual({ new: 5, old: 2, unknown: 0 });
  });

  it('รูปแบบ (ค) legacy 4 คอลัมน์ — ยังนับได้ (คอลัมน์ต้องไม่ถูกตัดออกจาก select)', () => {
    const row = { date: '2026-07-10', salesperson: 'FAH', leads_fb_new: 3, leads_fb_old: 1, leads_line_new: 2, leads_line_old: 0 };
    expect(funnelBreakdown(row)).toEqual({ Facebook: { new: 3, old: 1 }, LINE: { new: 2, old: 0 } });
    expect(funnelTotal(row)).toBe(6);
  });

  it('เสียงลูกค้า (voice jsonb) — ยังอ่านได้', () => {
    const rows = [{ date: '2026-08-10', salesperson: 'FAH', voice: { ask: 'มีไซซ์ XL ไหม', praise: '', complaint: '' } }];
    expect(funnelVoices(rows)).toEqual([{ date: '2026-08-10', seller: 'FAH', ask: 'มีไซซ์ XL ไหม', praise: '', complaint: '' }]);
  });

  it('ไม่ดึงคอลัมน์เกินที่ใช้ (กัน select โป่งกลับมาอีก)', () => {
    expect(cols.length).toBe(8);
    expect(FUNNEL_SEL).not.toContain('*');
  });
});

/* ---- ตารางที่เลิกโหลดแล้ว (segments/fbMetrics/colorMix/sizeMix) ต้องไม่ทำให้ map พัง ---- */
describe('mapToTMK — null-safe เมื่อไม่มีตารางที่เลิกโหลด (PART 109)', () => {
  it('map ผ่านโดยไม่ throw และคืนค่าเปล่าให้ส่วนที่ไม่มีข้อมูล', async () => {
    const { mapToTMK } = await import('../mapToTMK.js');
    const raw = { settings: {}, channels: [], campaigns: [], tasks: [], brands: [], flows: [], products: [], audit: [], roles: [], staff: [], duties: [], daily: [], monthly: [], customers: [], orders: [] };
    const out = mapToTMK(raw);   // ไม่มี segments/fbMetrics/colorMix/sizeMix/adCamps/customerTotals/commentCounts
    expect(out).toBeTruthy();
    expect(Array.isArray(out.colorMix)).toBe(true);
    expect(Array.isArray(out.sizeMix)).toBe(true);
    expect(Array.isArray(out.adCampaigns)).toBe(true);
    expect(out.colorMix.length).toBe(0);
  });
});
