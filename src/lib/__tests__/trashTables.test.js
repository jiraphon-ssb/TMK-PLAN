/* ถังขยะ — ตารางไหนกวาด และอะไรลบถาวรได้บ้าง (ข้อ 3) */
import { describe, it, expect } from 'vitest';
import { TRASH_TABLES, needsAdminToPurge, purgeWarning } from '../trashTables.js';

describe('TRASH_TABLES', () => {
  it('ไม่มีตารางยุคเก่าที่เลิกใช้แล้ว (จะได้ไม่ยิง query เปล่า)', () => {
    const names = TRASH_TABLES.map(t => t.table);
    expect(names).not.toContain('tmk_products');
    expect(names).not.toContain('tmk_customer_segments');
  });
  it('ยังกวาดยอดรายวัน — soft-delete วันแล้วต้องกู้คืนได้', () => {
    expect(TRASH_TABLES.map(t => t.table)).toContain('tmk_daily_sales');
  });
  it('ทุกแถวมี table/type/nameCol/key ครบ', () => {
    TRASH_TABLES.forEach(t => {
      expect(t.table).toBeTruthy(); expect(t.type).toBeTruthy();
      expect(t.nameCol).toBeTruthy(); expect(t.key).toBeTruthy();
    });
  });
});

describe('needsAdminToPurge — ให้ตรงกับ policy ฝั่ง DB (RLS Tier 3b)', () => {
  const of = (tb) => TRASH_TABLES.find(t => t.table === tb);
  it('ยอดรายวัน = เงินยุคเก่า → แอดมินเท่านั้น', () => {
    expect(needsAdminToPurge(of('tmk_daily_sales'))).toBe(true);
  });
  it('ผู้ใช้/สิทธิ์ → แอดมินเท่านั้น (ของเดิม)', () => {
    expect(needsAdminToPurge(of('tmk_user_roles'))).toBe(true);
  });
  it('งาน/แคมเปญ → คนแก้ไขได้ก็ลบถาวรได้', () => {
    expect(needsAdminToPurge(of('tmk_tasks'))).toBe(false);
    expect(needsAdminToPurge(of('tmk_campaigns'))).toBe(false);
  });
  it('meta ว่าง/ไม่รู้จัก → ถือว่าต้องแอดมิน (ปลอดภัยไว้ก่อน)', () => {
    expect(needsAdminToPurge(null)).toBe(true);
    expect(needsAdminToPurge({ table: 'ไม่รู้จัก' })).toBe(true);
  });
});

describe('purgeWarning — ข้อความยืนยันต้องบอกว่ากำลังทำลายอะไร', () => {
  const of = (tb) => TRASH_TABLES.find(t => t.table === tb);
  it('ยอดรายวัน → เตือนว่าเป็นยอดขาย/ค่าแอดของวันนั้น', () => {
    const w = purgeWarning(of('tmk_daily_sales'), '30 มิ.ย.');
    expect(w).toContain('ยอดขาย');
    expect(w).toContain('30 มิ.ย.');
    expect(w).toContain('กู้คืนไม่ได้');
  });
  it('ตารางทั่วไป → ข้อความมาตรฐาน', () => {
    expect(purgeWarning(of('tmk_tasks'), 'งาน ก')).toContain('งาน ก');
  });
});
