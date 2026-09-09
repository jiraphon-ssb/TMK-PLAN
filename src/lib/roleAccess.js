/* ============================================================
   roleAccess.js — ตรรกะสิทธิ์ตาม role (PART 84 TEST-1 · รวมศูนย์ security-critical)
   ============================================================
   pure ล้วน — เดิม inline ซ้ำใน views-orders/views-sale-submit (user?.role === 'admin' ...)
   → รวมเป็น single source ที่เทสต์ได้ (role visibility = security · ต้องมี test)
   นิยาม: admin เห็น "ทั้งทีม" · คนอื่น (editor/viewer) เห็นเฉพาะของตัวเอง (salesperson = ชื่อ/อีเมลตัวเอง)
   ============================================================ */

// ผู้ดูแลระบบ?
export const isAdmin = (user) => user?.role === 'admin';

// ชื่อที่ระบุว่า "เป็นของฉัน" — จับคู่กับ salesperson ของออเดอร์ (ชื่อ หรือ อีเมล)
/* ⚠️ ต้อง trim — ข้อมูลจริงมีชื่อเซลล์ที่มีช่องว่างหัว/ท้าย (' แอน ')
   ตัวรวมยอดทุกตัว trim หมด (salePerfAgg.spOf · funnelClose.nmSeller)
   ถ้าตัวกรองสิทธิ์ไม่ trim → เซลล์เปิดป๊อปอัพค่าคอมแล้ว "ไม่มีแถวของตัวเอง = ฿0"
   ขณะที่แอดมินเห็นแถวเธอยอด ฿12,000 คอม ฿600 */
const nm = (v) => String(v ?? '').trim();
export const myNamesOf = (user) => [user?.name, user?.email].filter(Boolean).map(nm);

// เห็นข้อมูล "ทั้งทีม" (ใบเสร็จ + คนทัก/funnel) = admin เท่านั้น
export const canSeeTeam = (user) => isAdmin(user);

/* ---------- หน้าประสิทธิภาพเซล: แยก "ภาพรวมทีม" ออกจาก "ตารางรายคน" (2 ก.ย. 69) ----------
   ภาพรวมทีม (ยอดรวม · KPI · คนทักทั้งทีม+%ปิด · เสียงลูกค้า · กราฟรายวัน) = เปิดให้ทุก role
     — ตัวเลขระดับทีม ไม่ผูกกับตัวบุคคล ทีมควรเห็นเป้าหมายร่วมกัน
   ตารางรายคน = แอดมินเท่านั้น เพราะมีคอลัมน์ "เป้า/คอม" ที่เป็น **ค่าตอบแทนรายบุคคล**
     (ค่าคอมของตัวเองยังเห็นได้ตามปกติในการ์ดรายละเอียดของตัวเอง)
   ⚠️ ไม่แตะ canSeeTeam เดิม — หน้าอื่นใช้อยู่ ความหมายคนละอย่าง */
export const canSeeTeamOverview = (user) => !!user?.role;
export const canSeeTeamBoard = (user) => isAdmin(user);

/* หน้า "บันทึกกิจกรรม" = แอดมินเท่านั้น — ไม่ใช่ deny-list
   CLAUDE.md และ header ของ views-log.jsx เขียนไว้ตรงกันว่า admin-only แต่ App ไม่เคยมี gate จริง
   (มีแค่ isLocked('logs') ซึ่ง default = เข้าได้) · log มี before→after ของเป้ายอด/เรตคอมรายคน
   ซึ่งหน้าตั้งค่าและตารางรายคนกันไว้ให้ admin แล้ว */
export const canSeeAuditLog = (user) => isAdmin(user);

// ออเดอร์นี้มองเห็นได้โดย user คนนี้ไหม — admin เห็นทุกใบ · คนอื่นเห็นเฉพาะที่ salesperson = ชื่อ/อีเมลตัวเอง
export const orderVisibleTo = (order, user) => isAdmin(user) || myNamesOf(user).includes(nm(order?.salesperson));
