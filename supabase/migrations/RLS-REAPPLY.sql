-- ============================================================
-- RLS-REAPPLY.sql — เปิด RLS กลับให้ทุกตาราง tmk_ (idempotent · รันซ้ำได้เสมอ)
-- ============================================================
-- ⚠️⚠️ แก้ครั้งใหญ่ 8 ก.ย. 2569 — เวอร์ชันก่อนหน้าของไฟล์นี้ "เปิดรูให้ยกระดับสิทธิ์เป็นแอดมิน"
--
-- ของเดิมทำอะไรผิด:
--   guard เช็คว่าตารางมี policy ชื่อ 'tmk_authenticated_all' / 'tmk_admin_write' / 'tmk_read_all' หรือยัง
--   แต่ **'tmk_admin_write' กับ 'tmk_read_all' ไม่เคยมีอยู่จริงในโปรเจกต์นี้เลย** (grep ทั้งรีโป = 0)
--   ชื่อจริงคือ tmk_user_roles_admin_write / tmk_user_roles_select / tmk_staff_admin_write /
--   tmk_staff_select (Tier 2) และ <table>_rls_read / <table>_rls_write (Tier 3)
--   แถม Tier 2 (บรรทัด 50, 64) กับ Tier 3 (บรรทัด 67, 83) **drop 'tmk_authenticated_all' ทิ้งไปแล้ว**
--   → หลังรัน Tier 2/3 ไม่มีชื่อไหน match เลย → loop สร้าง policy เปิดกว้างทับ **ทุกตาราง tmk_**
--   Postgres รวม permissive policy ด้วย OR → กฎ admin-only ของ Tier 2 ถูกข้ามทันที
--
-- ผลจริงถ้ารันเวอร์ชันเก่าหลัง Tier 2/3:
--   · พนักงานที่ล็อกอินอยู่ (แม้ role=viewer) ยิง PATCH /rest/v1/tmk_user_roles?email=eq.<ตัวเอง>
--     ตั้ง role='admin' ให้ตัวเองได้
--   · tmk_audit_logs จาก insert-only กลายเป็นแก้/ลบได้ = ลบร่องรอยตัวเองหลังแก้ยอดเงิน
--   · tmk_staff แก้รายชื่อ/อีเมลทีมได้
--
-- เวอร์ชันนี้แก้ 3 อย่าง:
--   1) guard ใหม่ = "ตารางนี้มี policy อะไรอยู่แล้วหรือยัง" (ไม่ hardcode ชื่อ) → ไม่มีทางทับของเดิมอีก
--   2) กันตารางสิทธิ์ไว้ตายตัว (tmk_user_roles / tmk_staff / tmk_audit_logs) — ต่อให้ policy หายก็
--      **ไม่สร้าง policy เปิดกว้างให้** แต่รายงานออกมาให้คนรันไปรัน Tier 2/3 เอง
--   3) รายงานผลท้ายไฟล์ว่าตารางไหนถูกแตะบ้าง (เดิมเงียบสนิท)
--
--   4) **ตรวจหา policy พิษที่เวอร์ชันเก่าเคยสร้างทิ้งไว้** แล้วรายงาน (ไม่ลบให้เอง — ดู §POISON ท้ายไฟล์)
--
-- หน้าที่ที่เหลือของไฟล์นี้ = **เปิด RLS กลับ** เท่านั้น (ซึ่งเป็นเหตุผลที่สร้างไฟล์นี้ตั้งแต่แรก:
-- migration เก่าบางไฟล์ลงท้ายด้วย `disable row level security` — ตอนนี้ถูกคอมเมนต์ปลดชนวนหมดแล้ว)
-- การ "เติม policy" เป็นงานของ Tier 1/2/3 ไม่ใช่ของไฟล์นี้
-- ============================================================

do $$
declare
  r record;
  n_rls_on int := 0;
  n_policy int := 0;
  bare text[] := '{}';
begin
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'tmk\_%' escape '\'
    order by c.relname
  loop
    -- (1) เปิด RLS เสมอ — งานหลักของไฟล์นี้ ปลอดภัยกับทุกตาราง
    if not (select relrowsecurity from pg_class where oid = ('public.' || quote_ident(r.relname))::regclass) then
      execute format('alter table public.%I enable row level security', r.relname);
      n_rls_on := n_rls_on + 1;
    end if;

    -- (2) ตารางสิทธิ์ = ห้ามแตะเด็ดขาด (เปิดกว้างที่นี่ = ยกระดับสิทธิ์ตัวเองได้)
    if r.relname in ('tmk_user_roles', 'tmk_staff', 'tmk_audit_logs') then
      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.relname) then
        bare := bare || r.relname;   -- ไม่มี policy = อ่านไม่ได้เลย · ให้คนรันไปรัน Tier 2/3 เอง
      end if;
      continue;
    end if;

    -- (3) ตารางธุรกิจ: เติม policy พื้นฐาน **เฉพาะตารางที่ยังไม่มี policy อะไรเลย**
    --     (ตารางที่ Tier 3 คุมอยู่จะมี <table>_rls_read/_rls_write อยู่แล้ว → ข้าม ไม่ทับ)
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.relname) then
      execute format(
        'create policy tmk_authenticated_all on public.%I as permissive for all to authenticated using (true) with check (true)',
        r.relname
      );
      n_policy := n_policy + 1;
    end if;
  end loop;

  raise notice 'เปิด RLS เพิ่ม % ตาราง · เติม policy พื้นฐาน % ตาราง', n_rls_on, n_policy;
  if array_length(bare, 1) is not null then
    raise notice '⚠️ ตารางสิทธิ์ที่ไม่มี policy เลย: % — ต้องรัน 20260716-rls-tier2-permission-tables.sql / BUNDLE-rls-tier3.sql เอง (ไฟล์นี้จงใจไม่แตะ)', array_to_string(bare, ', ');
  end if;
