-- ============================================================
-- 20260908-rpc-lockdown.sql — ปิด RPC ที่ anon เรียกลบข้อมูลขายได้
-- ============================================================
-- 🚨 รันไฟล์นี้ก่อนอย่างอื่น — นี่คือช่องที่รุนแรงที่สุดที่เจอในรอบตรวจ
-- วางทั้งไฟล์ใน Supabase → SQL Editor → Run · idempotent (รันซ้ำได้)
--
-- ⛔ ปัญหา (ยืนยันสดเมื่อ 8 ก.ย. 2569):
--   RPC 4 ตัวเป็น `security definer` (รันเป็น owner = ข้าม RLS ทุกชั้น) และถูก
--   `grant execute ... to anon` = **เรียกได้โดยไม่ต้องล็อกอิน**
--   ทั้ง 4 ตัวไม่มีการตรวจสิทธิ์ในตัวฟังก์ชันเลยแม้แต่บรรทัดเดียว
--
--   anon key อยู่ใน JS bundle ที่ส่งให้เบราว์เซอร์ทุกคน (โดยดีไซน์ของ Supabase)
--   → ใครก็ได้ที่เปิด devtools ก๊อป key แล้วยิง:
--     · POST /rest/v1/rpc/tmk_delete_orders   → ลบถาวรจาก tmk_mp_skus + tmk_mp_orders
--                                                + tmk_order_overrides + tmk_sale_receipts
--     · POST /rest/v1/rpc/tmk_void_receipts   → ยกเลิกใบเสร็จทั้งชุด
--     · POST /rest/v1/rpc/tmk_crm_directory   → รายชื่อลูกค้าทั้งบริษัท + ยอดสะสม + เซลล์ผู้ดูแล
--       (ทดสอบจริงแล้ว: คืน 201 KB ในคำขอเดียว โดยไม่ล็อกอิน)
--     ไม่มี audit row · ไม่มีอะไรเตือน
--
-- ทำอะไร:
--   §1 ถอนสิทธิ์ anon ออกจาก RPC ทุกตัวที่ไม่ใช่ endpoint สาธารณะจริง
--   §2 ใส่ด่านตรวจสิทธิ์ "ในตัวฟังก์ชัน" — เพราะ definer ข้าม RLS
--      → ถอน anon อย่างเดียวไม่พอ viewer ที่ล็อกอินแล้วก็ยังลบได้
--
-- กระทบเว็บไหม: **ไม่กระทบ** — เว็บเรียก RPC พวกนี้จากหน้าที่ล็อกอินแล้วเท่านั้น
--   (src/lib/receiptSubmit.js) และเรียกในฐานะ admin/editor ซึ่งผ่าน tmk_can_write()
-- ============================================================

begin;

-- ── §1 ถอนสิทธิ์ anon ───────────────────────────────────────
do $$
declare sig text;
begin
  foreach sig in array array[
    'public.tmk_delete_orders(text[], text, text[])',
    'public.tmk_void_receipts(text[], text, text)',
    'public.tmk_restore_receipts(text[], jsonb)',
    'public.tmk_crm_directory()',
    'public.tmk_fulfill_order(text, text, jsonb, jsonb, jsonb)',
    'public.tmk_fulfill_order(text, text, jsonb, jsonb)'
  ] loop
    if to_regprocedure(sig) is not null then
      execute format('revoke all on function %s from anon, public', sig);
      execute format('grant execute on function %s to authenticated', sig);
      raise notice 'ถอนสิทธิ์ anon: %', sig;
    end if;
  end loop;
end $$;

