/* ============================================================
   crmContacts.js — บันทึก "การติดต่อรายลูกค้า" ของทีม CRM (PART 110)
   ============================================================
   เดิมระบบรู้แค่ "วันนี้โทรกี่สาย" (ตัวเลขรวมในบันทึกประจำวัน) → ไม่รู้ว่าโทรหาใคร
   ไฟล์นี้ = ตรรกะกลาง (pure + IO บาง) ของตาราง tmk_crm_contacts

   - ส่วน pure (มีเทส): contactStats · lastContactMap · snoozeMap · isDue · dueRows · nextSnoozeISO
   - ส่วน IO: fetchContacts / saveContact — graceful ถ้ายังไม่ได้รัน migration (คืน [] / บอกให้รัน)
   ============================================================ */
import { supabase } from './supabaseClient.js';
import { needsMigration } from './pgError.js';

/** ประเภทการติดต่อ — ตรงกับกลุ่มในบันทึกประจำวัน (0DAY/5DAY/Repurchase) */
export const CONTACT_KINDS = [
  { id: '0day', label: '0DAY', hint: 'ลูกค้าเพิ่งสั่งวันนี้' },
  { id: '5day', label: '5DAY', hint: 'ตามหลังสั่ง ~5 วัน' },
  { id: 'repurchase', label: 'ชวนซื้อซ้ำ', hint: 'ลูกค้าเก่า/เสี่ยงหลุด' },
  { id: 'other', label: 'อื่นๆ', hint: '' },
];
/** ผลการติดต่อ */
export const CONTACT_RESULTS = [
  { id: 'answered', label: 'รับสาย', tone: 'var(--good)' },
  { id: 'closed', label: 'ปิดการขายได้', tone: 'var(--accent)' },
  { id: 'no_answer', label: 'ไม่รับสาย', tone: 'var(--warn)' },
  { id: 'snooze', label: 'เลื่อนไปก่อน', tone: 'var(--ink-3)' },
];
const KIND_IDS = CONTACT_KINDS.map(k => k.id);
const num = (v) => Number(v) || 0;
const iso = (v) => String(v || '').slice(0, 10);

