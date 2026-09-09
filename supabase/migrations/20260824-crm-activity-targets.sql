-- ============================================================
-- 20260824-crm-activity-targets.sql — เป้าเชิงกิจกรรมของทีม CRM (PART 110 · ชุด 3)
-- ============================================================
-- เดิมเป้า CRM มีแค่ "ยอดเงิน" (sales_target) ทั้งที่ระบบเก็บจำนวนสาย/อัตรารับสายไว้ครบ
-- → เพิ่ม 2 คอลัมน์ในตารางเป้าเดิม (ไม่สร้างตารางใหม่ · ตั้งค่าที่หน้า ตั้งค่า › เป้า & คอม ที่เดียวเหมือนเดิม)
-- ปลอดภัย: add column if not exists (idempotent) · ค่า default 0 = "ไม่ได้ตั้งเป้า" → UI ไม่โชว์
-- ============================================================

alter table public.tmk_crm_targets add column if not exists calls_target integer default 0;      -- เป้าจำนวนสาย/เดือน
alter table public.tmk_crm_targets add column if not exists answer_rate_target numeric default 0; -- เป้าอัตรารับสาย (%)

-- ============================================================
-- VERIFY
-- ============================================================
-- select column_name, data_type from information_schema.columns
--  where table_name = 'tmk_crm_targets' and column_name in ('calls_target','answer_rate_target');

-- ============================================================
-- ROLLBACK
-- ============================================================
-- alter table public.tmk_crm_targets drop column if exists calls_target;
-- alter table public.tmk_crm_targets drop column if exists answer_rate_target;

-- จดว่ารันแล้ว:
-- select public.tmk_migration_applied('20260824-crm-activity-targets.sql');
