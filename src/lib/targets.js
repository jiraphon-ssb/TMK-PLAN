/* ============================================================
   TMK Operation — เป้าขาย + คอมมิชชั่นต่อเซลล์ (PART 12 / T3)
   ============================================================
   - graceful: ตาราง tmk_targets ยังไม่ migrate → คืน [] / เงียบ (ไม่ทำแอปพัง)
   - key = "<salesperson>::<YYYY-MM>" (salesperson = ชื่อหลัง alias ให้ตรง bySalesperson.key)
   ============================================================ */
import { supabase } from './supabaseClient.js';
import { logAudit } from './audit.js';

export const targetId = (salesperson, month) => `${salesperson}::${month}`;

/** ดึงเป้าของเดือนหนึ่ง แบบ "บอกได้ว่าพลาดหรือเปล่า" → { rows, error }
    จำเป็นเพราะ "ไม่มีเป้า" กับ "อ่านเป้าไม่ได้" ต้องปฏิบัติต่างกัน:
    หน้าแรกเตือน "ยังไม่ได้ตั้งเป้าเดือนนี้" — ถ้าอ่านพลาดแล้วเราทำเป็นว่าไม่มี จะเตือนผิด
    และแอดมินอาจไปกดคัดลอกเป้าทับของจริงที่มีอยู่แล้ว */
export async function fetchTargetsResult(month) {
  if (!month) return { rows: [], error: null };
  try {
    const { data, error } = await supabase
      .from('tmk_targets')
      .select('id,salesperson,month,sales_target,commission_rate,tiers,note')
      .eq('month', month);
    if (error) return { rows: [], error };
    return { rows: data || [], error: null };
  } catch (e) { return { rows: [], error: e }; }
}

/** ดึงเป้าทั้งหมดของเดือนหนึ่ง → [] ถ้าตารางยังไม่มี/error (ผู้เรียกที่ไม่สนสาเหตุ) */
export async function fetchTargets(month) {
  return (await fetchTargetsResult(month)).rows;
}

/** upsert เป้า 1 แถว — โยน error กลับให้ caller โชว์ toast (ตรวจ relation-missing เองที่ caller) */
/* หมายเหตุสิทธิ์ (PART 119): เป้า/เรตคอม = แอดมินเท่านั้น — UI ปิดหน้าให้แล้ว
   และ migration 20260824-rls-tier3b-narrow.sql ล็อกที่ฐานข้อมูลอีกชั้น (write = admin) */
/**
 * แถวที่จะเขียนลง tmk_targets — แยกออกมาเพื่อเทสได้ (pure)
 * ⚠️ ใส่เฉพาะฟิลด์ที่ผู้เรียก "ส่งมาจริง" เท่านั้น
 *    เดิมมี default `tiers = null, note = ''` แล้วเขียนทุกครั้ง → ผู้เรียกที่ส่งแค่เป้ายอด
 *    ล้างขั้นบันไดค่าคอม (tiers) และโน้ตของเดิมทิ้งเงียบ ๆ ทุกครั้งที่เซฟ
 *    ซึ่ง commissionFor() อ่าน tiers อยู่จริง → คอมตกไปใช้ flat rate (ถ้าเป็น 0 = ฿0 ทั้งกระดาน)
 *    upsert แบบไม่ใส่คีย์ = คอลัมน์นั้นในแถวเดิมไม่ถูกแตะ
 *    ถ้าอยากล้างจริง ๆ ให้ส่ง tiers: null / note: '' มาตรง ๆ
 */
export function buildTargetRow(input) {
  const { salesperson, month, sales_target = 0, commission_rate = 0 } = input || {};
  const row = {
    id: targetId(salesperson, month),
    salesperson, month,
    sales_target: Number(sales_target) || 0,
    commission_rate: Number(commission_rate) || 0,
    updated_at: new Date().toISOString(),
  };
  if ('tiers' in (input || {})) row.tiers = input.tiers || null;
  if ('note' in (input || {})) row.note = input.note || '';
  return row;
}

export async function saveTarget(input) {
  return supabase.from('tmk_targets').upsert(buildTargetRow(input), { onConflict: 'id' });
}

/** ลบเป้า (ตั้งค่ากลับเป็น 0 = ลบแถว) */
export async function deleteTarget(salesperson, month) {
  const res = await supabase.from('tmk_targets').delete().eq('id', targetId(salesperson, month));
  if (!res.error) logAudit({ action: 'delete', entityType: 'target', entityName: salesperson, severity: 'warn', summary: `ลบเป้า/คอม ${salesperson} เดือน ${month}` });
  return res;
}

/**
 * คำนวณคอมมิชชั่น (บาท) จากยอดขาย + config เป้า
 * - tiers (ขั้นบันได) ถ้ามี: หา rate ของขั้นสูงสุดที่ sales ถึง (min ≤ sales)
 * - ไม่งั้น flat: sales * commission_rate/100
 */
export function commissionFor(sales, target) {
  const s = Number(sales) || 0;
  if (!target) return 0;
  if (Array.isArray(target.tiers) && target.tiers.length) {
    const sorted = [...target.tiers].filter(t => t && t.rate != null).sort((a, b) => (b.min || 0) - (a.min || 0));
    const hit = sorted.find(t => s >= (Number(t.min) || 0));
    return hit ? s * (Number(hit.rate) || 0) / 100 : 0;
  }
  return s * (Number(target.commission_rate) || 0) / 100;
}

/**
 * ตัดสินใจการ "แสดงคอม/เป้า" ต่อเซลล์ 1 คน (แยก decision จาก JSX ให้ test ได้)
 * row = { target (sales_target บาท), comm (คอมบาท), tgt (object เป้า มี commission_rate/tiers) }
 * → mode 'target'   = มีเป้ายอด → โชว์แถบเป้า+%+คอม
 *   mode 'commOnly' = ไม่มีเป้ายอด แต่ตั้ง %คอม → โชว์คอมล้วน + rateLabel
 *   mode 'none'     = ไม่มีทั้งคู่ → ปุ่มตั้งค่า
 */
export function commissionDisplay(row) {
  const target = Number(row?.target) || 0;
  const comm = Number(row?.comm) || 0;
  if (target > 0) return { mode: 'target', comm };
  if (comm > 0) {
    const t = row?.tgt;
    const tier = !!(t && Array.isArray(t.tiers) && t.tiers.length);
    return { mode: 'commOnly', comm, rateLabel: tier ? 'ขั้นบันได' : `เรต ${Number(t?.commission_rate) || 0}%` };
  }
  return { mode: 'none' };
}

/** map salesperson → target object สำหรับ lookup เร็วใน leaderboard */
export function targetsByPerson(rows) {
  const m = new Map();
  for (const r of (rows || [])) m.set(r.salesperson, r);
  return m;
}
