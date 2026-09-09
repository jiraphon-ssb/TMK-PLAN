/* ============================================================
   crmDirectory.js — ตรรกะบริสุทธิ์ของหน้า ลูกค้า (CRM)
   ============================================================
   แยกออกจาก saleCrm.jsx (Wave 3) — helper/const ระดับ module ที่ pure:
   - buildDirectory: รวมโปรไฟล์ + ออเดอร์สด → directory ลูกค้า (คิดยอด/ครั้ง/ล่าสุด/tier)
   - ค่าคงที่ตาราง (TIER_CHIP/TIERS/PER_PAGE/CRM_SORT/STATUS_PRED)
   - helper เล็ก (num/pageList/dlt) + สีช่องทาง (LINE_C/PHONE_C)
   ไม่มี React state/props/hook — รับ arg เข้า คืนค่าออก
   ============================================================ */
import { rfmTiers } from './saleAgg.js';
import { channelColor } from '../charts.jsx';

export const num = (v) => Number(v) || 0;
export const TIER_CHIP = { 'เพชร': 'tier-chip-diamond', 'ทอง': 'tier-chip-gold', 'เงิน': 'tier-chip-silver', 'ทองแดง': 'tier-chip-bronze' };
export const TIERS = ['เพชร', 'ทอง', 'เงิน', 'ทองแดง'];
export const PER_PAGE = 50;
export const CRM_SORT = {
  name: (c) => (c.name || '').toLowerCase(),
  sales: (c) => c.sales || 0,
  count: (c) => c.count || 0,
  recency: (c) => (c.recency == null ? Infinity : c.recency), // ใหม่สุด = recency น้อย
};
// สถานะลูกค้า — ป้าย → predicate (เลือกหลายอัน = OR)
export const STATUS_PRED = {
  'ลูกค้าใหม่': c => c.flag === 'ใหม่',
  'ซื้อซ้ำ': c => c.repeat,
  'เสี่ยงหลุด': c => c.flag === 'เสี่ยงหลุด',
  'มีเบอร์': c => c.hasContact,
  'คิวตามต่อ': c => c.queue,
};
export const STATUS_OPTS = Object.keys(STATUS_PRED);

/* ---------- ตัวช่วยเลขหน้า (pagination · … เมื่อหน้าเยอะ) ---------- */
export function pageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  const lo = Math.max(2, cur - 1), hi = Math.min(total - 1, cur + 1);
  if (lo > 2) out.push('…');
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < total - 1) out.push('…');
  out.push(total);
  return out;
}

