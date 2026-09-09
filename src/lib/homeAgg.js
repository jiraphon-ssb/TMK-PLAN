/* ============================================================
   homeAgg — ตรรกะหน้าแรก (pure · ไม่แตะ DOM/network)
   หน้าแรกไม่คำนวณเงินเอง: รับ rows จาก buildPerf (salePerfAgg) แล้วสรุปต่อ
   → เลขบนหน้าแรกต้องตรงกับ "ประสิทธิภาพเซล" และ "รายงานขาย" เสมอ
   ============================================================ */
import { NO_SELLER } from './salePerfAgg.js';

/* รวม daily ของทุกเซลล์เป็นรายวันของทีม */
export function teamDaily(rows, dim) {
  const out = Array.from({ length: dim }, (_, i) => ({ day: i + 1, sales: 0, orders: 0, leads: 0 }));
  (rows || []).forEach(r => {
    (r.daily || []).forEach(d => {
      const i = (Number(d.day) || 0) - 1;
      if (i < 0 || i >= dim) return;              // ข้อมูลเพี้ยน (วันเกินเดือน) → ข้าม ไม่ให้พัง
      out[i].sales += Number(d.sales) || 0;
      out[i].orders += Number(d.orders) || 0;
      out[i].leads += Number(d.leads) || 0;
    });
  });
  return out;
}

/* ต่อยอดรายวันของ "เดือนก่อน + เดือนนี้" เป็นเส้นเดียวที่คีย์ด้วยวันที่จริง
   จำเป็นเพราะทุกวันที่ 1 ของเดือน "เมื่อวาน" กับ "เฉลี่ย 7 วัน" อยู่คนละเดือนกับวันนี้
   (mm = ผลจาก fetchMergedMonth · days = [{day, sales, orders}]) */
export function dailySeries(mmCur, ymCur, mmPrev, ymPrev, leadsByIso = null) {
  const out = [];
  const push = (mm, ym) => {
    if (!mm || !Array.isArray(mm.days) || !ym) return;
    mm.days.forEach(d => {
      const day = Number(d.day) || 0;
      if (day < 1 || day > 31) return;
      const iso = `${ym}-${String(day).padStart(2, '0')}`;
      /* mpManual = ส่วนที่ "กรอกมือ" ของยอดวันนั้น (มาร์เก็ตเพลส) — ต้องพาต่อ
         เพราะยอดกรอกมือมาช้ากว่าออเดอร์จริงเสมอ → todayPulse ต้องรู้ว่าเทียบคนละฐานอยู่ */
      out.push({ iso, sales: Number(d.sales) || 0, orders: Number(d.orders) || 0, mpManual: Number(d.mpManual) || 0, leads: leadsByIso?.[iso] || 0 });
    });
  };
  push(mmPrev, ymPrev);
  push(mmCur, ymCur);
  /* วันที่ "มีคนทักแต่ยังไม่มีออเดอร์" ต้องมีแถวด้วย — mm.days สร้างจากออเดอร์เท่านั้น
     ถ้าไม่เติมตรงนี้ คนทักของวันนั้นจะหายทั้งก้อน (วันที่ทัก 40 ปิด 0 = วันที่ต้องรู้ที่สุด) */
  if (leadsByIso) {
    const have = new Set(out.map(d => d.iso));
    const inRange = (iso) => (ymCur && iso.slice(0, 7) === ymCur) || (ymPrev && iso.slice(0, 7) === ymPrev);
    Object.entries(leadsByIso).forEach(([iso, v]) => {
      if (have.has(iso) || !v || !inRange(iso)) return;
      out.push({ iso, sales: 0, orders: 0, mpManual: 0, leads: Number(v) || 0 });
    });
  }
  return out.sort((a, b) => a.iso.localeCompare(b.iso));
}

const shiftIso = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

