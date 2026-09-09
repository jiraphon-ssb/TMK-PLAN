-- 🚨 ห้ามรันไฟล์นี้ซ้ำหลังรัน Tier 2/3 โดยไม่อ่านคอมเมนต์ในลูปก่อน (แก้ guard แล้ว 8 ก.ย. 69)
-- ============================================================================
-- 20260716-enable-rls-tier1.sql — RLS-1: เปิด Row Level Security ทุกตาราง tmk_*
-- ============================================================================
-- ⚠️⚠️ ลำดับการ deploy สำคัญมาก — อ่านก่อนรัน ⚠️⚠️
--   1) merge branch audit-remediation → main → รอ Vercel deploy เสร็จก่อน
--      (FE ใหม่มี: โหลดข้อมูลหลัง login + หน้า track/share เรียก RPC ก่อน-fallback ทีหลัง)
--   2) แล้วค่อยรันไฟล์นี้ใน Supabase SQL Editor (รันทั้งไฟล์รวดเดียวได้ — อยู่ใน transaction เดียว)
--   3) ทดสอบ: login ใหม่เห็นข้อมูล · realtime ขยับ · ?track= และ ?share= ยังใช้ได้
--   ถ้ารันก่อน deploy FE: หน้า public (track/share) จะพังจนกว่า FE ใหม่ขึ้น + login ใหม่จะเจอแอปว่างจนกด refresh
--
-- ทำอะไร (Tier 1 — behavior-preserving สำหรับ user ที่ล็อกอิน):
--   §1 เปิด RLS ทุกตาราง public.tmk_* + policy "ต้องล็อกอิน (authenticated) เท่านั้น" (สิทธิ์ละเอียดต่อ role = Tier 2 ภายหลัง)
--   §2 views tmk_* → security_invoker = on (ให้ view เคารพ RLS ของตารางข้างใต้ — กัน anon อ่านผ่าน view)
--   §3 RPC สาธารณะ 2 ตัว (SECURITY DEFINER · จำกัดคอลัมน์/เงื่อนไข) แทนการอ่านตารางตรงของหน้า track/share
-- ผลกับ role:
--   anon (key สาธารณะใน bundle)   → อ่าน/เขียนตารางไม่ได้เลย · เรียกได้แค่ 2 RPC (ต้องรู้ code/token ตรงเป๊ะ)
--   authenticated (ล็อกอินแล้ว)    → ใช้งานเหมือนเดิมทุกอย่าง (policy using true)
--   service_role / postgres        → bypass ตามปกติ (RPC เดิม tmk_delete_orders ฯลฯ = definer อยู่แล้ว ไม่กระทบ)
-- Idempotent: รันซ้ำได้ ไม่พัง
-- ============================================================================

begin;

-- ── §1 เปิด RLS + policy authenticated-all ทุกตาราง tmk_* ──────────────────
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'tmk\_%' escape '\'
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    /* ⚠️⚠️ แก้ 8 ก.ย. 69 — เวอร์ชันเดิมของบล็อกนี้ "รันซ้ำแล้วย้อนงานความปลอดภัยทั้งหมด"
       guard เดิมเช็คแค่ชื่อ policy ของตัวเอง แต่ Tier 2 (บรรทัด 50, 64) และ Tier 3
       (BUNDLE-rls-tier3.sql:67) drop 'tmk_authenticated_all' ทิ้งไปแล้ว
       → รันไฟล์นี้ซ้ำ = สร้าง using(true) with check(true) ทับ **ทุกตาราง tmk_**
         รวม tmk_user_roles → permissive policy ถูก OR กัน → กฎ admin-only ถูกข้าม
         → viewer ยิง PATCH /rest/v1/tmk_user_roles?email=eq.<ตัวเอง> ตั้ง role='admin' ได้
       guard ใหม่: (ก) ข้ามตารางสิทธิ์ตายตัว (ข) เช็คว่า "ตารางนี้มี policy อะไรอยู่แล้วหรือยัง"
       ไม่ใช่เช็คชื่อเดียว — ตรงกับที่แก้ไว้ใน RLS-REAPPLY.sql */
    if r.relname in ('tmk_user_roles', 'tmk_staff', 'tmk_audit_logs') then
      continue;   -- ตารางสิทธิ์: policy ของมันอยู่ที่ Tier 2/3 ห้ามแตะจากที่นี่
    end if;
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = r.relname
    ) then
      execute format(
        'create policy tmk_authenticated_all on public.%I as permissive for all to authenticated using (true) with check (true)',
        r.relname
      );
    end if;
  end loop;
end $$;

-- ── §2 views tmk_* → security_invoker (เคารพ RLS ของตารางข้างใต้) ───────────
do $$
declare v record;
begin
  for v in
    select viewname from pg_views
    where schemaname = 'public' and viewname like 'tmk\_%' escape '\'
  loop
    execute format('alter view public.%I set (security_invoker = on)', v.viewname);
  end loop;
