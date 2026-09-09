/* teamPresence — "0 ออนไลน์ ทั้งที่กำลังใช้งาน" ต้องไม่เกิดอีก */
import { describe, it, expect } from 'vitest';
import { teamMembers, ONLINE_MS } from '../teamPresence.js';

const NOW = new Date('2026-09-09T14:00:00+07:00').getTime();
const TODAY = '2026-09-09';
const seen = (msAgo) => new Date(NOW - msAgo).toISOString();

describe('teamMembers', () => {
  it('คนในทีมที่เพิ่ง heartbeat = ออนไลน์', () => {
    const m = teamMembers([{ email: 'Fah@tmk.co', name: 'ฟ้า' }], [{ email: 'fah@tmk.co', last_seen_at: seen(30000), page: 'sales' }], NOW, TODAY);
    expect(m[0].online).toBe(true);
    expect(m[0].page).toBe('sales');
  });

  it('เงียบเกินหน้าต่าง → ออฟไลน์ แต่ยังนับว่าเคลื่อนไหววันนี้', () => {
    const m = teamMembers([{ email: 'fah@tmk.co' }], [{ email: 'fah@tmk.co', last_seen_at: seen(ONLINE_MS + 60000) }], NOW, TODAY);
    expect(m[0].online).toBe(false);
    expect(m[0].activeToday).toBe(true);
  });

  it('⛔ คนที่กำลังใช้งานแต่ยังไม่มีแถวใน tmk_user_roles ต้องถูกนับ (เดิมได้ "0 ออนไลน์")', () => {
    const m = teamMembers([], [{ email: 'art@tmk.co', name: 'อาร์ต', last_seen_at: seen(10000) }], NOW, TODAY);
    expect(m).toHaveLength(1);
    expect(m[0].online).toBe(true);
    expect(m[0].noRole).toBe(true);
  });

  it('⛔ roles อ่านพลาด (undefined) ก็ยังต้องเห็นคนที่ออนไลน์', () => {
    const m = teamMembers(undefined, [{ email: 'art@tmk.co', last_seen_at: seen(10000) }], NOW, TODAY);
    expect(m.filter(x => x.online)).toHaveLength(1);
  });

  it('อีเมลต่างตัวพิมพ์ = คนเดียวกัน (ไม่ซ้ำแถว)', () => {
    const m = teamMembers([{ email: 'Fah@TMK.co', name: 'ฟ้า' }], [{ email: 'fah@tmk.co', last_seen_at: seen(10000) }], NOW, TODAY);
    expect(m).toHaveLength(1);
    expect(m[0].online).toBe(true);
  });

  it('ไม่มี presence เลย → ทุกคนออฟไลน์ ไม่ throw', () => {
    const m = teamMembers([{ email: 'a@x.co' }, { email: 'b@x.co' }], [], NOW, TODAY);
    expect(m.every(x => !x.online && !x.activeToday && x.last === 0)).toBe(true);
  });

  it('เรียง: ออนไลน์ → เคลื่อนไหววันนี้ → ล่าสุดใหม่สุด', () => {
    const m = teamMembers(
      [{ email: 'old@x.co' }, { email: 'on@x.co' }, { email: 'today@x.co' }],
      [{ email: 'on@x.co', last_seen_at: seen(5000) },
       { email: 'today@x.co', last_seen_at: seen(ONLINE_MS + 5000) },
       { email: 'old@x.co', last_seen_at: '2026-09-01T10:00:00+07:00' }],
      NOW, TODAY);
    expect(m.map(x => x.email)).toEqual(['on@x.co', 'today@x.co', 'old@x.co']);
  });
});

/* ============================================================
   ⛔ "0 ออนไลน์" ทั้งที่ทั้งทีมเปิดเว็บอยู่ — ต้นตอจริง (เจอตอนเปิดเทสสด 9 ก.ย. 69)
   ============================================================
   heartbeat เขียนเฉพาะตอนแท็บโฟกัส (ประหยัด egress) → สลับไปแท็บอื่น 3 นาที = ตกเป็นออฟไลน์
   ข้อมูลจริงตอนตรวจ: ทีมเปิดเว็บอยู่ แต่ last_seen = 6/7/10 นาที → การ์ดขึ้น "0 ออนไลน์"
   ============================================================ */
describe('หน้าต่างออนไลน์ + ตัวเอง', () => {
  it('⛔ สลับไปแท็บอื่น 5 นาที (heartbeat หยุด) ยังต้องนับว่าออนไลน์', () => {
    const m = teamMembers([{ email: 'tukta@tmk.co' }], [{ email: 'tukta@tmk.co', last_seen_at: seen(5 * 60000) }], NOW, TODAY);
    expect(m[0].online).toBe(true);
  });

  it('เกิน 6 นาที → ออฟไลน์ (ยังต้องมีเส้นแบ่ง ไม่ใช่ออนไลน์ตลอดกาล)', () => {
    const m = teamMembers([{ email: 'tukta@tmk.co' }], [{ email: 'tukta@tmk.co', last_seen_at: seen(7 * 60000) }], NOW, TODAY);
    expect(m[0].online).toBe(false);
  });

  it('⛔ ตัวเองต้องออนไลน์เสมอ แม้ heartbeat ยังไม่ทันเขียน (เพิ่งเปิดหน้า / upsert พลาดเงียบ)', () => {
    const m = teamMembers([{ email: 'graphic@tmk.co', name: 'Graphic' }], [], NOW, TODAY, 'Graphic@tmk.co');
    expect(m[0].online).toBe(true);
    expect(m[0].activeToday).toBe(true);
  });

  it('⛔ ตัวเองไม่มีทั้งใน roles และ presence → ต้องยังโผล่ (ไม่ใช่ "0 ออนไลน์")', () => {
    const m = teamMembers([], [], NOW, TODAY, 'new@tmk.co');
    expect(m).toHaveLength(1);
    expect(m[0].online).toBe(true);
  });

  it('ตัวเองอยู่บนสุดของรายชื่อ', () => {
    const m = teamMembers(
      [{ email: 'a@x.co' }, { email: 'me@x.co' }],
      [{ email: 'a@x.co', last_seen_at: seen(5000) }], NOW, TODAY, 'me@x.co');
    expect(m[0].email).toBe('me@x.co');
  });

  it('ไม่ส่ง selfEmail (หน้าอื่นเรียก) → พฤติกรรมเดิม ไม่มีใครถูกยกเว้น', () => {
    const m = teamMembers([{ email: 'a@x.co' }], [], NOW, TODAY);
    expect(m[0].online).toBe(false);
  });
});