/* ชีพจรวันนี้ — วันนี้ / เมื่อวาน / เฉลี่ย 7 วันปฏิทินก่อนหน้า (ไม่นับวันนี้)
   อิง "วันที่จริง" ไม่ใช่ลำดับแถว → ข้ามขอบเดือนได้ และวันที่หายไปไม่ถูกดึงมาปน
   ค่าที่ยังไม่มีข้อมูลคืน null ไม่ใช่ 0 — หน้าจะได้ไม่โชว์ "▼ -100%" */
export function todayPulse(series, todayIso) {
  const rows = series || [];
  const byIso = new Map(rows.map(d => [d.iso, d]));
  const cur = byIso.get(todayIso) || { sales: 0, orders: 0, leads: 0 };

  /* หน้าต่างเฉลี่ย = 7 "วันปฏิทิน" ก่อนหน้า — วันที่ขายไม่ได้เลยต้องนับเป็น 0 ไม่ใช่หลุดจากตัวส่วน
     (mm.days มีเฉพาะวันที่มีออเดอร์ → เดิมหารด้วยจำนวนวันที่มีแถว ทำให้เฉลี่ยสูงเกินจริง)
     แต่ต้องไม่นับวันที่ "ยังไม่มีข้อมูล" (ก่อนวันแรกที่ระบบมีข้อมูล) → clamp ด้วยวันแรกของซีรีส์ */
  const coveredFrom = rows.length ? rows[0].iso : null;          // rows เรียงตามวันที่แล้ว
  const win7 = shiftIso(todayIso, -7);
  const start = coveredFrom && coveredFrom > win7 ? coveredFrom : win7;
  const days = [];
  if (coveredFrom) for (let iso = start; iso < todayIso; iso = shiftIso(iso, 1)) days.push(iso);
  const avg7 = days.length ? days.reduce((a, iso) => a + (byIso.get(iso)?.sales || 0), 0) / days.length : null;
  /* ⛔ ฐานไม่เท่ากัน: ยอดมาร์เก็ตเพลส "กรอกมือ" ถูกกรอกตามหลัง (สิ้นวัน/สิ้นสัปดาห์)
     → วันในหน้าต่าง 7 วันมันอยู่ครบ แต่ "วันนี้" ยังไม่มี = ติดลบทุกวันโดยไม่มีเหตุจริง
     ไม่แก้ตัวเลข (ยอดที่โชว์ยังเป็นของจริง) แต่ตั้งธงให้หน้าจอบอกผู้ใช้ได้ */
  const winMpManual = days.reduce((a, iso) => a + (byIso.get(iso)?.mpManual || 0), 0);
  const mixedBasis = winMpManual > 0 && !(Number(cur.mpManual) || 0);

  const yIso = shiftIso(todayIso, -1);
  // เมื่อวานอยู่ในช่วงที่มีข้อมูล = ขายไม่ได้จริง (0) · อยู่นอกช่วง = ยังไม่รู้ (null)
  const yest = byIso.has(yIso) ? byIso.get(yIso).sales : (days.includes(yIso) ? 0 : null);
  return {
    today: cur.sales, orders: cur.orders, leads: cur.leads,
    yest, avg7, mixedBasis,
    dAvg7: avg7 ? ((cur.sales - avg7) / avg7) * 100 : null,      // avg7 = 0 หรือ null → ไม่หารศูนย์
    dYest: yest ? ((cur.sales - yest) / yest) * 100 : null,
  };
}

/* ความคืบหน้าเป้าเดือน + คาดการณ์สิ้นเดือนจาก pace ปัจจุบัน */
export function monthPace(sales, target, daysPassed, dim) {
  const projected = daysPassed > 0 ? (sales / daysPassed) * dim : 0;
  if (!(target > 0)) return { pct: null, projected, paceTarget: null, gap: null, zone: null };
  return {
    pct: (sales / target) * 100,
    projected,
    paceTarget: (target / dim) * daysPassed,      // เป้าที่ควรทำได้ถึงวันนี้
    gap: Math.max(0, target - sales),
    zone: sales >= target ? 'over' : projected >= target ? 'ontrack' : 'risk',
  };
}

