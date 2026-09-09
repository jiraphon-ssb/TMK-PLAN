/* ============================================================
   taskFilters.js — ตรรกะกลางของ "งาน" (pure · ทดสอบได้ · ใช้ร่วมทุกวิว)
   ============================================================
   PART 104 — เดิมตรรกะกรอง/นับ/เรียง กระจายอยู่ใน plannerFilters + views-mytasks
   (คนละสูตร: ค้นหาเฉพาะชื่อ · นับค้าง/เลยกำหนดคนละแบบ) → ย้ายมาที่เดียว
   ใช้โดย: plannerFilters.jsx · views-planner.jsx · plannerKanban/List/Timeline/Calendar
   ============================================================ */

/** วันนี้ (ISO local) — ไม่ใช้ UTC (toISOString เพี้ยนข้ามวันในไทย) */
export function isoToday(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ชื่อทั้งหมดที่ = "ฉัน" (ชื่อคน + ชื่อบทบาท จาก roles/staff) */
export function myNameSet(email, { roles = [], staff = [] } = {}) {
  const low = (x) => String(x || '').toLowerCase();
  const s = new Set();
  const me = low(email);
  // ไม่มีอีเมล (หน้าแชร์สาธารณะ / ยังไม่ล็อกอินเสร็จ) = ไม่ใช่ของใครทั้งนั้น
  // เดิม '' === '' → แถวพนักงานที่ไม่มีอีเมลกลายเป็น "ฉัน" ทุกคน → ตัวกรอง "ของฉัน" มั่ว
  if (!me) return s;
  [...(roles || []), ...(staff || [])].forEach(r => {
    if (low(r?.email) !== me) return;
    if (r?.name) s.add(r.name);
    if (r?.dutyName) s.add(r.dutyName);
  });
  return s;
}

/** กำหนดส่งของงาน — ใช้วันสิ้นสุดถ้ามี ไม่งั้นวันเริ่ม */
export const dueISOof = (t) => (t?.dateEnd || t?.dateISO || '');

/**
 * สถานะกำหนดส่ง — สูตรเดียวทั้งระบบ
 * @returns {{ iso:string, diff:number|null, state:'none'|'done'|'overdue'|'today'|'soon'|'later' }}
 */
export function dueInfo(t, today = isoToday(), doneIds = null) {
  const iso = dueISOof(t);
  const isDone = doneIds ? doneIds.has(t?.status) : t?.status === 'done';
  if (!iso) return { iso: '', diff: null, state: isDone ? 'done' : 'none' };
  const diff = Math.round((new Date(iso + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
  if (isDone) return { iso, diff, state: 'done' };
  if (diff < 0) return { iso, diff, state: 'overdue' };
  if (diff === 0) return { iso, diff, state: 'today' };
  if (diff <= 7) return { iso, diff, state: 'soon' };
  return { iso, diff, state: 'later' };
}

/** ค้นหาแบบกว้าง — ชื่อ + รายละเอียด + แท็ก + ผู้รับผิดชอบ (เดิมหาเฉพาะชื่อ → หาคนไม่เจอ) */
export function taskMatchesQuery(t, q) {
  const ql = String(q || '').trim().toLowerCase();
  if (!ql) return true;
  const hay = [t?.title, t?.detail, ...(t?.tags || []), ...(t?.responsible || [])]
    .map(x => String(x || '').toLowerCase()).join(' ');
  return hay.includes(ql);
}

/** ตัวกรองด่วน (ชิปบนแถบเครื่องมือ) — ของฉัน / เลยกำหนด / ครบใน 7 วัน / ยังไม่เสร็จ */
export function matchesQuick(t, quick, { myNames, today = isoToday(), doneIds = null } = {}) {
  if (!quick) return true;
  const d = dueInfo(t, today, doneIds);
  if (quick === 'mine') return (t.responsible || []).some(r => myNames?.has(r));
  if (quick === 'overdue') return d.state === 'overdue';
  if (quick === 'week') return d.state === 'today' || d.state === 'soon';
  if (quick === 'open') return d.state !== 'done';
  return true;
}

/** ตัวกรองหลัก — รวมทุกเงื่อนไขไว้ที่เดียว (ใช้แทน filterTasks เดิม) */
export function filterTasks(tasks, opts = {}) {
  const { filterCamp, filterStatus, search, filterResp, doneIds, tokenizeCh,
    filterPriority, filterTags, filterChannel, filterDateFrom, filterDateTo,
    quick, myNames, today = isoToday() } = opts;
  const isDone = (s) => (doneIds ? doneIds.has(s) : s === 'done');
  const tok = tokenizeCh || ((v) => (Array.isArray(v) ? v : String(v || '').split(',')).map(s => s.trim()).filter(Boolean));
  return (tasks || []).filter(t => {
    if (filterCamp?.length && !filterCamp.includes(t.camp)) return false;
    if (filterResp?.length && !(t.responsible || []).some(r => filterResp.includes(r))) return false;
    if (filterPriority?.length && !filterPriority.includes(t.priority || 'medium')) return false;
    if (filterTags?.length && !(t.tags || []).some(tg => filterTags.includes(tg))) return false;
    if (filterChannel?.length && !tok(t.channel).some(x => filterChannel.includes(x))) return false;
    if (filterStatus === 'active' && isDone(t.status)) return false;
    if (filterStatus === 'done' && !isDone(t.status)) return false;
    if (filterDateFrom || filterDateTo) {
      const start = t.dateISO || '';
      const end = t.dateEnd || t.dateISO || '';
      if (!start) return false;
      if (filterDateFrom && end < filterDateFrom) return false;
      if (filterDateTo && start > filterDateTo) return false;
    }
    if (!matchesQuick(t, quick, { myNames, today, doneIds })) return false;
    if (!taskMatchesQuery(t, search)) return false;
    return true;
  });
}

const PRIO_RANK = { high: 0, medium: 1, low: 2 };
/** เรียงงาน — due (ไม่มีวัน = ท้ายสุด) / priority / updated / manual(sortOrder) */
export function sortTasks(list, by = 'manual') {
  const arr = [...(list || [])];
  const byDue = (a, b) => {
    const da = dueISOof(a), db = dueISOof(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da < db ? -1 : da > db ? 1 : 0;
  };
  if (by === 'due') arr.sort(byDue);
  else if (by === 'priority') arr.sort((a, b) => (PRIO_RANK[a.priority || 'medium'] - PRIO_RANK[b.priority || 'medium']) || byDue(a, b));
  else if (by === 'updated') arr.sort((a, b) => String(b.updatedAt || b.updated_at || '').localeCompare(String(a.updatedAt || a.updated_at || '')));
  else if (by === 'title') arr.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'th'));
  // manual = ลำดับที่ลากไว้ · tie แล้วค่อยเรียงตามกำหนดส่ง (เดิม tie=0 ทั้งคอลัมน์ → ลำดับสุ่มทุก render)
  else arr.sort((a, b) => ((a.sortOrder || 0) - (b.sortOrder || 0)) || byDue(a, b));
  return arr;
}

/** สรุปตัวเลขของชุดงาน — ใช้ทั้งหัวบอร์ด/ชิปด่วน/คอลัมน์ */
export function taskStats(tasks, doneIds = null, today = isoToday()) {
  const st = { total: 0, done: 0, open: 0, overdue: 0, today: 0, week: 0, pct: 0 };
  (tasks || []).forEach(t => {
    st.total++;
    const d = dueInfo(t, today, doneIds);
    if (d.state === 'done') { st.done++; return; }
    st.open++;
    if (d.state === 'overdue') st.overdue++;
    else if (d.state === 'today') { st.today++; st.week++; }
    else if (d.state === 'soon') st.week++;
  });
  st.pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
  return st;
}
