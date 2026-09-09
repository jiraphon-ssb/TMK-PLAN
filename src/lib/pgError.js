/* ============================================================
   pgError.js — จำแนก error จาก Supabase/PostgREST ให้ตรงเหตุ
   ============================================================
   ทำไมต้องมี: เดิมแต่ละไฟล์ใช้ regex กว้างๆ แบบ /...|tmk_ชื่อตาราง|schema cache/
   ซึ่งแมตช์ "ชื่อตาราง" เฉยๆ → error จริงทุกชนิดที่เอ่ยชื่อตาราง
   (RLS ปฏิเสธ · ไม่มีสิทธิ์ · คอลัมน์ไม่ตรง · ค่าไม่ผ่าน constraint)
   ถูกกลบเป็น "ต้องรัน migration ก่อน" ทั้งที่รัน migration ไปแล้ว
   → ผู้ใช้เห็นข้อความผิด และเรา debug ต่อไม่ได้เพราะข้อความจริงหายไป

   ไฟล์นี้ตัดสินจาก "โค้ด error" เป็นหลัก (ตรงกว่า regex) แล้วค่อย fallback เป็นข้อความ
   - 42P01 / PGRST205 = ไม่มีตาราง        → ยังไม่ได้รัน migration
   - 42703 / PGRST204 = ไม่มีคอลัมน์      → migration เก่ากว่าโค้ด
   - 42501 / PGRST301 = RLS/สิทธิ์ปฏิเสธ  → คนละเรื่องกับ migration
   ============================================================ */

const TABLE_MISSING = new Set(['42P01', 'PGRST205']);
const COLUMN_MISSING = new Set(['42703', 'PGRST204']);
const DENIED = new Set(['42501', 'PGRST301']);

const blob = (e) => `${e?.message || ''} | ${e?.details || ''} | ${e?.hint || ''}`.toLowerCase();

/** ตารางยังไม่มีจริงๆ (ยังไม่ได้รัน migration หรือ PostgREST ยังไม่รีโหลด schema) */
export function isMissingTable(error) {
  if (!error) return false;
  if (TABLE_MISSING.has(String(error.code || ''))) return true;
  const s = blob(error);
  return /relation .* does not exist/.test(s) || /could not find the table .* in the schema cache/.test(s);
}

/** คอลัมน์ยังไม่มี — โค้ดใหม่กว่า migration ที่รันไป */
export function isMissingColumn(error) {
  if (!error) return false;
  if (COLUMN_MISSING.has(String(error.code || ''))) return true;
  const s = blob(error);
  return /column .* does not exist/.test(s) || /could not find the .* column .* in the schema cache/.test(s);
}

/** ต้องไปรัน migration ก่อน (ตารางหรือคอลัมน์หาย) */
/* คอลัมน์สถานะที่ผู้ใช้สร้างเอง (ตั้งค่าโครงการ → คอลัมน์สถานะ) ใช้ id แบบสุ่ม 'st_xxxxx'
   แต่ tmk_tasks.status เคยถูกล็อกไว้ 4 ค่าตั้งแต่ SETUP-ALL.sql → ลากการ์ดเข้าแล้ว DB ปฏิเสธ
   ข้อความดิบเป็นอังกฤษล้วน ผู้ใช้อ่านไม่ออกว่าต้องทำอะไร → แปลงเป็นคำแนะนำที่ทำตามได้ */
export const TASK_STATUS_MIGRATION = '20260902-tasks-custom-status.sql';
export function isTaskStatusLocked(error) {
  return !!error && /tmk_tasks_status_check/.test(blob(error));
}

export function needsMigration(error) {
  if (isTaskStatusLocked(error)) return true;   // ยังไม่ได้คลาย check ของ tmk_tasks.status
  return isMissingTable(error) || isMissingColumn(error);
}

/** ถูกปฏิเสธเพราะสิทธิ์/RLS/เซสชันหมดอายุ — ไม่ใช่เรื่อง migration */
export function isDenied(error) {
  if (!error) return false;
  if (DENIED.has(String(error.code || ''))) return true;
  return /row-level security|permission denied|jwt expired|invalid claim|not authorized/.test(blob(error));
}

/** ข้อความพร้อมโชว์ — มีโค้ดติดไปด้วยเสมอเพื่อให้ไล่ต่อได้ */
export function pgErrorText(error) {
  if (!error) return '';
  const code = error.code ? ` (${error.code})` : '';
  const msg = error.message || error.details || 'เกิดข้อผิดพลาดที่ไม่รู้จัก';
  if (isDenied(error)) return `ไม่มีสิทธิ์เข้าถึงข้อมูล — ตรวจสิทธิ์ผู้ใช้/RLS${code}: ${msg}`;
  if (isTaskStatusLocked(error)) {
    return `ย้ายเข้าคอลัมน์สถานะที่สร้างเองไม่ได้ — ฐานข้อมูลยังล็อกไว้เฉพาะ 4 สถานะเดิม `
      + `· ต้องรัน ${TASK_STATUS_MIGRATION} ใน Supabase ก่อน แล้วจะย้ายได้ทันที${code}`;
  }
  if (isMissingColumn(error)) return `โครงสร้างตารางยังไม่ครบ (คอลัมน์หาย)${code}: ${msg}`;
  return `${msg}${code}`;
}
