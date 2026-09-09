-- ============================================================
-- 20260902-tasks-custom-status.sql — ปลดล็อกคอลัมน์สถานะที่ผู้ใช้สร้างเอง
-- ============================================================
-- วางทั้งไฟล์ใน Supabase → SQL Editor → Run · idempotent (รันซ้ำได้)
--
-- ⛔ บั๊กที่แก้:
--   ตั้งค่าโครงการ → คอลัมน์สถานะ → "เพิ่มคอลัมน์" สร้าง id แบบสุ่ม เช่น 'st_k3f9a'
--   (src/flowSettingsPage.jsx — addStatus)
--   แต่ tmk_tasks.status ถูกล็อกไว้ตั้งแต่ SETUP-ALL.sql:72 ว่าต้องเป็น 1 ใน 4 ค่านี้เท่านั้น:
--       check (status in ('todo','inprogress','review','done'))
--   → ลากการ์ดเข้าคอลัมน์ที่สร้างเอง = DB ปฏิเสธ
--       new row for relation "tmk_tasks" violates check constraint "tmk_tasks_status_check"
--     แล้วบอร์ดดึงของจริงกลับมา → การ์ดเด้งกลับที่เดิม (อาการ "ย้ายแล้วไม่ยอมไป")
--   กระทบทุกทางที่เขียน status: ลาก Kanban · เปลี่ยนจากหน้ารายการ · ป๊อปอัพงาน
--
-- ทำอะไร:
--   เปลี่ยน check จาก "ต้องเป็น 1 ใน 4 ค่า" → "ต้องไม่ว่างและไม่ยาวเกินไป"
--   เพราะคอลัมน์สถานะเป็นสิ่งที่ **ผู้ใช้นิยามเองต่อโครงการ** (tmk_flows.statuses)
--   การล็อกรายการค่าไว้ที่ฐานข้อมูลจึงขัดกับดีไซน์ของฟีเจอร์ตั้งแต่แรก
--
-- ทำไมไม่ล็อกด้วย regex 'st_%':
--   จะผูก DB เข้ากับวิธีตั้ง id ของโค้ด — วันไหนเปลี่ยนวิธีตั้ง id ต้องกลับมาแก้ DB อีกรอบ
--   (และจะพังเงียบแบบเดิมเป๊ะ) · ความถูกต้องของ id คุมที่แอปซึ่งเป็นเจ้าของนิยาม
--
-- ⚠️ นี่คือการ "คลาย" กฎระดับตาราง — ผู้ใช้เลือกทางนี้เอง (2 ก.ย. 69)
--    ข้อมูลเดิมไม่ถูกแตะ · ไม่มีแถวไหนถูกแก้/ลบ
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.tmk_tasks') is null then
    raise notice 'ข้าม — ยังไม่มีตาราง tmk_tasks';
    return;
  end if;

  -- 1) ถอด check เดิม (ชื่อ default ที่ Postgres ตั้งให้ตอน create table)
  alter table public.tmk_tasks drop constraint if exists tmk_tasks_status_check;

  -- 2) ใส่ check ใหม่ — กันแค่ค่าว่าง/ยาวผิดปกติ ไม่ล็อกรายการค่า
  --    ต้อง drop ก่อนเสมอ ไม่งั้นรันซ้ำจะ error ว่า constraint ซ้ำ
  alter table public.tmk_tasks drop constraint if exists tmk_tasks_status_nonempty;
  alter table public.tmk_tasks
    add constraint tmk_tasks_status_nonempty
    check (status is not null and length(btrim(status)) between 1 and 64);

  raise notice 'ปลดล็อก tmk_tasks.status แล้ว — คอลัมน์ที่สร้างเองใช้ได้';
end $$;

commit;

-- ============================================================
-- VERIFY — ต้องได้ ✅ ทุกบรรทัด
-- ============================================================
-- select
--   case when not exists (
--     select 1 from pg_constraint where conname = 'tmk_tasks_status_check'
--       and conrelid = 'public.tmk_tasks'::regclass
--   ) then '✅ ถอด check เดิมแล้ว' else '❌ check เดิมยังอยู่' end as เดิม,
--   case when exists (
--     select 1 from pg_constraint where conname = 'tmk_tasks_status_nonempty'
--       and conrelid = 'public.tmk_tasks'::regclass
--   ) then '✅ check ใหม่ติดตั้งแล้ว' else '❌ ไม่มี check ใหม่' end as ใหม่;
--
-- -- ทดสอบจริงว่าค่าที่ผู้ใช้สร้างเองผ่านได้ (ไม่เขียนจริง — rollback ทิ้ง)
-- begin;
--   update public.tmk_tasks set status = 'st_test1'
--   where id = (select id from public.tmk_tasks limit 1);
--   select '✅ ค่าที่สร้างเองผ่านแล้ว' as ผล;
-- rollback;
--
-- -- ดูว่ามีสถานะอะไรใช้อยู่บ้างตอนนี้
-- select status, count(*) from public.tmk_tasks group by status order by 2 desc;

-- ============================================================
-- ROLLBACK — กลับไปล็อก 4 ค่าเดิม
-- ⚠️ ถ้ามีงานที่ย้ายเข้าคอลัมน์ที่สร้างเองไปแล้ว จะ rollback ไม่ผ่าน
--    (แถวเหล่านั้นละเมิด check เดิม) — ต้องย้ายงานกลับก่อน:
--      update public.tmk_tasks set status = 'todo'
--      where status not in ('todo','inprogress','review','done');
-- ============================================================
-- alter table public.tmk_tasks drop constraint if exists tmk_tasks_status_nonempty;
-- alter table public.tmk_tasks
--   add constraint tmk_tasks_status_check
--   check (status in ('todo','inprogress','review','done'));

-- จดว่ารันแล้ว:
-- select public.tmk_migration_applied('20260902-tasks-custom-status.sql');
