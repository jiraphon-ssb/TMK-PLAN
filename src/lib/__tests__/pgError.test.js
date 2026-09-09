import { describe, it, expect } from 'vitest';
import { isMissingTable, isMissingColumn, needsMigration, isDenied, pgErrorText, isTaskStatusLocked } from '../pgError.js';

// เคสจริงจาก PostgREST/Postgres — ข้อความ+โค้ดตามที่ Supabase คืนมา
const E = {
  noTable: { code: '42P01', message: 'relation "public.tmk_stock_counts" does not exist' },
  noTableCache: { code: 'PGRST205', message: "Could not find the table 'public.tmk_stock_counts' in the schema cache" },
  noCol: { code: '42703', message: 'column "calls_target" does not exist' },
  noColCache: { code: 'PGRST204', message: "Could not find the 'answer_rate_target' column of 'tmk_crm_targets' in the schema cache" },
  rls: { code: '42501', message: 'new row violates row-level security policy for table "tmk_stock_counts"' },
  jwt: { code: 'PGRST301', message: 'JWT expired' },
  dup: { code: '23505', message: 'duplicate key value violates unique constraint "tmk_production_orders_pkey"' },
  net: { message: 'TypeError: Failed to fetch' },
};

describe('pgError — แยกเหตุให้ตรง', () => {
  it('ไม่มีตาราง = ต้องรัน migration', () => {
    expect(isMissingTable(E.noTable)).toBe(true);
    expect(isMissingTable(E.noTableCache)).toBe(true);
    expect(needsMigration(E.noTable)).toBe(true);
  });

  it('ไม่มีคอลัมน์ = migration เก่ากว่าโค้ด', () => {
    expect(isMissingColumn(E.noCol)).toBe(true);
    expect(isMissingColumn(E.noColCache)).toBe(true);
    expect(needsMigration(E.noColCache)).toBe(true);
    expect(isMissingTable(E.noCol)).toBe(false);
  });

  // นี่คือบั๊กเดิม: regex กว้างจนแมตช์ "ชื่อตาราง" → RLS/สิทธิ์ถูกรายงานว่า "ยังไม่ได้รัน migration"
  it('RLS ปฏิเสธ ต้องไม่ถูกมองว่าเป็น migration', () => {
    expect(needsMigration(E.rls)).toBe(false);
    expect(isDenied(E.rls)).toBe(true);
    expect(isDenied(E.jwt)).toBe(true);
  });

  it('constraint/เน็ตหลุด = error ธรรมดา ไม่ใช่ migration ไม่ใช่สิทธิ์', () => {
    expect(needsMigration(E.dup)).toBe(false);
    expect(isDenied(E.dup)).toBe(false);
    expect(needsMigration(E.net)).toBe(false);
  });

  it('ข้อความที่เอาไปโชว์ต้องมีโค้ดติดไปด้วย', () => {
    expect(pgErrorText(E.dup)).toContain('23505');
    expect(pgErrorText(E.rls)).toContain('ไม่มีสิทธิ์');
    expect(pgErrorText(null)).toBe('');
  });

  it('ไม่มี error = ไม่มีอะไรผิด', () => {
    expect(needsMigration(null)).toBe(false);
    expect(isDenied(undefined)).toBe(false);
  });
});

/* คำค้นที่ทำ PostgREST filter พัง — กันไม่ให้ Spotlight เงียบ (สร้าง sanitizer เดียวกับใน Spotlight) */
describe('sanitize คำค้นก่อนยัดเข้า or= ของ PostgREST', () => {
  const safe = (term) => term.replace(/[(),."'\\]/g, ' ').replace(/\s+/g, ' ').trim();
  it('ตัดอักขระที่ทำ syntax พัง', () => {
    expect(safe('สมชาย, ร้านเจ๊')).toBe('สมชาย ร้านเจ๊');
    expect(safe('บ.ก(1)')).toBe('บ ก 1');
    expect(safe('  ')).toBe('');
  });
});

/* ============================================================
   คอลัมน์สถานะที่สร้างเอง — ยังไม่ได้รัน migration ต้องบอกให้รู้เรื่อง (2 ก.ย. 69)
   ============================================================
   tmk_tasks.status เคยถูกล็อกไว้ 4 ค่า → ลากการ์ดเข้าคอลัมน์ที่สร้างเองแล้วพัง
   ข้อความดิบจาก Postgres เป็นภาษาอังกฤษล้วน ผู้ใช้อ่านไม่ออกว่าต้องทำอะไร
   ============================================================ */
describe('สถานะที่ผู้ใช้สร้างเอง (tmk_tasks_status_check)', () => {
  const err = { code: '23514', message: 'new row for relation "tmk_tasks" violates check constraint "tmk_tasks_status_check"' };

  it('บอกว่าเป็นเพราะคอลัมน์ที่สร้างเอง + ต้องรัน migration ไหน', () => {
    const t = pgErrorText(err);
    expect(t).toContain('คอลัมน์สถานะ');
    expect(t).toContain('20260902-tasks-custom-status.sql');
  });

  it('needsMigration = true → UI ควรชี้ไปที่การรัน migration ไม่ใช่บอกว่าระบบพัง', () => {
    expect(needsMigration(err)).toBe(true);
  });

  it('check constraint อื่นไม่ถูกเหมารวม', () => {
    const other = { code: '23514', message: 'violates check constraint "tmk_campaigns_status_check"' };
    expect(isTaskStatusLocked(err)).toBe(true);
    expect(isTaskStatusLocked(other)).toBe(false);
    expect(pgErrorText(other)).not.toContain('20260902-tasks-custom-status.sql');
    expect(needsMigration(other)).toBe(false);
  });

  it('error ปกติไม่ถูกกระทบ', () => {
    expect(needsMigration({ code: '23505', message: 'duplicate key' })).toBe(false);
  });
});
