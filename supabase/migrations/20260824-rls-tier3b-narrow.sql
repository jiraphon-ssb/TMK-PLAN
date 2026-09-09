-- ============================================================================
-- 20260824-rls-tier3b-narrow.sql — Tier 3b "แบบแคบ": ล็อกเฉพาะที่ล็อกได้จริง
-- ============================================================================
-- ⚠️ ต้องรัน BUNDLE-rls-tier3.sql ก่อน (รันแล้ว 24 ส.ค. 69)
--
-- ทำไมไม่ใช้ไฟล์ 20260811-rls-tier3b-owner-scope.sql (ตัวเต็ม):
--   §2 ของตัวเต็ม = "ลบได้เฉพาะแอดมิน ทุกตาราง" → พังงานประจำของ editor ทันที
--      (ไล่โค้ดแล้วเจอ .delete() 34 จุดใน 13 ไฟล์: ส่งใบเสร็จซ้ำ/ยกเลิกใบ 15 จุด ·
--       แก้ออเดอร์-ลบบรรทัดสินค้า 8 จุด · นำเข้าใหม่ · ลบคอมเมนต์ตัวเอง)
--   §3 = "เห็นเฉพาะของตัวเอง" (ใบเสร็จ/คนทัก) → รายงานขายโชว์ยอดทั้งทีมอยู่
--      ถ้าเปิดครึ่งเดียว %ปิดของคนที่ไม่ใช่แอดมินจะเพี้ยน
--   → ไฟล์นี้จึงล็อกเฉพาะจุดที่ "ไม่มี editor คนไหนแตะอยู่แล้ว" = ได้ความปลอดภัยโดยไม่พังงาน
--
-- §1 ลบได้เฉพาะแอดมิน — 6 ตารางที่ไม่มี flow ของ editor ลบเลย (ตรวจโค้ด 24 ส.ค. 69)
--     tmk_stock_counts      ปุ่ม "ยกเลิกรอบนับ" กั้น isAdmin() อยู่แล้ว
--     tmk_production_orders มีฟังก์ชันลบแต่ยังไม่มีปุ่มในหน้าไหน
--     tmk_crm_contacts      เหมือนกัน (deleteContact ยังไม่ถูกเรียก)
--     tmk_monthly_history / tmk_crm_targets  ไม่มีจุดลบใน FE เลย
--     tmk_daily_sales  ⚠️ แก้คำอธิบาย 1 ก.ย. 69 (ของเดิมเขียนผิด · SQL ด้านล่างไม่เปลี่ยน):
--       ข้อความเดิมว่า "ไม่มีจุดลบใน FE เลย" **ไม่จริง** — ถังขยะ (ตั้งค่า → ถังขยะ) มีปุ่ม
--       "ลบถาวร" ที่ยิง delete จริงบนตารางนี้ (views-settings-tabs.jsx · TRASH_TABLES)
--       ที่ถูกคือ: "ลบวัน" จากหน้ากรอกยอด = soft-delete (ตั้ง deleted_at) แต่ถังขยะลบแถวจริงได้
--       policy delete=admin ด้านล่างจึงเป็นด่านที่ทำงานจริง ไม่ใช่แค่กันไว้เฉย ๆ
--       (PART 123d ตามไปกั้น guardAdmin ฝั่งเว็บให้ตรงกันแล้ว + เตือนว่ากำลังลบยอดขายทั้งวัน)
-- §2 เขียนได้เฉพาะแอดมิน — 4 ตาราง "ค่าตอบแทน/ตั้งค่าเงิน"
--     tmk_targets · tmk_crm_targets · tmk_monthly_history · tmk_settings
--     (เป้ารายคน · เรตคอม · เป้าเดือน · วันตัดรอบคอม) — เขียนจากหน้า ตั้งค่า → เป้า & คอม
--     ซึ่ง PART 119 ปิดให้แอดมินเท่านั้นแล้ว · ล็อกที่ DB อีกชั้นกัน editor ยิง REST ตรง
--
-- เทคนิค: policy แบบ restrictive = AND กับ policy เดิมของ Tier 3 → ไม่ต้องแก้/ลบของเดิม
-- Idempotent: รันซ้ำได้ · VERIFY + ROLLBACK ท้ายไฟล์
-- ============================================================================

begin;

-- helper: เป็นแอดมินไหม (ถ้า Tier 2 สร้างไว้แล้วจะถูกแทนที่ด้วยตัวเดียวกัน — นิยามเหมือนกัน)
create or replace function public.tmk_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tmk_user_roles
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role = 'admin'
      and deleted_at is null
  );