/* ---------- รวม directory: โปรไฟล์ + ออเดอร์สด + เซลล์กรอกเอง ---------- */
export function buildDirectory(profiles, orders, asOf) {
  const m = new Map();
  const ensure = (key) => {
    let r = m.get(key);
    if (!r) {
      r = { key, name: '', contact: '', social: '', address: '', district: '', postcode: '', province: '', owner: '', cadence: '', note: '', contactChannel: '', repurchase: 0, tags: [], since: '', salesperson: '', sales: 0, count: 0, qty: 0, first: '', last: '', channels: new Map(), chSales: new Map(), orders: [], ltSales: 0, ltOrders: 0, profile: null };
      m.set(key, r);
    }
    return r;
  };
  const isMasked = (v) => /\*{2,}/.test(String(v || ''));
  // 1) โปรไฟล์ (tmk_mp_customers) — ข้อมูลติดต่อ/เจ้าของ/แท็ก (ข้ามโปรไฟล์ปกปิดที่หลุดเข้ามาก่อนหน้า)
  (profiles || []).forEach(p => {
    if (isMasked(p.name) || isMasked(p.customer_code)) return;
    const r = ensure(p.customer_code);
    r.profile = p; r.name = p.name || p.customer_code; r.contact = p.phone || '';
    r.social = p.social_name || ''; r.address = p.address || ''; r.district = p.district || ''; r.postcode = p.postcode || '';
    r.province = p.province || ''; r.owner = p.owner || ''; r.cadence = p.cadence || ''; r.note = p.note || '';
    r.contactChannel = p.contact_channel || ''; r.repurchase = num(p.repurchase);
    r.tags = Array.isArray(p.tags) ? p.tags : []; r.since = p.since || '';
    r.ltSales = num(p.lifetime_sales); r.ltOrders = num(p.lifetime_orders);
    if (p.last_order && p.last_order > r.last) r.last = p.last_order;   // fallback — ออเดอร์สดทับทีหลัง
  });
  // 2) ออเดอร์สด (tmk_mp_orders) — ยอด/ครั้ง/ล่าสุด ต่อคน (ตัดใบยกเลิก → ยอดไม่ค้าง)
  const orderKey = (o) => {
    // ลูกค้าปกปิด (Shopee mask "ณ******์") → ไม่คลัสเตอร์ (เช็คชื่อ/รหัสก่อน · ครอบออเดอร์เก่าที่ code เป็นคีย์ปกปิด)
    if (isMasked(o.customer_name) || isMasked(o.customer_code)) return '';
    const c = String(o.customer_code || '').trim();
    if (c) return c;
    const n = String(o.customer_name || '').trim();
    return n ? 'N' + n.slice(0, 60) : '';   // ออเดอร์เก่า code ว่าง — จับด้วยชื่อ (คีย์เดียวกับโปรไฟล์ N)
  };
  (orders || []).forEach(o => {
    if (o.status === 'cancelled') return;
    const k = orderKey(o); if (!k) return;   // ไม่มีชื่อ/รหัสลูกค้า (มาร์เก็ตเพลสนิรนาม) — ไม่ขึ้น CRM
    const r = ensure(k);
    if (!r.name) r.name = o.customer_name || k;
    if (!r.social) r.social = o.customer_social || '';
    if (!r.province) r.province = o.province || '';
    if (!r.salesperson) r.salesperson = o.salesperson || '';
    r.sales += num(o.sales); r.count += 1; r.qty += num(o.qty);
    const d = o.order_date || '';
    if (d && (!r.first || d < r.first)) r.first = d;
    if (d > r.last) r.last = d;
    if (o.channel) { r.channels.set(o.channel, (r.channels.get(o.channel) || 0) + 1); r.chSales.set(o.channel, (r.chSales.get(o.channel) || 0) + num(o.sales)); }
    r.orders.push({ date: d, order_no: o.order_no, channel: o.channel || '', sales: num(o.sales), qty: num(o.qty) });
  });
  const arr = [...m.values()];
  // โปรไฟล์เก่าจาก import (CE####) ที่ไม่มีออเดอร์สดในระบบ → โชว์ยอดสะสมเดิม (อ่านอย่างเดียว)
  arr.forEach(r => { if (r.count === 0 && r.ltOrders > 0) { r.sales = r.ltSales; r.count = r.ltOrders; } });
  const { rows: tiered } = rfmTiers(arr.map(r => ({ ...r, orders: r.count })), asOf);
  const tmap = new Map(tiered.map(t => [t.key, t]));
  return arr.map(r => {
    const t = tmap.get(r.key) || {};
    const mainChannel = [...r.channels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || r.contactChannel || '';
    // segment โทร/LINE: เป็นสมาชิกถ้าเคยซื้อผ่านช่องนั้น หรือถูกตั้ง "ช่องทางติดต่อหลัก (CRM)" ไว้ (r.contactChannel)
    const segPhone = r.channels.has('Phone') || r.contactChannel === 'Phone';
    const segLine = r.channels.has('LINE') || r.contactChannel === 'LINE';
    return {
      ...r, orders: r.orders.sort((a, b) => (b.date || '').localeCompare(a.date || '')),
      aov: r.count ? r.sales / r.count : 0,
      recency: t.recency, tier: t.tier, flag: t.flag,
      repeat: r.count > 1, hasContact: !!r.contact, queue: !!(r.cadence || r.owner), mainChannel,
      segPhone, segLine, segCrm: segPhone || segLine,
      phoneSales: r.chSales.get('Phone') || 0, lineSales: r.chSales.get('LINE') || 0,
    };
  }).sort((a, b) => b.sales - a.sales);
}

/* ---------- แดชบอร์ดยอด CRM รายเดือน (โทร + LINE) — PART 87 ---------- */
export const LINE_C = channelColor('LINE');   // #06c755
export const PHONE_C = channelColor('Phone'); // #3aa0c9
// delta % เทียบเดือนก่อน → { delta, deltaUp } | null
export const dlt = (cur, prev) => {
  if (prev == null || prev <= 0) return null;
  const p = Math.round((cur - prev) / prev * 100);
  if (p === 0) return null;
  return { delta: `${p > 0 ? '+' : ''}${p}%`, deltaUp: p > 0 };
};

/* ============================================================
   ลูกค้าที่น่าจะเป็นคนเดียวกัน (PART 110)
   ============================================================
   เกิดเพราะคีย์ต่างกัน: โปรไฟล์ผูก customer_code · ออเดอร์เก่าที่ไม่มีรหัสผูก 'N'+ชื่อ
   → คนเดียวกันกลายเป็น 2 แถว ทำให้ยอดสะสม/RFM รายคนเพี้ยน (ยอดรวมบริษัทไม่กระทบ)
   จับคู่ด้วย "เบอร์ที่เหลือแต่ตัวเลข" ก่อน แล้วค่อยชื่อที่ normalize แล้ว
   คืน [{ reason, value, rows:[...] }] เรียงกลุ่มที่ยอดรวมเยอะก่อน — ใช้แค่ "ชี้เป้า" ไม่รวมให้อัตโนมัติ
   ============================================================ */
const digitsOnly = (v) => String(v || '').replace(/\D/g, '');
const normName = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.\-_]/g, '').trim();

export function findDuplicateCustomers(rows, { minPhoneLen = 9 } = {}) {
  const list = (rows || []).filter(r => r && (r.key || r.code));
  const byPhone = new Map(), byName = new Map();
  list.forEach(r => {
    const ph = digitsOnly(r.contact);
    if (ph.length >= minPhoneLen) { const g = byPhone.get(ph) || []; g.push(r); byPhone.set(ph, g); }
    const nm = normName(r.name);
    if (nm.length >= 3) { const g = byName.get(nm) || []; g.push(r); byName.set(nm, g); }
  });
  const out = [];
  const seen = new Set();
  const keyOf = (r) => r.key || r.code;
  const push = (reason, value, group) => {
    const uniq = [...new Map(group.map(r => [keyOf(r), r])).values()];
    if (uniq.length < 2) return;
    const sig = uniq.map(keyOf).sort().join('|');
    if (seen.has(sig)) return;
    seen.add(sig);
    out.push({ reason, value, rows: uniq, sales: uniq.reduce((a, r) => a + (Number(r.sales) || 0), 0) });
  };
  byPhone.forEach((g, ph) => push('เบอร์เดียวกัน', ph, g));
  byName.forEach((g, nm) => push('ชื่อเหมือนกัน', nm, g));
  return out.sort((a, b) => b.sales - a.sales);
}
