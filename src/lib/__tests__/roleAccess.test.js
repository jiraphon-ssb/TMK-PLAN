import { describe, it, expect } from 'vitest';
import { isAdmin, myNamesOf, canSeeTeam, orderVisibleTo } from '../roleAccess.js';

// Characterization tests — ล็อกสิทธิ์ตาม role (security-critical: ใครเห็นออเดอร์/ทั้งทีมได้บ้าง)
const admin = { role: 'admin', name: 'แอดมิน', email: 'admin@tmk.co' };
const seller = { role: 'editor', name: 'แอน', email: 'ann@tmk.co' };
const viewer = { role: 'viewer', name: 'บี', email: 'bee@tmk.co' };

describe('isAdmin / canSeeTeam', () => {
  it('role=admin → true', () => { expect(isAdmin(admin)).toBe(true); expect(canSeeTeam(admin)).toBe(true); });
  it('role อื่น → false', () => {
    expect(isAdmin(seller)).toBe(false);
    expect(isAdmin(viewer)).toBe(false);
    expect(canSeeTeam(seller)).toBe(false);
  });
  it('user null/undefined → false (ไม่ล็อกอิน = ไม่ใช่ admin)', () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
    expect(isAdmin({})).toBe(false);
  });
});

describe('myNamesOf', () => {
  it('คืน [name, email] ที่ไม่ว่าง', () => {
    expect(myNamesOf(seller)).toEqual(['แอน', 'ann@tmk.co']);
    expect(myNamesOf({ name: 'X' })).toEqual(['X']);
    expect(myNamesOf({ email: 'y@z.co' })).toEqual(['y@z.co']);
    expect(myNamesOf({})).toEqual([]);
    expect(myNamesOf(null)).toEqual([]);
  });
});

describe('orderVisibleTo — admin เห็นทุกใบ · คนอื่นเห็นเฉพาะของตัวเอง', () => {
  it('admin เห็นทุกออเดอร์ (แม้ salesperson คนอื่น)', () => {
    expect(orderVisibleTo({ salesperson: 'แอน' }, admin)).toBe(true);
    expect(orderVisibleTo({ salesperson: 'ใครก็ไม่รู้' }, admin)).toBe(true);
    expect(orderVisibleTo({ salesperson: '' }, admin)).toBe(true);
  });
  it('seller เห็นเฉพาะออเดอร์ที่ salesperson = ชื่อ หรือ อีเมลตัวเอง', () => {
    expect(orderVisibleTo({ salesperson: 'แอน' }, seller)).toBe(true);        // ชื่อ
    expect(orderVisibleTo({ salesperson: 'ann@tmk.co' }, seller)).toBe(true); // อีเมล
    expect(orderVisibleTo({ salesperson: 'บี' }, seller)).toBe(false);        // คนอื่น
    expect(orderVisibleTo({ salesperson: '' }, seller)).toBe(false);          // ไม่ระบุเซลล์
    expect(orderVisibleTo({}, seller)).toBe(false);                          // ไม่มี salesperson
  });
  it('viewer ก็เห็นเฉพาะของตัวเอง (เหมือน seller · non-admin)', () => {
    expect(orderVisibleTo({ salesperson: 'บี' }, viewer)).toBe(true);
    expect(orderVisibleTo({ salesperson: 'แอน' }, viewer)).toBe(false);
  });
  it('user null → เห็นเฉพาะออเดอร์ salesperson ว่าง? ไม่ — myNames ว่าง จึงไม่เห็นอะไร', () => {
    expect(orderVisibleTo({ salesperson: 'แอน' }, null)).toBe(false);
    expect(orderVisibleTo({ salesperson: '' }, null)).toBe(false); // '' ไม่อยู่ใน [] ว่าง
  });
});

/* ============================================================
   PART 119 — หน้า "เป้า & คอมมิชชั่น" ต้องเป็นแอดมินเท่านั้น
   ============================================================
   เดิม need:'edit' → เซลล์ (editor) เปิดหน้าและแก้เป้า/เรตคอมของตัวเองได้
   เทสนี้ล็อกกติกาไว้ที่ระดับ config ของหน้าตั้งค่า (อ่านไฟล์จริง กันมีคนแก้กลับ)
   ============================================================ */