$$;
revoke all on function public.tmk_is_admin() from public;
grant execute on function public.tmk_is_admin() to authenticated;

-- ── §1 ลบ = แอดมินเท่านั้น (6 ตาราง) ────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'tmk_stock_counts', 'tmk_production_orders', 'tmk_crm_contacts',
    'tmk_monthly_history', 'tmk_daily_sales', 'tmk_crm_targets'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'ข้าม % (ยังไม่มีตารางนี้)', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_rls_delete_admin', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (public.tmk_is_admin())',
      t || '_rls_delete_admin', t);
  end loop;
end $$;

-- ── §2 เขียน/แก้/ลบ = แอดมินเท่านั้น (ตารางค่าตอบแทน/ตั้งค่าเงิน) ─────────────
do $$
declare t text;
begin
  foreach t in array array['tmk_targets', 'tmk_crm_targets', 'tmk_monthly_history', 'tmk_settings'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'ข้าม % (ยังไม่มีตารางนี้)', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_rls_money_admin', t);
    -- restrictive + for all → อ่านยังได้ตามเดิม? ไม่ใช่: for all ครอบ select ด้วย
    -- จึงใส่ทีละคำสั่ง (insert/update/delete) เพื่อ "ไม่แตะการอ่าน" — ทุกคนยังดูเป้าได้เหมือนเดิม
    execute format('drop policy if exists %I on public.%I', t || '_rls_money_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_rls_money_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_rls_money_del', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.tmk_is_admin())', t || '_rls_money_ins', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.tmk_is_admin()) with check (public.tmk_is_admin())', t || '_rls_money_upd', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.tmk_is_admin())', t || '_rls_money_del', t);
  end loop;
end $$;

commit;

-- ============================================================================
-- VERIFY — ต้องได้ ✅ ทุกบรรทัด
-- ============================================================================
select 'tmk_is_admin() มีจริง (ต้อง = 1)' as check_item, count(*)::text as result,
       case when count(*) = 1 then '✅' else '❌' end as status
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'tmk_is_admin' and p.prosecdef
union all
select 'policy ลบ=แอดมิน ครบ 6 ตาราง', count(*)::text,
       case when count(*) = 6 then '✅' else '⚠️ ตรวจดู' end
from pg_policies where schemaname = 'public' and policyname like '%\_rls_delete_admin'
union all
select 'policy เขียน=แอดมิน ครบ 12 (4 ตาราง × ins/upd/del)', count(*)::text,
       case when count(*) = 12 then '✅' else '⚠️ ตรวจดู' end
from pg_policies where schemaname = 'public' and policyname like '%\_rls_money\_%'
union all
select 'การ "อ่าน" เป้า/ตั้งค่า ต้องไม่ถูกจำกัด (restrictive select = 0)', count(*)::text,
       case when count(*) = 0 then '✅' else '❌ อ่านไม่ได้แล้ว — rollback' end
from pg_policies
where schemaname = 'public' and permissive = 'RESTRICTIVE' and cmd = 'SELECT'
  and tablename in ('tmk_targets', 'tmk_crm_targets', 'tmk_monthly_history', 'tmk_settings');

-- ============================================================================
-- ROLLBACK — ถอยเฉพาะไฟล์นี้ (Tier 3 ยังอยู่)
-- ============================================================================
-- begin;
--   do $$
--   declare t text;
--   begin
--     foreach t in array array['tmk_stock_counts','tmk_production_orders','tmk_crm_contacts',
--                              'tmk_monthly_history','tmk_daily_sales','tmk_crm_targets','tmk_targets','tmk_settings'] loop
--       execute format('drop policy if exists %I on public.%I', t||'_rls_delete_admin', t);
--       execute format('drop policy if exists %I on public.%I', t||'_rls_money_ins', t);
--       execute format('drop policy if exists %I on public.%I', t||'_rls_money_upd', t);
--       execute format('drop policy if exists %I on public.%I', t||'_rls_money_del', t);
--     end loop;
--   end $$;
-- commit;

-- จดว่ารันแล้ว
do $$
begin
  if exists (select 1 from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace
              where ns.nspname = 'public' and pr.proname = 'tmk_migration_applied') then
    execute format('select public.tmk_migration_applied(%L, %L)', '20260824-rls-tier3b-narrow.sql', 'ลบ=admin 6 ตาราง + เขียน=admin 4 ตารางเงิน');
  end if;
end $$;
