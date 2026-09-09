/* ============================================================
   teamPresence — ใครออนไลน์ (pure · การ์ด "ทีมวันนี้" หน้าหลัก)
   ============================================================
   ⛔ บั๊กที่แก้ (9 ก.ย. 69): การ์ดโชว์ "0 ออนไลน์" ทั้งที่กำลังใช้งานอยู่
   เพราะรายชื่อ map มาจาก tmk_user_roles อย่างเดียว → คนที่มี heartbeat
   แต่ยังไม่มีแถว role (หรือ roles อ่านพลาดจนเป็น []) หายทั้งคน
   ============================================================ */
/* หน้าต่าง "ออนไลน์" — heartbeat เขียนทุก 45 วิ **เฉพาะตอนแท็บโฟกัสอยู่**
   (App.jsx: `if (document.visibilityState !== 'visible') return`) เพื่อประหยัด egress
   → 2.5 นาทีเดิมแคบเกินไป: แค่สลับไปแท็บอื่นสองสามนาที ทุกคนก็ตกเป็นออฟไลน์
   วัดกับข้อมูลจริง 9 ก.ย.: ทั้งทีมเปิดเว็บอยู่ แต่การ์ดขึ้น "0 ออนไลน์" (6/7/10 นาที)
   6 นาที = ยังหมายถึง "เปิดค้างอยู่" จริง โดยไม่ต้องเพิ่มจำนวนครั้งที่เขียน */
export const ONLINE_MS = 360000;   // 6 นาที

const lc = (v) => String(v || '').toLowerCase();

/** รวมทีมจาก roles + คนที่มี heartbeat แต่ยังไม่มี role → คนที่เปิดเว็บอยู่ต้องถูกนับเสมอ
 *  @param {Array} roles แถวจาก tmk_user_roles · @param {Array} presence แถวจาก tmk_presence
 *  @param {number} now epoch ms · @returns {Array} สมาชิกพร้อม {online, activeToday, page, last}
 */
export function teamMembers(roles, presence, now, todayStr, selfEmail = '') {
  const self_ = lc(selfEmail);
  const pmap = {};
  (presence || []).forEach(p => { if (p?.email) pmap[lc(p.email)] = p; });
  const roleEmails = new Set((roles || []).map(r => lc(r?.email)).filter(Boolean));
  const extras = (presence || [])
    .filter(p => p?.email && !roleEmails.has(lc(p.email)))
    .map(p => ({ email: p.email, name: p.name || p.email, department: '', color: '', noRole: true }));

  const known = new Set([...roleEmails, ...extras.map(e => lc(e.email))]);
  const selfRow = self_ && !known.has(self_) ? [{ email: selfEmail, name: selfEmail, department: '', color: '', noRole: true }] : [];
  return [...(roles || []), ...extras, ...selfRow].map(r => {
    const p = pmap[lc(r?.email)];
    const last = p?.last_seen_at ? new Date(p.last_seen_at).getTime() : 0;
    // เทียบวันแบบเวลาท้องถิ่น (ไม่ใช่ UTC) — กัน heartbeat ก่อน 07:00 ไทยถูกนับเป็นเมื่อวาน
    const ld = last ? new Date(last) : null;
    const activeToday = !!ld && `${ld.getFullYear()}-${String(ld.getMonth() + 1).padStart(2, '0')}-${String(ld.getDate()).padStart(2, '0')}` === todayStr;
    /* ตัวเองต้องออนไลน์เสมอ — เรากำลังวาดหน้าจอให้เขาอยู่ ไม่ต้องรอ heartbeat ยืนยัน
       (เดิมถ้า upsert พลาดเงียบ ๆ หรือเพิ่งเปิดหน้ายังไม่ทัน beat → เห็นตัวเองเป็นออฟไลน์) */
    const isSelf = !!self_ && lc(r?.email) === self_;
    return { ...r, online: isSelf || (!!last && (now - last) < ONLINE_MS), activeToday: activeToday || isSelf, page: p?.page || '', last, isSelf };
  }).sort((a, b) => (b.isSelf - a.isSelf) || (b.online - a.online) || (b.activeToday - a.activeToday) || (b.last - a.last));
}
