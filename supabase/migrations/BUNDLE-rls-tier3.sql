-- ============================================================================
-- BUNDLE-rls-tier3.sql — ล็อก "การเขียน/ลบ" ฝั่งฐานข้อมูล (RLS Tier 3)
-- ============================================================================
-- วางทั้งไฟล์ใน Supabase → SQL Editor → Run · idempotent (รันซ้ำได้)
--
-- ปัญหาที่ปิด: ตอนนี้สิทธิ์ viewer บังคับที่ "หน้าเว็บ" เป็นหลัก — คนที่เปิด devtools
--   ยิง REST ตรงได้: แก้ยอด / ลบข้อมูล / ลบ log ทั้งที่เป็น viewer
--
-- ทำอะไร:
--   §1 tmk_can_write() — เช็คจาก tmk_user_roles ว่าอีเมลใน JWT เป็น admin หรือ editor
--   §2 ทุกตาราง tmk_* : อ่าน = ทุกคนที่ล็อกอิน (ไม่แตะ = แดชบอร์ดไม่พัง)
--                       เขียน/ลบ = เฉพาะ admin/editor
--   §3 tmk_audit_logs : เพิ่มได้ · แก้/ลบไม่ได้เลย (log ต้องแก้ไม่ได้)
--   ครอบคลุมตารางใหม่ให้เองด้วย (crm_contacts · stock_counts · production_orders)
--   เพราะ §2 วนทุกตารางที่ขึ้นต้นด้วย tmk_
--
-- ⚠️ สิ่งที่ "ไม่ได้รวม" ไว้ในไฟล์นี้ และเหตุผล (ตรวจโค้ดจริงแล้ว 24 ส.ค. 69):
--   • Tier 3b §2 "ลบได้เฉพาะแอดมิน" — **ห้ามรันตอนนี้** จะทำให้ editor ทำงานไม่ได้
--     เพราะ flow ปกติของ editor ลบแถวตรง ๆ หลายจุด: แก้ออเดอร์ (ลบบรรทัดสินค้า
--     orderDrawer) · ส่งใบเสร็จซ้ำ/ยกเลิก (receiptSubmit ลบ tmk_mp_skus + tmk_sale_receipts)
--     · นำเข้าใหม่ (modals-import) · ลบคอมเมนต์งานของตัวเอง
--   • Tier 3b §3 "เห็นเฉพาะของตัวเอง" (ใบเสร็จ/คนทัก) — ยังไม่ควรเปิด เพราะรายงานขาย
--     ตั้งใจโชว์ยอดทั้งทีม ถ้าเปิดครึ่งเดียว (ออเดอร์ทั้งทีม + คนทักเฉพาะตัวเอง) %ปิดจะเพี้ยน
--     → ถ้าต้องการโหมด "เห็นเฉพาะของตัวเอง" จริง ต้องทำทั้งชุดพร้อมกันแล้วเทสก่อน
-- ============================================================================

-- ── PRE-FLIGHT (รันได้ก่อน · แค่ดู ไม่แก้อะไร) ────────────────────────────────
-- ใครจะยังเขียนได้หลังรันไฟล์นี้ — ถ้าอีเมลที่ทีมใช้ล็อกอินไม่อยู่ในลิสต์นี้ จะเซฟไม่ได้ทันที
select role, count(*) as คน, string_agg(lower(email), ', ' order by email) as อีเมล
from public.tmk_user_roles
where deleted_at is null
group by role
order by case role when 'admin' then 1 when 'editor' then 2 else 3 end;

begin;

-- ── §1 helper: caller เขียนได้ไหม (role ∈ admin/editor) ──────────────────────
create or replace function public.tmk_can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tmk_user_roles
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role in ('admin', 'editor')
      and deleted_at is null
  );
$$;
revoke all on function public.tmk_can_write() from public;
grant execute on function public.tmk_can_write() to authenticated;

