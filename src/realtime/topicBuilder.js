/* ============================================================
   topicBuilder.js — REALTIME blueprint §6/§20: สร้างชื่อ topic แบบ scoped (deterministic)
   ============================================================
   หลักการ (§6.7 คำเตือน): topic มาจาก "ขอบเขตข้อมูลที่ผู้ใช้กำลังดู" ไม่ใช่ชื่อตาราง
   pure + deterministic → unit-test ได้ (blueprint §28 Unit: topic builder)
   ยังไม่ wire — เป็น primitive ให้ scoped subscription (Phase 2/3) ใช้ตอน migration realtime
   ⚠️ ยังไม่ wire — primitive ของ REALTIME-C2-PLAN (ดู src/realtime/README.md) · อย่าลบเพราะ "ไม่มีใคร import"
   ============================================================ */

// sanitize ส่วนประกอบ topic — กัน ':' / ช่องว่าง ทำให้ scope เพี้ยน (deterministic · lowercase)
function seg(v) {
  const s = String(v ?? '').trim().toLowerCase().replace(/[:\s]+/g, '-');
  return s || '_';
}
// YYYY-MM จาก 'YYYY-MM' หรือ 'YYYY-MM-DD' (ตัดให้เหลือเดือน)
function ym(month) { return String(month ?? '').slice(0, 7); }

export const topic = {
  // ── Core (§6.1) ──
  user: (userId) => `user:${seg(userId)}`,
  team: (teamId) => `team:${seg(teamId)}`,
  role: (roleId) => `role:${seg(roleId)}`,
  systemAnnouncements: () => 'system:announcements',

  // ── Sales (§6.2) ──
  salesDaily: (date, channelId) => `sales:daily:${seg(date)}:${seg(channelId)}`,
  salesMonth: (month, channelId = 'all') => `sales:month:${seg(ym(month))}:${seg(channelId)}`,
  salesFunnel: (month, teamId) => `sales:funnel:${seg(ym(month))}:${seg(teamId)}`,

  // ── Orders (§6.3) ──
  ordersMonth: (month) => `orders:month:${seg(ym(month))}`,
  ordersChannel: (channelId, month) => `orders:channel:${seg(channelId)}:${seg(ym(month))}`,
  order: (orderId) => `order:${seg(orderId)}`,

  // ── CRM (§6.4) ──
  crmTeam: (teamId) => `crm:team:${seg(teamId)}`,
  crmSegment: (segmentId) => `crm:segment:${seg(segmentId)}`,
  customer: (customerId) => `customer:${seg(customerId)}`,

  // ── Planner (§6.5) ──
  flow: (flowId) => `flow:${seg(flowId)}`,
  project: (projectId) => `project:${seg(projectId)}`,
  task: (taskId) => `task:${seg(taskId)}`,

  // ── Catalog (§6.6) ──
  catalogProducts: () => 'catalog:products',
  catalogProduct: (productId) => `catalog:product:${seg(productId)}`,
  catalogStock: (warehouseId) => `catalog:stock:${seg(warehouseId)}`,

  // ── Presence (§6.7) ──
  presenceCompany: () => 'presence:company',
  presenceTeam: (teamId) => `presence:team:${seg(teamId)}`,
  presenceFlow: (flowId) => `presence:flow:${seg(flowId)}`,
};

/**
 * แยก topic string → { kind, parts } (ใช้ route event → handler · debug)
 * @returns {{ kind:string, parts:string[] }}
 */
export function parseTopic(t) {
  const parts = String(t || '').split(':');
  return { kind: parts[0] || '', parts: parts.slice(1) };
}