end $$;

-- ============================================================
-- VERIFY — ต้องได้ ✅ ทุกบรรทัด
-- ============================================================
-- -- 1) ไม่มีตาราง tmk_ ที่ RLS ปิดอยู่
-- select case when count(*) = 0 then '✅ RLS เปิดครบ' else '❌ ยังปิดอยู่: ' || string_agg(relname, ', ') end
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relkind = 'r' and relname like 'tmk\_%' escape '\' and not c.relrowsecurity;
--
-- -- 2) ⚠️ สำคัญสุด: ตารางสิทธิ์ต้องไม่มี policy เปิดกว้าง
-- select case when count(*) = 0 then '✅ ตารางสิทธิ์ยังล็อกอยู่'
--             else '❌ อันตราย — เปิดกว้าง: ' || string_agg(tablename || '.' || policyname, ', ') end
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('tmk_user_roles', 'tmk_staff', 'tmk_audit_logs')
--   and policyname = 'tmk_authenticated_all';
--
-- -- 3) ถ้าข้อ 2 ขึ้น ❌ (เคยรันไฟล์เวอร์ชันเก่าไปแล้ว) → ถอนพิษด้วย 3 บรรทัดนี้ แล้วรัน Tier 2/3 ใหม่
-- -- drop policy if exists tmk_authenticated_all on public.tmk_user_roles;
-- -- drop policy if exists tmk_authenticated_all on public.tmk_staff;
-- -- drop policy if exists tmk_authenticated_all on public.tmk_audit_logs;
--
-- -- 4) ดูว่ามีใครแอบตั้งตัวเองเป็นแอดมินไปแล้วหรือยัง (เทียบกับที่ควรเป็น)
-- select email, role, updated_at from public.tmk_user_roles order by updated_at desc nulls last;

-- ============================================================
-- ROLLBACK — ไฟล์นี้ไม่ลบข้อมูลและไม่ปิด RLS จึงไม่มี rollback
--   ถ้าต้องการถอน policy พื้นฐานที่เพิ่งเติม (เฉพาะตารางที่ไม่มี policy เลยมาก่อน):
--   drop policy if exists tmk_authenticated_all on public.<ชื่อตาราง>;
-- ============================================================

-- จดว่ารันแล้ว:
-- select public.tmk_migration_applied('RLS-REAPPLY.sql');

-- ============================================================
-- §POISON — ตรวจว่าเวอร์ชันเก่าของไฟล์นี้เคยสร้าง policy เปิดกว้างค้างไว้หรือเปล่า
-- ============================================================
-- รันบล็อกนี้ได้เสมอ · **อ่านอย่างเดียว ไม่แก้อะไร** (ตั้งใจ — การลบ policy ต้องให้คนตัดสิน)
--
-- ลายเซ็นของพิษ: policy ชื่อ 'tmk_authenticated_all' (ชื่อที่ loop เวอร์ชันเก่าสร้าง)
-- หรือ policy ใด ๆ ที่ permissive · for all · using(true) · with check(true)
-- ตัวนี้ถูก OR รวมกับกฎเข้มของ Tier 2/3 → กฎเข้มไม่มีผลทันที
do $$
declare r record; n int := 0;
begin
  for r in
    select p.tablename, p.policyname, p.cmd,
           coalesce(p.qual, '') as using_expr, coalesce(p.with_check, '') as check_expr
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename like 'tmk\_%' escape '\'
      and p.permissive = 'PERMISSIVE'
      and (p.policyname = 'tmk_authenticated_all'
           or (p.cmd = 'ALL' and coalesce(p.qual, '') = 'true' and coalesce(p.with_check, '') = 'true'))
    order by p.tablename, p.policyname
  loop
    n := n + 1;
    raise warning 'policy เปิดกว้าง: %.% (cmd=% using=% check=%)',
      r.tablename, r.policyname, r.cmd, r.using_expr, r.check_expr;
  end loop;

  if n = 0 then
    raise notice 'OK — ไม่พบ policy เปิดกว้างค้างอยู่ ไม่มีอะไรต้องทำ';
  else
    raise notice 'พบ % รายการข้างบน', n;
    raise notice 'ตารางที่ห้ามมีเด็ดขาด: tmk_user_roles · tmk_staff · tmk_audit_logs';
    raise notice '  (มีอยู่ = พนักงานที่ล็อกอินตั้ง role ตัวเองเป็น admin ได้ / ลบ audit log ได้)';
    raise notice 'วิธีลบทีละอัน (ตรวจให้แน่ก่อน ลบผิดตัวคนทำงานเข้าไม่ได้):';
    raise notice '  drop policy "<ชื่อ policy>" on public."<ตาราง>";';
    raise notice 'ลบแล้วต้องรัน BUNDLE-rls-tier3.sql ต่อทันที ไม่งั้นตารางนั้นไม่มี policy เลย = อ่านไม่ได้';
  end if;
end $$;

-- ดูเป็นตาราง (คัดลอกไปรันแยกได้)
-- select tablename, policyname, cmd, permissive, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename like 'tmk\_%' escape '\'
--   and permissive = 'PERMISSIVE'
--   and (policyname = 'tmk_authenticated_all'
--        or (cmd = 'ALL' and coalesce(qual, '') = 'true' and coalesce(with_check, '') = 'true'))
-- order by tablename;
