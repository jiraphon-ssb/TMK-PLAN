-- ============================================================================
-- 20260821-realtime-targets.sql — เพิ่มตาราง "เป้า/ตั้งค่า" เข้า realtime publication
-- ============================================================================
-- อาการ: แก้เป้า CRM/เป้าเซลล์/เป้าเดือน/วันตัดรอบ ในหน้าตั้งค่า → หน้าอื่นที่เปิดค้าง
-- (ภาพรวม CRM / ประสิทธิภาพเซล / รายงานขาย) ไม่เด้งตาม ต้องรีเฟรชเอง
-- เหตุ: ตารางเหล่านี้ไม่อยู่ใน publication supabase_realtime (20260706/20260711 ครอบเฉพาะตารางยอดขาย)
-- Idempotent: เช็คก่อน add · รันซ้ำได้ · FE มี fallback (refetch ตอนกลับมาโฟกัสหน้า) อยู่แล้ว
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['tmk_targets', 'tmk_crm_targets', 'tmk_monthly_history', 'tmk_settings'] loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t)
       and not exists (select 1 from pg_publication_tables
               where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- select public.tmk_migration_applied('20260821-realtime-targets.sql');

-- ── VERIFY (ต้องได้ 4 แถว) ──────────────────────────────────────────────────
select tablename, '✅' as status from pg_publication_tables
where pubname='supabase_realtime' and schemaname='public'
  and tablename in ('tmk_targets','tmk_crm_targets','tmk_monthly_history','tmk_settings')
order by tablename;
