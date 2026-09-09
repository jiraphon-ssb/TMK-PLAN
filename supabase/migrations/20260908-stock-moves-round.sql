-- ============================================================
-- 20260908-stock-moves-round.sql — คีย์ "งวด" ให้สมุดเคลื่อนไหวสต็อก
-- ============================================================
-- วางทั้งไฟล์ใน Supabase → SQL Editor → Run · idempotent (รันซ้ำได้)
-- ⚠️ ต้องรัน 20260902-stock-moves.sql มาก่อน (ไฟล์นี้ข้ามให้เองถ้ายังไม่มีตาราง)
--
-- ⛔ บั๊กที่แก้ (ของที่เพิ่งทำพลาดไปเมื่อ 7 ก.ย. 69):
--   "ยกเลิกรอบ" เขียนแถว kind='void' ที่ ref_id = ref_id ของรอบนั้น
--   แต่ **การรับเข้าทุกงวดของใบสั่งผลิตใบเดียวกันใช้ ref_id เท่ากันหมด** (= po.id)
--   → ยกเลิก 1 งวด = ใบนั้นรับของเข้าระบบไม่ได้อีกตลอดกาล และ toast ยังบอกว่าสำเร็จ
--   พิสูจน์: ตั้งต้น 10 → รับ 5 → ยกเลิก → รับใหม่ 3 → คงเหลือค้างที่ 10 (ควรเป็น 13)
--   พ่วง: ประวัติ group ด้วย ref_id ทำให้ PO ที่รับ 2 งวดยุบเป็นแถวเดียว (qty รวม · วันที่ของงวดแรก)
--
-- ทำอะไร:
--   เพิ่มคอลัมน์ round_id = 'refType::refId::seq' → หน่วยที่เล็กที่สุดที่ยกเลิกได้
--   backfill จาก id เดิม (moveId ขึ้นต้นด้วย refType::refId::seq เสมอ) → ข้อมูลเก่าไม่ต้องแก้มือ
--
-- ปลอดภัยกับของเดิม: ฝั่งเว็บมี fallback `roundOf()` ที่ถอดคีย์งวดจาก id อยู่แล้ว
--   → deploy เว็บก่อนรันไฟล์นี้ได้ ตัวเลขไม่เปลี่ยน
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.tmk_stock_moves') is null then
    raise notice 'ข้าม — ยังไม่มีตาราง tmk_stock_moves (รัน 20260902-stock-moves.sql ก่อน)';
    return;
  end if;

  alter table public.tmk_stock_moves add column if not exists round_id text not null default '';

  /* backfill: id = 'refType::refId::seq::skuKey::movedOn' → 3 ส่วนแรกคือคีย์งวด
     แถว legacy (id = 'legacy::<uuid>') ไม่มีส่วนที่ 3 → ประกอบจาก ref_type/ref_id แทน
     ⚠️ update ได้เพราะ migration รันในฐานะ owner — grant ที่ revoke ไว้คุมแค่ anon/authenticated */
  update public.tmk_stock_moves
  set round_id = case
        when split_part(id, '::', 3) <> '' and id like '%::%::%::%'
          then split_part(id, '::', 1) || '::' || split_part(id, '::', 2) || '::' || split_part(id, '::', 3)
        else coalesce(ref_type, 'count') || '::' || coalesce(ref_id, '') || '::0'
      end
  where round_id = '';

  create index if not exists idx_stock_moves_round on public.tmk_stock_moves(round_id);

  raise notice 'เพิ่ม round_id + backfill เรียบร้อย';
end $$;

commit;

-- ============================================================
-- VERIFY — ต้องได้ ✅ ทุกบรรทัด
-- ============================================================
-- select
--   case when exists (select 1 from information_schema.columns
--        where table_schema='public' and table_name='tmk_stock_moves' and column_name='round_id')
--        then '✅ มีคอลัมน์ round_id' else '❌ ไม่มี' end as คอลัมน์,
--   case when not exists (select 1 from public.tmk_stock_moves where round_id = '')
--        then '✅ backfill ครบทุกแถว' else '❌ ยังมีแถวว่าง' end as backfill;
--
-- -- ดูว่าแต่ละงวดแยกกันถูกต้อง (PO ที่รับหลายงวดต้องได้หลาย round_id)
-- select round_id, kind, min(moved_on) as วันที่, count(*) as แถว, sum(qty) as จำนวน
-- from public.tmk_stock_moves where kind <> 'void'
-- group by round_id, kind order by min(created_at) desc limit 20;
--
-- -- แถว void ที่เขียนไว้ก่อนไฟล์นี้ (ถ้ามี) ชี้ ref_id แบบเก่า → ต้องแปลงเป็นคีย์งวด
-- -- ตรวจก่อนว่ามีไหม:
-- select id, ref_id, note, created_at from public.tmk_stock_moves where kind = 'void';
-- -- ถ้ามีและเป็น po ให้เขียนแถว void ใหม่ผ่านหน้าเว็บอีกครั้ง (ของเก่าจะไม่มีผลแล้ว)

-- ============================================================
-- ROLLBACK
-- ============================================================
-- drop index if exists idx_stock_moves_round;
-- alter table public.tmk_stock_moves drop column if exists round_id;

-- จดว่ารันแล้ว:
-- select public.tmk_migration_applied('20260908-stock-moves-round.sql');