-- ── §2 ทุกตาราง tmk_* : อ่าน=ทุกคนที่ล็อกอิน · เขียน/ลบ=can_write ──────────────
--    ยกเว้น tmk_user_roles/tmk_staff (Tier 2 ล็อกเข้ม admin-only แล้ว) + tmk_audit_logs (§3)
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename like 'tmk\_%'
      and tablename not in ('tmk_user_roles', 'tmk_staff', 'tmk_audit_logs')
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('drop policy if exists tmk_authenticated_all on public.%I', r.tablename);
    execute format('drop policy if exists %I on public.%I', r.tablename || '_rls_read', r.tablename);
    execute format('drop policy if exists %I on public.%I', r.tablename || '_rls_write', r.tablename);
    -- อ่าน: ทุกคนที่ล็อกอิน (permissive OR กับ _rls_write → select ผ่านเสมอ)
    execute format(
      'create policy %I on public.%I as permissive for select to authenticated using (true)',
      r.tablename || '_rls_read', r.tablename);
    -- เขียน/ลบ: เฉพาะ can_write (viewer ทำ insert/update/delete ไม่ได้)
    execute format(
      'create policy %I on public.%I as permissive for all to authenticated using (public.tmk_can_write()) with check (public.tmk_can_write())',
      r.tablename || '_rls_write', r.tablename);
  end loop;
end $$;

-- ── §3 tmk_audit_logs: insert ได้ · update/delete ห้ามทุกคน (log ต้องแก้ไม่ได้) ──
alter table public.tmk_audit_logs enable row level security;
drop policy if exists tmk_authenticated_all on public.tmk_audit_logs;
drop policy if exists tmk_audit_logs_read on public.tmk_audit_logs;
drop policy if exists tmk_audit_logs_insert on public.tmk_audit_logs;
create policy tmk_audit_logs_read on public.tmk_audit_logs
  as permissive for select to authenticated using (true);
create policy tmk_audit_logs_insert on public.tmk_audit_logs
  as permissive for insert to authenticated with check (true);
-- ไม่มี policy update/delete → RLS default deny → ไม่มีใคร (นอกจาก service_role) แก้/ลบ log ได้

commit;

-- ============================================================================
-- VERIFY — ทุกบรรทัดต้อง ✅
-- ============================================================================
select 'tmk_can_write() มีจริง (ต้อง = 1)' as check_item, count(*)::text as result,
       case when count(*) = 1 then '✅' else '❌' end as status
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'tmk_can_write' and p.prosecdef
union all
select 'ไม่เหลือ policy เปิดกว้าง tmk_authenticated_all (ต้อง = 0)', count(*)::text,
       case when count(*) = 0 then '✅' else '❌' end
from pg_policies where schemaname = 'public' and policyname = 'tmk_authenticated_all'
union all
select 'ตารางธุรกิจมี policy เขียนครบ (ต้อง ≥ 20)', count(*)::text,
       case when count(*) >= 20 then '✅' else '⚠️ ตรวจดู' end
from pg_policies where schemaname = 'public' and policyname like '%\_rls_write'
union all
select 'ตารางใหม่ (สต็อก/ใบสั่งผลิต/CRM ติดต่อ) ถูกล็อกด้วย (ต้อง = 3)', count(*)::text,
       case when count(*) = 3 then '✅' else '❌' end
from pg_policies where schemaname = 'public' and policyname like '%\_rls_write'
  and tablename in ('tmk_stock_counts', 'tmk_production_orders', 'tmk_crm_contacts')
union all
select 'tmk_audit_logs แก้/ลบไม่ได้ (ต้อง = 0)', count(*)::text,
       case when count(*) = 0 then '✅' else '❌' end
from pg_policies
where schemaname = 'public' and tablename = 'tmk_audit_logs' and cmd in ('UPDATE', 'DELETE');

-- จดว่ารันแล้ว (ถ้ามีระบบจด)
do $$
begin
  if exists (select 1 from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace
              where ns.nspname = 'public' and pr.proname = 'tmk_migration_applied') then
    execute format('select public.tmk_migration_applied(%L, %L)', '20260811-rls-tier3-business-data.sql', 'ผ่าน BUNDLE-rls-tier3.sql');
  end if;
end $$;

-- ============================================================================
-- ROLLBACK — ถอยกลับเป็นแบบเดิม (ทุกคนที่ล็อกอินเขียนได้) · ใช้เมื่อมีคนเซฟไม่ได้
-- ============================================================================
-- begin;
--   do $$
--   declare r record;
--   begin
--     for r in select tablename from pg_tables
--       where schemaname='public' and tablename like 'tmk\_%'
--         and tablename not in ('tmk_user_roles','tmk_staff')
--     loop
--       execute format('drop policy if exists %I on public.%I', r.tablename||'_rls_read', r.tablename);
--       execute format('drop policy if exists %I on public.%I', r.tablename||'_rls_write', r.tablename);
--       execute format('create policy tmk_authenticated_all on public.%I as permissive for all to authenticated using (true) with check (true)', r.tablename);
--     end loop;
--   end $$;
-- commit;