import fs from 'node:fs';
describe('สิทธิ์หน้าตั้งค่า', () => {
  const src = fs.readFileSync(new URL('../../views-settings.jsx', import.meta.url), 'utf8');
  it("แท็บ 'เป้า & คอมมิชชั่น' ต้อง need: 'admin'", () => {
    const line = src.split('\n').find(l => l.includes("id: 'targets'"));
    expect(line).toBeTruthy();
    expect(line).toContain("need: 'admin'");
  });
  it('เนื้อแท็บต้องเรนเดอร์เมื่อเป็นแอดมินเท่านั้น', () => {
    const line = src.split('\n').find(l => l.includes('TabsContent value="targets"'));
    expect(line).toContain('_isAdmin && <TargetsView />');
  });
  it("แท็บ 'ผู้ใช้ & สิทธิ์' ยังเป็นแอดมินเหมือนเดิม (กันแก้พลาดข้างเคียง)", () => {
    const line = src.split('\n').find(l => l.includes("id: 'roles'"));
    expect(line).toContain("need: 'admin'");
  });
});

/* ============================================================
   ภาพรวมทีมในหน้าประสิทธิภาพเซล (2 ก.ย. 69)
   ============================================================
   user สั่ง: ทุก role เห็น "ภาพรวมทีม" ได้ (ยอดรวม/KPI/คนทัก/%ปิด/เสียงลูกค้า/กราฟ)
             แต่ "ตารางรายคน" (มีคอลัมน์ เป้า/คอม ของทุกคน) = แอดมินเท่านั้น
   ============================================================ */
describe('canSeeTeamOverview / canSeeTeamBoard', () => {
  const admin = { role: 'admin' }, editor = { role: 'editor' }, viewer = { role: 'viewer' };

  it('ภาพรวมทีม: ทุก role เห็นได้ (รวม viewer)', async () => {
    const { canSeeTeamOverview } = await import('../roleAccess.js');
    expect(canSeeTeamOverview(admin)).toBe(true);
    expect(canSeeTeamOverview(editor)).toBe(true);
    expect(canSeeTeamOverview(viewer)).toBe(true);
  });

  it('ไม่ล็อกอิน = ไม่เห็นอะไร', async () => {
    const { canSeeTeamOverview, canSeeTeamBoard } = await import('../roleAccess.js');
    expect(canSeeTeamOverview(null)).toBe(false);
    expect(canSeeTeamOverview({})).toBe(false);
    expect(canSeeTeamBoard(null)).toBe(false);
  });

  it('ตารางรายคน (มีค่าคอมของทุกคน): แอดมินเท่านั้น', async () => {
    const { canSeeTeamBoard } = await import('../roleAccess.js');
    expect(canSeeTeamBoard(admin)).toBe(true);
    expect(canSeeTeamBoard(editor)).toBe(false);
    expect(canSeeTeamBoard(viewer)).toBe(false);
  });

  it('canSeeTeam (ของเดิม) ยังเป็นแอดมินเท่านั้น — ห้ามเปลี่ยน มีที่อื่นใช้อยู่', async () => {
    const { canSeeTeam } = await import('../roleAccess.js');
    expect(canSeeTeam(admin)).toBe(true);
    expect(canSeeTeam(editor)).toBe(false);
  });
});

/* ชื่อเซลล์ที่มีช่องว่างหัว/ท้ายเกิดขึ้นจริงในข้อมูลชุดนี้ (funnelClose.js บันทึกไว้)
   ตัวรวมยอดทุกตัว trim → ตัวกรองสิทธิ์ต้อง trim ด้วย ไม่งั้นเซลล์เห็นคอมตัวเองเป็น ฿0 */
describe('orderVisibleTo ต้อง trim ชื่อ', () => {
  const editor = { role: 'editor', name: 'แอน', email: 'ann@tmk.co' };

  it('⛔ ออเดอร์ที่ salesperson มีช่องว่างหัวท้าย ต้องยังเป็นของเจ้าตัว', () => {
    expect(orderVisibleTo({ salesperson: ' แอน ' }, editor)).toBe(true);
    expect(orderVisibleTo({ salesperson: 'แอน' }, editor)).toBe(true);
  });

  it('ชื่อที่ trim แล้วมีช่องว่างในตัวเอง ยังต้องแยกกัน', () => {
    expect(orderVisibleTo({ salesperson: 'แอน บี' }, editor)).toBe(false);
  });

  it('ชื่อผู้ใช้เองมีช่องว่าง ก็ต้องจับคู่ได้', () => {
    expect(orderVisibleTo({ salesperson: 'แอน' }, { role: 'editor', name: ' แอน ' })).toBe(true);
  });

  it('คนอื่น/ว่าง ยังเห็นไม่ได้', () => {
    expect(orderVisibleTo({ salesperson: 'บี' }, editor)).toBe(false);
    expect(orderVisibleTo({ salesperson: '' }, editor)).toBe(false);
    expect(orderVisibleTo({ salesperson: '   ' }, editor)).toBe(false);
  });
});
