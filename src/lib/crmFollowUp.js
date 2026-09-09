/* ============================================================
   crmFollowUp.js — งานติดตามลูกค้า (CRM ↔ ระบบโครงการ) · PART 111
   ============================================================
   เดิมปุ่ม "สร้างงานติดตาม" เปิดฟอร์มงานพร้อมชื่อ/รายละเอียด แล้วจบ —
   งานที่สร้างไม่รู้ว่าเป็นของลูกค้าคนไหน → กดซ้ำได้เรื่อยๆ ไม่มีใครรู้ว่ามีงานค้างอยู่แล้ว
   ไฟล์นี้ผูก 2 ระบบเข้าด้วยกันด้วย **แท็กในงาน** (ใช้คอลัมน์ tags เดิม — ไม่ต้อง migration)

   crm:<customer_key>  →  1 งาน = 1 ลูกค้า · อ่านกลับได้จาก TMK.tasks ทันที
   ============================================================ */

export const CRM_TAG_PREFIX = 'crm:';
/** แท็กที่ใช้ผูกงานกับลูกค้า 1 คน */
export const crmTaskTag = (customerKey) => (customerKey ? `${CRM_TAG_PREFIX}${customerKey}` : '');
/** อ่านคีย์ลูกค้าออกจากแท็ก (null ถ้าไม่ใช่งาน CRM) */
export const customerKeyOfTask = (task) => {
  const t = (task?.tags || []).find(x => String(x || '').startsWith(CRM_TAG_PREFIX));
  return t ? String(t).slice(CRM_TAG_PREFIX.length) : null;
};

const isDone = (t, doneIds) => (doneIds ? doneIds.has(t?.status) : t?.status === 'done');
const dueOf = (t) => t?.dateEnd || t?.dateISO || '';

/** งานติดตามทั้งหมดของลูกค้า 1 คน (ใหม่→เก่า) */
export function customerTasks(tasks, customerKey) {
  const tag = crmTaskTag(customerKey);
  if (!tag) return [];
  return (tasks || [])
    .filter(t => (t.tags || []).includes(tag))
    .sort((a, b) => String(dueOf(b)).localeCompare(String(dueOf(a))));
}

/**
 * สถานะงานติดตามของลูกค้า — ใช้ตัดสินว่าจะโชว์ปุ่ม "สร้าง" หรือ "มีงานค้างอยู่"
 * @returns { total, open, overdue, nextDue, lastDone, openTasks }
 */
export function followUpStatus(tasks, customerKey, today, doneIds = null) {
  const rows = customerTasks(tasks, customerKey);
  const openTasks = rows.filter(t => !isDone(t, doneIds));
  const doneTasks = rows.filter(t => isDone(t, doneIds));
  const dues = openTasks.map(dueOf).filter(Boolean).sort();
  return {
    total: rows.length,
    open: openTasks.length,
    overdue: openTasks.filter(t => { const d = dueOf(t); return d && today && d < today; }).length,
    nextDue: dues[0] || '',
    lastDone: doneTasks.map(dueOf).filter(Boolean).sort().pop() || '',
    openTasks,
  };
}

/** วันที่ + n วัน → 'YYYY-MM-DD' (ใช้กับปุ่ม "ตามในอีก 3/7/14 วัน") */
export function addDaysISO(fromISO, days) {
  const d = new Date(`${String(fromISO || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + (Number(days) || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const baht = (n) => '฿' + Math.round(Number(n) || 0).toLocaleString('th-TH');

/**
 * ประกอบ payload ให้ฟอร์มงาน (prefill) — ครบทั้ง แท็กผูกลูกค้า · วันครบกำหนด · ความสำคัญ · ผู้รับผิดชอบ
 * @param c ลูกค้า (แถวจาก buildDirectory) · opts { today, days, owner, flowId }
 */
export function buildFollowUpTask(c, { today, days = 0, owner = '', flowId = '' } = {}) {
  const key = c?.key || c?.code || '';
  const due = addDaysISO(today, days) || today;
  const detail = [
    `ลูกค้า: ${c?.name || key}`,
    c?.contact && `เบอร์: ${c.contact}`,
    c?.last && `ซื้อล่าสุด: ${c.last}${c?.recency != null ? ` (${c.recency} วันก่อน)` : ''}`,
    Number(c?.sales) > 0 && `ยอดสะสม: ${baht(c.sales)} · ${Number(c?.count) || 0} ครั้ง`,
    c?.tier && `ระดับ: ${c.tier}${c?.flag ? ` · ${c.flag}` : ''}`,
    c?.note && `โน้ต: ${c.note}`,
  ].filter(Boolean).join('\n');
  return {
    title: `โทรตาม ${c?.name || key}${c?.contact ? ` (${c.contact})` : ''}`,
    detail,
    date: due,
    // ลูกค้าเสี่ยงหลุด/ขาประจำ = ความสำคัญสูง (ค่าเริ่มต้นเดิมคือ "กลาง" ทุกงาน)
    priority: (c?.flag === 'เสี่ยงหลุด' || c?.tier === 'เพชร' || c?.tier === 'ทอง') ? 'high' : 'medium',
    tags: [crmTaskTag(key)].filter(Boolean),
    responsible: owner ? [owner] : [],
    channel: c?.contact ? ['Phone'] : [],
    flow_id: flowId || '',
  };
}