/* อันดับเซลล์ — ตัด "ไม่ระบุเซลล์" ออก (ไม่ใช่คน · โผล่บนกระดานอันดับแล้วสับสน) */
export function sellerRank(rows, limit, todayDay) {
  return (rows || [])
    .filter(r => r.name !== NO_SELLER)
    .map(r => ({ ...r, today: r.daily?.[todayDay - 1]?.sales || 0 }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, limit);
}

/* สิ่งที่ต้องจัดการวันนี้ — รวมทุกแหล่งจริง เรียง bad → warn → info
   ทุกแถวต้องกดแล้วไปหน้าที่ "แก้ได้ทันที" (go = [section, sub]) */
const LEVEL_ORDER = { bad: 0, warn: 1, info: 2 };
export function buildTodos({ dueTasks = [], po = null, missingFunnel = [], noSeller = 0, outOfStock = 0, targetGap = null, locked = [] } = {}) {
  const out = [];
  if (po?.late) out.push({
    key: 'po-late', level: 'bad', icon: 'alertTriangle',
    title: `ใบสั่งผลิตเลยกำหนดรับ ${po.late} ใบ`,
    detail: 'ตามของกับโรงงาน หรือเลื่อนกำหนดรับ', go: ['catalog', 'stock'],
  });
  else if (po?.open) out.push({
    key: 'po-open', level: 'info', icon: 'box',
    title: `ใบสั่งผลิตเปิดอยู่ ${po.open} ใบ`,
    detail: po.sum?.pending ? `ค้างรับ ${po.sum.pending} ตัว` : 'รอรับเข้า', go: ['catalog', 'stock'],
  });
  if (outOfStock) out.push({
    key: 'stock-out', level: 'bad', icon: 'layers',
    title: `สินค้าหมด/ติดลบ ${outOfStock} รายการ`,
    detail: 'เช็คของจริงแล้วนับใหม่ หรือเปิดใบสั่งผลิต', go: ['catalog', 'stock'],
  });
  /* ขึ้นเดือนใหม่ = เป้าทุกชนิดเริ่มจากศูนย์ (เก็บเป็นแถวรายเดือน ไม่มีการสืบทอด)
     → เกจเป้าเดือนดับ · %เป้ารายคนหาย · ค่าคอมเป็น 0 · ทีม CRM ว่าง
     เตือนเฉพาะแอดมิน (คนอื่นแก้ไม่ได้ · PART 119) แล้วพาไปหน้าที่มีปุ่ม "คัดลอกจากเดือนก่อน" */
  if (targetGap?.isAdmin && (targetGap.noMonthTarget || targetGap.noPeopleTarget || targetGap.noCycleTarget)) {
    /* เดือนที่ต้องตั้งเป้ามีได้ 2 เดือนพร้อมกัน:
       - เดือนปฏิทินนี้ → เกจเป้าเดือน + %เป้ารายคน
       - เดือนที่ "รอบค่าคอม" จะไปจบ → ป๊อปอัพค่าคอมใช้เป้าของเดือนนั้น
         รอบตัด 26→25 แปลว่าตั้งแต่วันที่ 26 รอบจะจบเดือนหน้าแล้ว → ถ้ายังไม่ตั้งเป้า ค่าคอมเป็น 0 ทั้งกระดาน
         (เตือนวันที่ 1 ถือว่าสายไป 5–6 วัน) */
    const months = [];
    if (targetGap.noMonthTarget || targetGap.noPeopleTarget) months.push(targetGap.month);
    if (targetGap.noCycleTarget && targetGap.cycleMonth && !months.includes(targetGap.cycleMonth)) months.push(targetGap.cycleMonth);
    const parts = [];
    if (targetGap.noMonthTarget) parts.push('เกจเป้าเดือนจะยังไม่ทำงาน');
    if (targetGap.noPeopleTarget) parts.push('%เป้ารายคนและค่าคอมจะเป็น 0');
    if (targetGap.noCycleTarget) parts.push(`ค่าคอมรอบที่กำลังเดิน (จบ ${targetGap.cycleMonth}) จะเป็น 0`);
    out.push({
      key: 'target-gap', level: 'warn', icon: 'target',
      title: `ยังไม่ได้ตั้งเป้าเดือน ${months.join(' และ ')}`,
      detail: `${parts.join(' · ')} — คัดลอกจากเดือนก่อนได้ในหน้าตั้งค่า`,
      go: ['settings', 'targets'],
    });
  }
  if (dueTasks.length) out.push({
    key: 'tasks', level: 'warn', icon: 'listChecks',
    title: `งานครบกำหนด/ค้าง ${dueTasks.length} งาน`,
    detail: dueTasks.slice(0, 2).map(t => t.title).filter(Boolean).join(' · '), go: ['flows', 'kanban'],
  });
  if (missingFunnel.length) out.push({
    key: 'funnel', level: 'warn', icon: 'users',
    title: `ยังไม่กรอกคนทักของเมื่อวาน ${missingFunnel.length} คน`,
    detail: missingFunnel.join(' · '), go: ['catalog', 'perf'],
  });
  if (noSeller) out.push({
    key: 'no-seller', level: 'info', icon: 'user',
    title: `ออเดอร์เดือนนี้ไม่มีชื่อเซลล์ ${noSeller} ใบ`,
    detail: 'กระทบยอดรายคนและค่าคอม — ระบุเซลล์ให้ครบ', go: ['catalog', 'orders'],
  });
  /* ไม่ชี้ไปหน้าที่ผู้ใช้ถูกล็อก — เดิมกดแล้วได้แค่ toast "ไม่มีสิทธิ์เข้าหน้านี้" ซึ่งช่วยอะไรไม่ได้
     (แถวที่ทำอะไรต่อไม่ได้ = เสียงรบกวนล้วน) */
  const blocked = (go) => locked.includes(go[0]) || locked.includes(`${go[0]}:${go[1]}`);
  return out.filter(t => !blocked(t.go)).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

/* เซลล์ที่ "มีเป้าเดือนนี้" แต่ยังไม่กรอกคนทักของเมื่อวาน
   ใช้เมื่อวาน (ไม่ใช่วันนี้) เพราะคนทักกรอกตอนจบวัน — ถ้าเช็ควันนี้จะเตือนผิดทุกเช้า */
export function missingFunnelYesterday(funnel, targets, yesterdayISO) {
  const due = Object.entries(targets || {})
    .filter(([, t]) => Number(t?.sales_target) > 0)
    .map(([name]) => name);
  if (!due.length) return [];
  const filled = new Set(
    (funnel || [])
      .filter(f => String(f.date || '').slice(0, 10) === yesterdayISO)
      .map(f => String(f.salesperson || '').trim())
      .filter(Boolean),
  );
  return due.filter(n => !filled.has(n));
}

/* ออเดอร์เดือนนี้ที่ไม่มีชื่อเซลล์ (ตัดใบยกเลิก) — กระทบยอดรายคน/ค่าคอม */
export function countNoSeller(orders) {
  return (orders || []).filter(o =>
    String(o.status || '').toLowerCase() !== 'cancelled'
    && !String(o.salesperson || '').trim()).length;
}

/* หน้าหลักถูกออกแบบให้ "ล็อกไม่ได้" (NO_LOCK = ['home']) เพราะเป็นหน้าแรกหลังล็อกอิน
   แต่ PART 122 ย้ายเงินทั้งบริษัท + เป้าเดือน + %เป้ารายคน มาไว้บนหน้านี้
   → ถ้าไม่เช็ค locked_sections ระบบล็อกหน้ายอดขายจะเสียเปล่าทั้งชุด
   จับคู่ตามแหล่งข้อมูล: เงินบริษัท = รายงานขาย (catalog:report) · อันดับเซลล์ = ประสิทธิภาพเซล (catalog:perf) */
export function homeMoneyVisibility(locked) {
  const L = Array.isArray(locked) ? locked : [];
  const off = (sub) => L.includes('catalog') || L.includes(`catalog:${sub}`);
  return { showCompanyMoney: !off('report'), showSellerBoard: !off('perf') };
}