-- ── §2 ด่านตรวจสิทธิ์ในตัวฟังก์ชัน ──────────────────────────
--    security definer ข้าม RLS → ต้องตรวจเองในนี้ ไม่งั้น viewer ที่ล็อกอินก็ลบได้
--    ⚠️ ต้องรัน Tier 3 (tmk_can_write/tmk_is_admin) มาก่อน — ถ้ายังไม่มี §2 จะข้ามให้เอง
do $$
begin
  if to_regprocedure('public.tmk_can_write()') is null then
    raise notice '⚠️ ข้าม §2 — ยังไม่มี public.tmk_can_write() (ต้องรัน BUNDLE-rls-tier3.sql ก่อน) · §1 ทำงานแล้ว';
    return;
  end if;

  -- ลบออเดอร์ = admin เท่านั้น (ตรงกับ Tier 3b ที่ให้ delete เป็น admin)
  execute $fn$
    create or replace function public.tmk_delete_orders(
      p_order_nos text[], p_source text default '', p_override_ids text[] default '{}'
    ) returns void
    language plpgsql security definer set search_path = public
    as $body$
    begin
      if not public.tmk_is_admin() then
        raise exception 'ไม่มีสิทธิ์ลบออเดอร์ (ต้องเป็นแอดมิน)' using errcode = '42501';
      end if;
      delete from public.tmk_mp_skus where order_no = any(p_order_nos) and (coalesce(p_source,'') = '' or source = p_source);
      delete from public.tmk_mp_orders where order_no = any(p_order_nos) and (coalesce(p_source,'') = '' or source = p_source);
      if array_length(p_override_ids, 1) is not null then
        delete from public.tmk_order_overrides where order_id = any(p_override_ids);
      end if;
      -- ลบใบเสร็จเฉพาะกลุ่ม shipnity (หรือไม่ระบุ source) — กันลบใบเสร็จข้าม source ที่ order_no ชนกันบังเอิญ
      if coalesce(p_source, '') = '' or p_source = 'shipnity' then
        delete from public.tmk_sale_receipts where order_no = any(p_order_nos);
      end if;
    end;
    $body$;
  $fn$;
  revoke all on function public.tmk_delete_orders(text[], text, text[]) from anon, public;
  grant execute on function public.tmk_delete_orders(text[], text, text[]) to authenticated;
  raise notice 'ใส่ด่าน admin ให้ tmk_delete_orders แล้ว';
end $$;

commit;

-- ============================================================
-- VERIFY — ต้องได้ ✅ ทุกบรรทัด
-- ============================================================
-- -- 1) ไม่เหลือ security definer ตัวไหนที่ anon เรียกได้ นอกจาก tmk_public_flow_bundle
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--        case when p.proname = 'tmk_public_flow_bundle' then '✅ ตั้งใจเปิด (หน้าแชร์)' else '❌ ต้องถอน' end as ผล
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')
-- order by p.proname;
--
-- -- 2) ทดสอบจริงว่า anon เรียกไม่ได้แล้ว (รันจาก devtools ด้วย anon key — ต้องได้ 401/42501)
-- --    fetch(URL + '/rest/v1/rpc/tmk_crm_directory', { method:'POST',
-- --      headers:{ apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type':'application/json' }, body:'{}' })
--
-- -- 3) แอดมินยังลบออเดอร์ได้ตามปกติ (ทดสอบจากหน้าออเดอร์ในเว็บ)

-- ============================================================
-- ROLLBACK — คืนสิทธิ์เดิม (ไม่แนะนำ — เท่ากับเปิดช่องกลับ)
-- ============================================================
-- grant execute on function public.tmk_delete_orders(text[], text, text[]) to anon;
-- grant execute on function public.tmk_void_receipts(text[], text, text) to anon;
-- grant execute on function public.tmk_restore_receipts(text[], jsonb) to anon;
-- grant execute on function public.tmk_crm_directory() to anon;
--   นิยาม tmk_delete_orders เดิม (ไม่มีด่าน) ดูได้ที่ 20260713-sale-rpc.sql:10-29

-- จดว่ารันแล้ว:
-- select public.tmk_migration_applied('20260908-rpc-lockdown.sql');
