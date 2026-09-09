-- ============================================================
-- 20260908-public-share-hardening.sql — อุดข้อมูลรั่วผ่านลิงก์แชร์โครงการ
-- ============================================================
-- วางทั้งไฟล์ใน Supabase → SQL Editor → Run · idempotent (รันซ้ำได้)
--
-- ⛔ ปัญหาที่แก้ (ตรวจพบ 8 ก.ย. 2569):
--
-- §1 `tmk_public_flow_bundle` เป็น security definer + grant execute to **anon**
--    (= ไม่ต้องล็อกอิน ขอแค่รู้ share_token) แต่คืน **อีเมลของพนักงานทุกคนในบริษัท**:
--        'staff', jsonb_agg(jsonb_build_object('name', s.name, 'color', s.color, 'email', s.email))
--    หน้าแชร์ (src/flowPublicShare.jsx → PlannerView readOnly) ใช้ staff แค่ "ชื่อ → สี"
--    เท่านั้น (flowCard.jsx:63 · views-flows.jsx:226 · components.jsx:368)
--    ส่วน s.email ถูกใช้เฉพาะหน้าที่ต้องล็อกอิน (views-mytasks / userContext / settings-people)
--    → ส่งอีเมลออกไปโดยไม่มีใครใช้ = รั่วเปล่า ๆ
--    ยิ่งอันตรายเพราะ share_token เดิมสร้างจาก Math.random() (เดาได้ · แก้ที่ flowShareDialog.jsx แล้ว)
--
-- §2 `tmk_public_track` ยัง grant to anon อยู่ ทั้งที่หน้า src/PublicTrackPage.jsx **ถูกลบไปแล้ว**
--    (grep ทั้งรีโปไม่มีใครเรียก) — endpoint ตายแต่ยังเปิด คืนชื่อลูกค้า/ยอด/เลขพัสดุ
--    ตามรหัสออเดอร์ที่เดาได้ ไม่มี rate limit → พื้นที่โจมตีฟรี ๆ ที่ไม่มีใครได้ประโยชน์
--
-- ⚠️ สิ่งที่ไฟล์นี้ **ไม่** แตะ (ตั้งใจ — ต้องให้ผู้ใช้ตัดสินเอง):
--    bundle ยังส่ง campaigns / duties / channels / brands **ทั้งบริษัท** (ไม่ผูกกับโครงการที่แชร์)
--    และ tasks ส่ง to_jsonb(t) = ทุกคอลัมน์ (รวมโน้ตภายใน) ซึ่งเป็นเนื้อหาที่ตั้งใจแชร์อยู่แล้ว
--    ถ้าจะจำกัดเพิ่ม ต้องรู้ก่อนว่าหน้าแชร์ต้องใช้อะไรบ้าง — แยกทำทีหลัง
-- ============================================================

begin;

-- ── §1 ตัด email ออกจาก bundle สาธารณะ ──────────────────────
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
    -- ⚠️ ห้ามใส่ s.email กลับมาเด็ดขาด — ผู้เรียกคือ anon (ไม่ต้องล็อกอิน)
    --    หน้าแชร์ใช้แค่ ชื่อ→สี · อีเมลไม่มีใครใช้ฝั่ง public
    'staff', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'color', s.color))
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

-- ── §2 ปิด endpoint ติดตามพัสดุที่เลิกใช้แล้ว ────────────────
--    ไม่ drop function ทิ้ง (เผื่ออยากกลับมาใช้) แค่ถอนสิทธิ์ anon
--    ถ้าจะเปิดใหม่: grant execute on function public.tmk_public_track(text) to anon;
do $$
begin
  if to_regprocedure('public.tmk_public_track(text)') is not null then
    revoke all on function public.tmk_public_track(text) from public, anon;
    raise notice 'ถอนสิทธิ์ anon จาก tmk_public_track แล้ว (หน้า PublicTrackPage ถูกลบไปแล้ว)';
  else
    raise notice 'ข้าม §2 — ไม่มีฟังก์ชัน tmk_public_track';
  end if;
end $$;

commit;

-- ============================================================
-- VERIFY — ต้องได้ ✅ ทุกบรรทัด
-- ============================================================
-- -- 1) bundle ต้องไม่มีคำว่า email ในนิยามฟังก์ชันแล้ว
-- select case when position('email' in pg_get_functiondef(p.oid)) = 0
--             then '✅ ไม่มี email ใน bundle แล้ว' else '❌ ยังส่ง email อยู่' end
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'tmk_public_flow_bundle';
--
-- -- 2) anon ต้องเรียก tmk_public_track ไม่ได้แล้ว
-- select case when not has_function_privilege('anon', 'public.tmk_public_track(text)', 'EXECUTE')
--             then '✅ ปิด tmk_public_track สำหรับ anon แล้ว' else '❌ ยังเปิดอยู่' end;
--
-- -- 3) anon ยังเรียก bundle ได้ตามปกติ (หน้าแชร์ต้องใช้งานได้)
-- select case when has_function_privilege('anon', 'public.tmk_public_flow_bundle(text)', 'EXECUTE')
--             then '✅ หน้าแชร์ยังใช้ได้' else '❌ หน้าแชร์พัง' end;
--
-- -- 4) ลองเรียกจริงด้วย token ที่มีอยู่ (ควรได้ staff ที่ไม่มี email)
-- -- select jsonb_pretty(public.tmk_public_flow_bundle('<share_token ของคุณ>') -> 'staff');

-- ============================================================
-- ROLLBACK — กลับไปเวอร์ชันที่ส่ง email (ไม่แนะนำ)
--   ดูนิยามเดิมได้ที่ supabase/migrations/20260716-enable-rls-tier1.sql §3b
--   และคืนสิทธิ์ track: grant execute on function public.tmk_public_track(text) to anon;
-- ============================================================

-- จดว่ารันแล้ว:
-- select public.tmk_migration_applied('20260908-public-share-hardening.sql');