/** เลื่อนไปอีก n วันจากวันที่ให้มา → 'YYYY-MM-DD' */
export function nextSnoozeISO(fromISO, days) {
  const d = new Date(`${iso(fromISO)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + (Number(days) || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * สรุปจำนวนสายต่อกลุ่ม (ไว้เติมบันทึกประจำวันอัตโนมัติ — เลิกกรอกมือ)
 * นับ 1 แถว = 1 สาย · "รับสาย" = result answered หรือ closed (ปิดได้ก็ต้องรับสายก่อน)
 * @returns { d0:{total,answered}, d5:{...}, rep:{...}, total, answered, closed }
 */
export function contactStats(rows) {
  const mk = () => ({ total: 0, answered: 0 });
  // total = ทุกครั้งที่ติดต่อ (รวม kind 'other' จากป็อปอัพลูกค้า)
  // grouped = เฉพาะที่เข้ากลุ่ม 0day/5day/ซื้อซ้ำ = ตัวที่เอาไปเติมในบันทึกประจำวันได้
  const out = { d0: mk(), d5: mk(), rep: mk(), total: 0, grouped: 0, answered: 0, closed: 0, other: 0 };
  const bucket = { '0day': 'd0', '5day': 'd5', repurchase: 'rep' };
  (rows || []).forEach(r => {
    if (r?.result === 'snooze') return;              // เลื่อนนัด ไม่นับเป็นสายที่โทร
    const b = bucket[r?.kind];
    const answered = r?.result === 'answered' || r?.result === 'closed';
    out.total += 1;
    if (answered) out.answered += 1;
    if (r?.result === 'closed') out.closed += 1;
    if (!b) { out.other += 1; return; }               // kind 'other' → นับใน total/other แต่ไม่เข้ากลุ่ม
    out.grouped += 1;
    out[b].total += 1;
    if (answered) out[b].answered += 1;
  });
  return out;
}

/** { customer_key: 'YYYY-MM-DD' } วันที่ติดต่อล่าสุดของแต่ละคน */
export function lastContactMap(rows) {
  const m = {};
  (rows || []).forEach(r => {
    const k = r?.customer_key; const d = iso(r?.date);
    if (!k || !d) return;
    if (!m[k] || d > m[k]) m[k] = d;
  });
  return m;
}

/** { customer_key: 'YYYY-MM-DD' } วันที่เลื่อนนัดไกลสุดของแต่ละคน */
export function snoozeMap(rows) {
  const m = {};
  (rows || []).forEach(r => {
    const k = r?.customer_key; const s = iso(r?.snooze_until);
    if (!k || !s) return;
    if (!m[k] || s > m[k]) m[k] = s;
  });
  return m;
}

/**
 * ลูกค้ารายนี้ "ยังต้องติดต่อวันนี้" ไหม
 * - ติดต่อไปแล้ววันนี้ → ไม่ต้อง
 * - ถูกเลื่อนนัดถึงวันที่ยังไม่ถึง → ไม่ต้อง (snooze_until > วันนี้)
 */
export function isDue(key, { last = {}, snooze = {}, today }) {
  if (!key) return true;
  if (last[key] === today) return false;
  const s = snooze[key];
  if (s && s > today) return false;
  return true;
}

/** กรองรายชื่อ "ควรติดต่อ" ให้เหลือเฉพาะที่ยังไม่ได้ทำ (ใช้ key จาก r.key || r.code) */
export function dueRows(rows, contacts, today) {
  const last = lastContactMap(contacts), snooze = snoozeMap(contacts);
  return (rows || []).filter(r => isDue(r?.key || r?.code, { last, snooze, today }));
}

/** ป้ายสถานะของลูกค้า 1 คน (ใช้โชว์บนการ์ด) — null = ยังไม่ได้ทำอะไร */
export function contactBadge(key, contacts, today) {
  const last = lastContactMap(contacts)[key];
  const sn = snoozeMap(contacts)[key];
  if (last === today) return { kind: 'done', text: 'ติดต่อแล้ววันนี้', tone: 'var(--good)' };
  if (sn && sn > today) return { kind: 'snooze', text: `เลื่อนถึง ${sn.slice(8, 10)}/${sn.slice(5, 7)}`, tone: 'var(--ink-3)' };
  if (last) return { kind: 'past', text: `ติดต่อล่าสุด ${last.slice(8, 10)}/${last.slice(5, 7)}`, tone: 'var(--ink-4)' };
  return null;
}

/**
 * แปลง "รอบติดตาม" (cadence) ของโปรไฟล์ → จำนวนวัน (0 = ไม่ได้ตั้ง)
 * รองรับที่คนกรอกจริง: '30' · '30 วัน' · '30D' · 'ทุก 30 วัน' · '1 เดือน' · '2 เดือน'
 */
export function cadenceDays(cadence) {
  const t = String(cadence || '').trim();
  if (!t) return 0;
  const mo = t.match(/(\d+)\s*(เดือน|month)/i);
  if (mo) return Math.max(0, Number(mo[1]) * 30);
  const d = t.match(/(\d+)/);
  return d ? Math.max(0, Number(d[1])) : 0;
}

/** ถึงรอบติดตามหรือยัง — เงียบมานานกว่ารอบที่ตั้งไว้ (ต้องมี cadence + รู้ว่าเงียบมากี่วัน) */
export function isCadenceDue(row, { last = {}, snooze = {}, today } = {}) {
  const days = cadenceDays(row?.cadence);
  if (!days) return false;
  const rec = Number(row?.recency);
  if (!Number.isFinite(rec) || rec < days) return false;
  return isDue(row?.key || row?.code, { last, snooze, today });
}

/* ---------------- IO (graceful ถ้ายังไม่ได้รัน migration) ---------------- */
export const CONTACTS_MIGRATION = '20260824-crm-contacts.sql';

/** ดึงการติดต่อในช่วง (รวมแถวที่ snooze เลยช่วงไปแล้ว เพื่อให้รู้ว่าใครถูกเลื่อน) */
export async function fetchContacts(fromISO, toISO) {
  try {
    let q = supabase.from('tmk_crm_contacts').select('id,customer_key,customer_name,salesperson,date,kind,result,snooze_until,note');
    if (fromISO) q = q.gte('date', fromISO);
    if (toISO) q = q.lte('date', toISO);
    const { data, error } = await q;
    if (error) return { rows: [], missing: needsMigration(error), error };
    return { rows: data || [], missing: false };
  } catch (e) { return { rows: [], missing: false, error: e }; }
}

/** ประวัติการติดต่อของลูกค้า 1 คน (ใหม่→เก่า) */
export async function fetchCustomerContacts(customerKey, limit = 20) {
  if (!customerKey) return { rows: [], missing: false };
  try {
    const { data, error } = await supabase.from('tmk_crm_contacts')
      .select('id,customer_key,salesperson,date,kind,result,snooze_until,note')
      .eq('customer_key', customerKey).order('date', { ascending: false }).limit(limit);
    if (error) return { rows: [], missing: needsMigration(error), error };
    return { rows: data || [], missing: false };
  } catch (e) { return { rows: [], missing: false, error: e }; }
}

/** บันทึก 1 ครั้งที่ติดต่อ — id สร้างจาก วัน+คีย์+เวลา (กันชนเมื่อโทรคนเดิมหลายรอบ/วัน) */
export async function saveContact({ customerKey, customerName = '', salesperson = '', dateISO, kind = 'other', result = 'answered', snoozeUntil = null, note = '', by = '' }) {
  if (!customerKey || !dateISO) return { error: new Error('ข้อมูลไม่ครบ') };
  const row = {
    id: `${dateISO}::${customerKey}::${Date.now()}`,
    customer_key: customerKey, customer_name: customerName, salesperson,
    date: dateISO, kind: KIND_IDS.includes(kind) ? kind : 'other', result,
    snooze_until: snoozeUntil || null, note: String(note || ''), created_by: by,
  };
  const { error } = await supabase.from('tmk_crm_contacts').insert(row);
  if (error) return { error, missing: needsMigration(error), row };
  return { row };
}

/** ลบการติดต่อ (กดผิด) */
export async function deleteContact(id) {
  const { error } = await supabase.from('tmk_crm_contacts').delete().eq('id', id);
  return { error };
}

/** รวมจำนวนสายจาก contacts → รูปแบบ calls ของบันทึกประจำวัน (เติมให้อัตโนมัติ) */
export function callsFromContacts(rows) {
  const s = contactStats(rows);
  return { d0: { total: s.d0.total, answered: s.d0.answered }, d5: { total: s.d5.total, answered: s.d5.answered }, rep: { total: s.rep.total, answered: s.rep.answered } };
}

/** ยอด/จำนวนที่ปิดการขายได้จากการโทร (ไว้โชว์คู่กับ %ปิด) */
export const closedCount = (rows) => (rows || []).filter(r => r?.result === 'closed').length;
export const answerRate = (rows) => { const s = contactStats(rows); return s.total ? Math.round(s.answered / s.total * 100) : null; };
export const callsTotal = (rows) => contactStats(rows).total;
export const _num = num;
