/* ============================================================
   customerDrawer.jsx — drawer ลูกค้ากลาง (PART 88 · รวมเป็น popup เดียวกับหน้า CRM 22 ส.ค.)
   ============================================================
   เปิดจาก: แท็บลูกค้า & CRM (รายงานขาย) + กดชื่อลูกค้าบนการ์ดออเดอร์ (ประสิทธิภาพเซลล์)
   - UI = CustomerDetail (saleCrmDetail.jsx) ตัวเดียวกับหน้าภาพรวม CRM → เห็นข้อมูลเหมือนกันทุกที่
   - ที่นี่แค่ "ประกอบ c" จากออเดอร์/รายการสินค้าในหน่วยความจำของหน้านั้น (สโคป = ช่วงที่หน้าโหลด)
     + โหลดโปรไฟล์ tmk_mp_customers (cache กลาง) มาเติม ที่อยู่/เจ้าของ/โน้ต/แท็ก — ไม่มีก็แสดงได้
   - cust ทนฟิลด์ขาด: tier/flag/recency ไม่มี → ซ่อน (perf ส่ง stat พื้นฐานพอ)
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { CustomerDetail } from './saleCrmDetail.jsx';
import { fetchCustomerProfiles } from './lib/saleData.js';
import { crmCustomerKey } from './lib/crmAgg.js';

export const COLOR_HEX = { 'ขาว': '#dcdce0', 'ดำ': '#2a2a2e', 'กรม': '#1f2d50', 'กรมท่า': '#1f2d50', 'ฟ้า': '#4a8be0', 'น้ำเงิน': '#1f3aa0', 'เขียว': '#2f9e6e', 'เหลือง': '#e8c23b', 'แดง': '#c0392b', 'ชมพู': '#e06aa0', 'ม่วง': '#7c5cff', 'ส้ม': '#e0772f', 'โอรส': '#e0772f', 'ครีม': '#e6dcc2' };

// สร้าง cust stat จากออเดอร์ในหน่วยความจำ (ให้หน้าที่ไม่มี RFM เช่น perf เปิด drawer ได้)
export function custFromOrders(o, ords) {
  const code = o.customer_code || '';
  const name = o.customer_name || code || 'ไม่ระบุลูกค้า';
  // 1.9: จับด้วย code ก่อน · ถ้าไม่มี code แต่มีชื่อ → จับด้วยชื่อ · ไม่มีทั้งคู่ → เฉพาะใบนี้ (กันแมตช์ทุกใบชื่อว่าง)
  const mine = code ? (ords || []).filter(x => x.customer_code === code)
    : (o.customer_name ? (ords || []).filter(x => x.customer_name === o.customer_name) : [o]);
  const sales = mine.reduce((a, x) => a + (Number(x.sales) || 0), 0);
  const dates = mine.map(x => x.order_date || '').filter(Boolean).sort();
  return { code, name, sales, orders: mine.length, aov: mine.length ? sales / mine.length : 0, first: dates[0] || '', last: dates[dates.length - 1] || '' };
}

const mode = (arr) => { const m = new Map(); arr.forEach(v => { if (v) m.set(v, (m.get(v) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''; };

// ประกอบ c รูปเดียวกับ buildDirectory (crmDirectory.js) จากออเดอร์ในหน่วยความจำ + โปรไฟล์ (ถ้ามี)
export function buildCustFromMemory(cust, ords, skus, profile) {
  const mo = (ords || []).filter(o => cust.code ? o.customer_code === cust.code : o.customer_name === cust.name).filter(o => String(o.status || '').toLowerCase() !== 'cancelled')
    .sort((a, b) => (b.order_date || '').localeCompare(a.order_date || ''));
  const noSet = new Set(mo.map(o => o.order_no));
  const linesByOrder = new Map();
  (skus || []).forEach(s => { if (!noSet.has(s.order_no)) return; const g = linesByOrder.get(s.order_no) || []; g.push(s); linesByOrder.set(s.order_no, g); });
  const channels = new Map(), chSales = new Map();
  mo.forEach(o => { if (!o.channel) return; channels.set(o.channel, (channels.get(o.channel) || 0) + 1); chSales.set(o.channel, (chSales.get(o.channel) || 0) + (Number(o.sales) || 0)); });
  const sales = mo.reduce((a, o) => a + (Number(o.sales) || 0), 0);
  const qty = mo.reduce((a, o) => a + (Number(o.qty) || 0), 0);
  const dates = mo.map(o => o.order_date || '').filter(Boolean).sort();
  const first = dates[0] || cust.first || '', last = dates[dates.length - 1] || cust.last || '';
  const recency = cust.recency ?? (last ? Math.max(0, Math.round((Date.now() - new Date(last + 'T00:00:00').getTime()) / 86400000)) : null);
  const p = profile || {};
  return {
    // คีย์ลูกค้าต้องใช้สูตรกลาง (crmCustomerKey) — เดิมต่อ 'N'+ชื่อ เอง ทำให้ชื่อที่ถูกปิดบัง (ณ***์)
    // และชื่อยาวเกิน 60 ตัว ได้คีย์คนละตัวกับหน้า CRM → ประวัติการติดต่อ/งานติดตามแยกกันคนละชุด
    key: crmCustomerKey({ customer_code: cust.code, customer_name: cust.name }),
    code: cust.code || '', name: p.name || cust.name || cust.code,
    contact: p.phone || mode(mo.map(o => o.customer_phone)) || cust.contact || '',
    social: p.social_name || mode(mo.map(o => o.customer_social)) || '',
    address: p.address || '', district: p.district || '', postcode: p.postcode || '', province: p.province || mode(mo.map(o => o.province)) || '',
    owner: p.owner || '', cadence: p.cadence || '', note: p.note || '', contactChannel: p.contact_channel || '', repurchase: Number(p.repurchase) || 0,
    tags: Array.isArray(p.tags) ? p.tags : [], since: p.since || first, salesperson: mode(mo.map(o => (o.salesperson || '').trim())),
    sales: sales || cust.sales || 0, count: mo.length || cust.orders || 0, qty, first, last, recency,
    aov: mo.length ? sales / mo.length : (cust.aov || 0),
    channels, chSales, mainChannel: [...channels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '',
    tier: cust.tier, flag: cust.flag,
    orders: mo, linesByOrder, profile: profile || null,
  };
}

export function CustomerDrawer({ cust, ords, skus, onClose }) {
  const [profile, setProfile] = useState(null);
  const [patch, setPatch] = useState(null);   // หลังกดแก้ไขใน drawer → เห็นผลทันทีโดยไม่ต้องโหลดใหม่
  // โปรไฟล์จาก cache กลาง (ตัวเดียวกับหน้า CRM) — ไม่มีสิทธิ์/ไม่มีแถว ก็แสดงจากออเดอร์ได้
  useEffect(() => {
    let live = true;
    const code = cust?.code;
    (async () => {
      /* ⚠️ ต้องใช้ตัวโหลดกลาง (มี note/contact_channel) — เดิมอ่านด้วย CUST_SEL ซึ่งไม่มี 2 คอลัมน์นี้
         → ฟอร์มแก้โปรไฟล์อ่านได้ '' แล้วเซฟทับของจริงทิ้งทุกครั้ง
         และต้องแยก "อ่านไม่ได้" ออกจาก "ไม่มีแถว" — อ่านไม่ได้แล้วเซฟ = ล้างโปรไฟล์ทั้งชุด */
      let p = null, readOk = true;
      if (code) {
        const r = await fetchCustomerProfiles().catch(() => ({ rows: [], error: new Error('อ่านโปรไฟล์ไม่สำเร็จ') }));
        /* partial = ถอยไป select เดิมเพราะคอลัมน์เสริมยังไม่ migrate → ไม่มี note/contact_channel
           ถ้าปล่อยให้เซฟ ฟอร์มจะอ่านได้ '' แล้วเขียนทับของจริงทิ้ง (บั๊กเดิมที่เพิ่งแก้)
           จึงต้องถือว่า "อ่านไม่ครบ" = เซฟไม่ได้ เหมือนกรณีอ่านไม่ได้เลย */
        readOk = !r.error && !r.partial;
        p = (!r.error) ? (r.rows.find(x => x.customer_code === code) || null) : null;
      }
      if (live) setProfile({ code, p, readOk });
    })();
    return () => { live = false; };
  }, [cust?.code]);
  const prof = profile?.code === cust?.code ? profile.p : null;   // กันโปรไฟล์ของคนก่อนหน้าค้างตอนสลับลูกค้า
  // ยังโหลดไม่เสร็จ = undefined (ไม่บล็อก) · โหลดแล้วพลาด = false → ฟอร์มจะไม่ยอมเซฟทับ
  const profileReadOk = profile?.code === cust?.code ? profile.readOk : undefined;
  const c = useMemo(() => ({ ...buildCustFromMemory(cust, ords, skus, prof), profileReadOk, ...(patch || {}) }), [cust, ords, skus, prof, profileReadOk, patch]);
  return <CustomerDetail c={c} skus={skus || []} onClose={onClose}
    onSaved={(key, row) => setPatch({ name: row.name, contact: row.phone, social: row.social_name, address: row.address, province: row.province, owner: row.owner, cadence: row.cadence, note: row.note, tags: row.tags, contactChannel: row.contact_channel })} />;
}