end $$;

-- ── §3a RPC สาธารณะ: ติดตามออเดอร์ (แทน anon select ตรงบน tmk_orders) ──────
--    คืนเฉพาะออเดอร์ที่ code ตรงเป๊ะ + เฉพาะคอลัมน์ที่หน้า track ใช้ (cast ทุกคอลัมน์กัน type mismatch)
create or replace function public.tmk_public_track(p_code text)
returns table (
  code text, customer_name text, items jsonb, total numeric, status text,
  tracking_no text, carrier text, status_log jsonb, created_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select o.code::text, o.customer_name::text, o.items::jsonb, o.total::numeric, o.status::text,
         o.tracking_no::text, o.carrier::text, o.status_log::jsonb, o.created_at::timestamptz
  from public.tmk_orders o
  where o.code = upper(trim(p_code))
  limit 1;
$$;
revoke all on function public.tmk_public_track(text) from public;
-- ⚠️ ถอน anon แล้วเมื่อ 8 ก.ย. 69 (20260908-public-share-hardening.sql) — หน้า PublicTrackPage ถูกลบไปแล้ว
-- ถ้าเปิดคอมเมนต์บรรทัดนี้ = คืนช่องให้คนนอกดึงชื่อลูกค้า/ยอด/เลขพัสดุตามรหัสที่เดาได้
-- grant execute on function public.tmk_public_track(text) to anon, authenticated;
grant execute on function public.tmk_public_track(text) to authenticated;

-- ── §3b RPC สาธารณะ: หน้าแชร์โครงการ (แทน anon select ตรง 7 ตาราง) ─────────
--    ต้องรู้ share_token ที่ share_enabled=true เท่านั้น · flow ตัด share_token ออกจากผลลัพธ์
create or replace function public.tmk_public_flow_bundle(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare f record;
begin
  select * into f from public.tmk_flows
  where share_token = p_token and share_enabled = true and deleted_at is null
  limit 1;
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object(
    'found', true,
    'flow', to_jsonb(f) - 'share_token',
    'tasks', coalesce((select jsonb_agg(to_jsonb(t)) from public.tmk_tasks t
                       where t.flow_id = f.id and t.deleted_at is null), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color))
                       from public.tmk_campaigns c where c.deleted_at is null), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'color', s.color, 'email', s.email))
                       from public.tmk_staff s where s.deleted_at is null), '[]'::jsonb),
    'duties', coalesce((select jsonb_agg(jsonb_build_object('name', d.name, 'color', d.color))
                       from public.tmk_duties d where d.deleted_at is null), '[]'::jsonb),
    'channels', coalesce((select jsonb_agg(jsonb_build_object('id', ch.id, 'name', ch.name, 'color', ch.color, 'logo_url', ch.logo_url))
                       from public.tmk_channels ch where ch.deleted_at is null), '[]'::jsonb),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'color', b.color, 'logo_url', b.logo_url))
                       from public.tmk_brands b where b.deleted_at is null), '[]'::jsonb)
  );
end $$;
revoke all on function public.tmk_public_flow_bundle(text) from public;
grant execute on function public.tmk_public_flow_bundle(text) to anon, authenticated;

commit;

-- ── VERIFY (รันอัตโนมัติเป็นผลลัพธ์สุดท้ายของไฟล์ — ทุกบรรทัดต้อง ✅) ─────────
select 'RLS ยังปิด (ต้อง = 0)' as check_item,
       count(*)::text as result,
       case when count(*) = 0 then '✅' else '❌ ' || string_agg(c.relname, ', ') end as status
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'tmk\_%' escape '\' and not c.relrowsecurity
union all
select 'ตารางที่มี policy tmk_authenticated_all', count(*)::text,
       case when count(*) > 0 then '✅' else '❌' end
from pg_policies where schemaname = 'public' and policyname = 'tmk_authenticated_all'
union all
select 'public RPCs (ต้อง = 2)', count(*)::text,
       case when count(*) = 2 then '✅' else '❌' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('tmk_public_track', 'tmk_public_flow_bundle') and p.prosecdef;

-- ── ROLLBACK (ถ้าต้องถอย — copy ไปรันแยก) ───────────────────────────────────
-- do $$
-- declare r record;
-- begin
--   for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--            where n.nspname='public' and c.relkind='r' and c.relname like 'tmk\_%' escape '\'
--   loop
--     execute format('drop policy if exists tmk_authenticated_all on public.%I', r.relname);
--     execute format('alter table public.%I disable row level security', r.relname);
--   end loop;
-- end $$;
-- drop function if exists public.tmk_public_track(text);
-- drop function if exists public.tmk_public_flow_bundle(text);
-- (FE ใหม่ทำงานได้ทั้งก่อน/หลัง rollback — fallback อ่านตรงกลับมาใช้ได้เมื่อ RLS ปิด)
