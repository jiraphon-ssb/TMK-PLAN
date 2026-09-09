/* ============================================================
   mapToTMK.js — แปลง raw Supabase → TMK structure (PART 84 REFACTOR-1 · แยกจาก dataContext god-file)
   ============================================================
   pure transform (ไม่มี TMK singleton/computeMonth call · comment เท่านั้น) · dataContext เรียกใน mutateTMK
   ============================================================ */
import { getToday, THAI_MONTHS } from './dateUtils.js';

const THAI_MONTH = THAI_MONTHS;

// ปัดเงินเป็น 2 ตำแหน่งสตางค์ — ตัด noise float จากการบวก (เช่น 703.84+770 = 1473.8400000000001 → 1473.84)
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// แปลง "2026-06-18" → "18 มิ.ย."
function thaiDate(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  return `${parseInt(parts[2], 10)} ${THAI_MONTH[parseInt(parts[1], 10) - 1] || ''}`;
}

// แปลง array ของ user_roles + staff → roles + staff สำหรับ UI
function mapRolesAndStaff(userRoles, staff) {
  // dedupe รายชื่อทีม — กันคนซ้ำ (แถว tmk_staff ซ้ำ / คนเดียวกันหลายแถว) ที่ทำให้ "รายคน" ในตั้งค่าโครงการโผล่ซ้ำ
  // คีย์: email (ตัวพิมพ์เล็ก) ก่อน · fallback ชื่อ · fallback id — เก็บแถวแรก
  const _seen = new Set();
  staff = (staff || []).filter(s => {
    const k = String(s.email || '').trim().toLowerCase() || String(s.name || '').trim() || s.id;
    if (!k || _seen.has(k)) return false;
    _seen.add(k); return true;
  });
  const byEmail = Object.fromEntries(staff.map(s => [s.email, s]));
  return {
    roles: userRoles.map(r => {
      const s = byEmail[r.email];
      return {
        email: r.email,
        name: r.name || s?.name || String(r.email || '').split('@')[0],
        role: r.role || 'viewer',
        dutyId: r.duty_id || '',
        department: r.dutyName || r.department || s?.role || '',
        color: r.dutyColor || r.color || s?.color || '#3b82f6',
        avatarUrl: s?.avatar_url || '',
        lockedSections: Array.isArray(r.locked_sections) ? r.locked_sections : [],  // หน้าใหญ่ที่ถูกล็อก (graceful ถ้าคอลัมน์ยังไม่มี)
      };
    }),
    staff: staff.map(s => ({
      id: s.id, // ต้องมี — ให้ saveProfile/RolesView reuse id เดิม (กันแก้ผู้ใช้เดิมแล้วเกิดแถว staff ซ้ำ)
      name: s.name,
      role: s.role,
      email: s.email || '',
      color: s.color || '#3b82f6',
      avatarUrl: s.avatar_url || '',
    })),
  };
}

/* ── memo ต่อ "ส่วน" ด้วย reference ของ input ──────────────────────────────────
   เดิม: เซฟ 1 ครั้ง → refreshTables ดึงตารางเดียว แต่ mapToTMK map ใหม่ "ทุกตาราง"
   (map/filter/reduce ~54 จุด) → เสีย CPU ตอนเซฟ = หน้าสะดุด ทั้งที่ตารางอื่นไม่ได้เปลี่ยน
   refreshTables แทนค่าเฉพาะ rawRef.current[key] ที่ดึงใหม่ → ตารางอื่นยังเป็น reference เดิม
   → เทียบ === แล้วข้าม map ซ้ำได้ · ปลอดภัยเพราะ applyMapped() อ่านค่าออก (push ทีละตัว) ไม่ยึด reference
   ส่วนที่พึ่งพากันเป็นลูกโซ่ (daily → MTD → monthly → computed) ไม่แตะ คำนวณใหม่ทุกครั้ง */
const _sectionMemo = new Map();
function memoSection(key, deps, compute) {
  const prev = _sectionMemo.get(key);
  if (prev && prev.deps.length === deps.length && prev.deps.every((d, i) => d === deps[i])) return prev.val;
  const val = compute();
  _sectionMemo.set(key, { deps, val });
  return val;
}
// ล้างแคช (เรียกตอน logout — กันข้อมูล user เดิมค้างข้ามคน · และในเทสต์)
export function clearMapMemo() { _sectionMemo.clear(); }

// แปลง raw Supabase data → TMK structure
export function mapToTMK(raw) {
  const today = getToday(); // วันที่จริงของเครื่อง = source of truth ของ "วันนี้"
  // ค่าตั้งค่า "รายเดือน" ของเดือนปัจจุบัน (เก็บใน tmk_monthly_history: target + meta jsonb)
  const _curRow = (raw.monthly || []).find(m => Number(m.year) === today.yearBE && Number(m.month) === today.month);
  const _curMeta = (_curRow && _curRow.meta) || {};
  const TARGET = Number(_curRow?.target || 0);             // เป้ายอดรวมของเดือนนี้ (ยังไม่ตั้ง = 0)
  const DAY = today.day;                 // วันจริง (แทน settings.current_day)
  const DAYS = today.daysInMonth;        // จำนวนวันจริงในเดือนนี้
  const ACOS_CEIL = Number(_curMeta.acosCeil || 25);       // เพดาน ACOS รายเดือน — default 25%
  const AD_BUDGET = Number(_curMeta.adBudget || 0) || Object.values(_curMeta.adChannels || {}).reduce((s, v) => s + (Number(v) || 0), 0); // งบโฆษณาเดือนนี้ (fallback บวกจากงบต่อช่อง ให้ตรงกับหน้า Ads)

  // รายได้ต่อช่องทาง derive จาก tmk_daily_sales จริง (single source of truth)
  // กรอกยอดรายวัน → MTD/ช่องทางอัปเดตเอง; ถ้ายังไม่มี daily → 0
  const DAILY_COL = { shopee: 'shopee', tiktok: 'tiktok', lazada: 'lazada', facebook: 'facebook', line: 'line_oa', crm: 'crm' };
  // Aggregate ต่อช่องทางจาก daily jsonb เฉพาะ "เดือนปัจจุบัน" (ตรงกับ computeMonth — Home<->Sales ตรงกัน)
  const _curY = today.yearBE, _curM = today.month;
  const _chIdList = (raw.channels || []).map(c => c.id);
  const dailyAgg = {};
  let dailyAdTotal = 0;
  // filter deleted_at ฝั่ง client (soft-delete รายวัน) — ปลอดภัยแม้ column ยังไม่มี
  const _dailyLive = (raw.daily || []).filter(d => !d.deleted_at);
  _dailyLive.forEach(d => {
    const [yy, mm] = String(d.date).split('-').map(Number);
    if ((yy + 543) !== _curY || mm !== _curM) return; // เฉพาะเดือนปัจจุบัน
    dailyAdTotal += Number(d.ad_spend || 0);
    const cj = (d.channels && typeof d.channels === 'object') ? d.channels : {};
    _chIdList.forEach(id => {
      const j = cj[id] || {};
      const legacyCol = DAILY_COL[id];
      const rev = Number(j.rev != null ? j.rev : (legacyCol ? d[legacyCol] : 0)) || 0;
      const a = dailyAgg[id] || (dailyAgg[id] = { rev: 0, ord: 0, ad: 0, newC: 0, oldC: 0, inq: 0 });
      a.rev += rev; a.ord += Number(j.ord || 0); a.ad += Number(j.ad || 0);
      a.newC += Number(j.newC || 0); a.oldC += Number(j.oldC || 0); a.inq += Number(j.inq || 0);
    });
  });

  // Channels
  const _CH_ORDER = ['facebook', 'tiktok', 'shopee', 'crm', 'lazada', 'line']; // ลำดับช่องทางคงที่ — ใช้ทุกหน้า
  const channels = (raw.channels || []).map(ch => ({
    id: ch.id,
    name: ch.name,
    icon: ch.icon || '',
    logoUrl: ch.logo_url || '',
    color: `var(--ch-${(ch.id || '').toLowerCase()})`,
    hex: ch.color,
    // เป้าต่อช่องทาง = ค่าของเดือนปัจจุบัน (meta.channelTargets); ไม่มี = 0
    target: Number((_curMeta.channelTargets && _curMeta.channelTargets[ch.id]) || 0),
    // รายได้/ออเดอร์/ลูกค้า/ค่าแอด ต่อช่องทาง = ยอดจริงจาก daily เดือนปัจจุบัน (ตรงกับ computeMonth)
    actual: round2(dailyAgg[ch.id]?.rev || 0),
    sortOrder: Number(ch.sort_order || 0),
    orders: dailyAgg[ch.id]?.ord || 0,
    newRev: 0, oldRev: 0, // ไม่ได้แยกรายได้ใหม่/เก่า
    newCust: dailyAgg[ch.id]?.newC || 0,
    oldCust: dailyAgg[ch.id]?.oldC || 0,
    // "คนทัก" = ลูกค้าใหม่ + ลูกค้าเก่า (ตามนิยามที่ผู้ใช้ต้องการ — คนทักคือจำนวนลูกค้ารวม)
    inq: (dailyAgg[ch.id]?.newC || 0) + (dailyAgg[ch.id]?.oldC || 0),
    ad: round2(dailyAgg[ch.id]?.ad || 0),
    hasAd: Boolean(ch.has_ad),
    growthPct: Number(ch.growth_pct || 0),
    platformFeePct: Math.min(100, Math.max(0, Number(ch.platform_fee_pct || 0))), // ค่าธรรมเนียมจริงต่อช่องทาง (0 = ยังไม่ตั้ง) · clamp 0–100 กันค่าเก่าผิดช่วงทำ P&L เพี้ยน
  })).sort((a, b) => { const sa = a.sortOrder || 0, sb = b.sortOrder || 0; if (sa !== sb) return sa - sb; const ia = _CH_ORDER.indexOf(a.id), ib = _CH_ORDER.indexOf(b.id); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); }); // sort_order เป็นหลัก (reorder ▲▼/ลากได้จริง) → _CH_ORDER เป็น fallback ตอน tie

  // Campaigns
  const campaigns = memoSection('campaigns', [raw.campaigns, raw.tasks], () => (raw.campaigns || []).map(c => ({
    id: c.id,
    name: c.name,
    color: c.color,
    start: c.start_date ? thaiDate(c.start_date) : '',
    end: c.end_date ? thaiDate(c.end_date) : '',
    startISO: c.start_date || '', endISO: c.end_date || '',   // ISO เต็ม (กันปีหาย)
    status: c.status || 'upcoming',
    channels: c.channels || [],
    tasks: (raw.tasks || []).filter(t => t.camp === c.id).length,
  })));

  // Tasks
  const _ccByTask = {}; // จำนวนคอมเมนต์ต่อ task (จาก view) → ป้าย 💬 บนการ์ด
  (raw.commentCounts || []).forEach(c => { if (c.task_id) _ccByTask[c.task_id] = Number(c.comment_count || 0); });
  const tasks = memoSection('tasks', [raw.tasks, raw.commentCounts], () => (raw.tasks || []).map(t => ({
    id: t.id,
    title: t.title,
    detail: t.detail || '',
    date: thaiDate(t.date),       // ไทยย่อ (แสดงผล)
    dateISO: t.date || '',        // ISO เต็ม (ใช้คำนวณ/แก้ไข — กันปีหายข้ามปี)
    responsible: String(t.responsible || '').split(',').map(s => s.trim()).filter(Boolean),
    camp: t.camp || '',
    brandIds: Array.isArray(t.brand_ids) ? t.brand_ids : [],   // แบรนด์ของงาน (เลือกหลายอันจากแบรนด์โครงการ · migration 20260808)
    flow: t.flow_id || '',        // โครงการ/บอร์ดที่งานสังกัด ('' = โครงการทั่วไป built-in)
    status: t.status || 'todo',
    channel: t.channel || '',
    priority: t.priority || 'medium',   // ความสำคัญ: low|medium|high
    dateEnd: t.date_end || '',          // วันสิ้นสุด (ISO) — คู่กับ date = ช่วง
    tags: Array.isArray(t.tags) ? t.tags : [],   // แท็กในงาน (ต้องรัน migration 20260712 ถึงจะเก็บได้)
    reminderDays: Number(t.reminder_days || 1),
    subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],  // เช็คลิสต์/งานย่อย [{id,text,done}] (migration 20260730)
    sortOrder: Number(t.sort_order || 0),         // ลำดับการ์ดในคอลัมน์ (migration 20260730)
    commentCount: _ccByTask[t.id] || 0,           // จำนวนคอมเมนต์ (view · migration 20260801)
    rowVersion: t.row_version,                    // optimistic concurrency (migration 20260716 · undefined ก่อน migrate → guard ข้าม)
  })));

  // Brands (ป้าย/จัดกลุ่มโครงการ) — เลียนแบบ channels (camelCase + sort)
  const brands = memoSection('brands', [raw.brands], () => (raw.brands || []).map(b => ({
    id: b.id, name: b.name, color: b.color || '#6b5ce0',
    logoUrl: b.logo_url || '', tagline: b.tagline || '', sortOrder: b.sort_order || 0,
  })).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));

  // Flows (board วางแผนงานหลายอัน) — parse jsonb/array columns
  const flows = memoSection('flows', [raw.flows], () => (raw.flows || []).map(f => ({
    id: f.id, name: f.name, color: f.color || '#6b5ce0', icon: f.icon || '',
    description: f.description || '', brandId: f.brand_id || '',
    brandIds: Array.isArray(f.brand_ids) && f.brand_ids.length ? f.brand_ids : (f.brand_id ? [f.brand_id] : []),
    campaignIds: Array.isArray(f.campaign_ids) ? f.campaign_ids : [],
    statuses: Array.isArray(f.statuses) ? f.statuses : [],   // ว่าง = ใช้ดีฟอลต์ kanbanMeta
    members: Array.isArray(f.members) ? f.members : [],
    visibility: f.visibility || 'shared', owner: f.owner || '',
    defaultView: f.default_view || 'kanban', archived: !!f.archived,
    barColorSource: f.bar_color_source || 'campaign',  // แหล่งสีแถบ/ชิปงาน (graceful ถ้าคอลัมน์ยังไม่มี)
    coverUrl: f.cover_url || '',                       // รูปปกการ์ด (graceful ถ้าคอลัมน์ยังไม่มี)
    shareToken: f.share_token || '', shareEnabled: !!f.share_enabled,  // แชร์ลิงก์อ่านอย่างเดียว
    sortOrder: f.sort_order || 0,
  })).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));

  // สินค้า/ล็อต ยุคเก่า (tmk_products) ลบถาวร PART 118 — เลิกโหลดตั้งแต่ PART 116 · หน้า "สินค้า" ใช้ tmk_shirt_catalog แทน
  const products = [];

  // dailyAll — ทุกแถว daily ทุกเดือน + รายละเอียดต่อช่องทาง (สำหรับ dashboard รายเดือน)
  const _chIds = (raw.channels || []).map(c => c.id);
  const dailyAll = (raw.daily || []).filter(d => !d.deleted_at).map(d => {
    const [yy, mm, dd] = String(d.date).split('-').map(Number);
    const cj = (d.channels && typeof d.channels === 'object') ? d.channels : {};
    const ch = {};
    _chIds.forEach(id => {
      const j = cj[id] || {};
      const legacyCol = DAILY_COL[id];
      ch[id] = {
        rev: Number(j.rev != null ? j.rev : (legacyCol ? d[legacyCol] : 0)) || 0,
        ord: Number(j.ord || 0), ad: Number(j.ad || 0), inq: Number(j.inq || 0),
        newC: Number(j.newC || 0), oldC: Number(j.oldC || 0),
      };
    });
    return { date: d.date, year: yy + 543, month: mm, day: dd, adSpend: Number(d.ad_spend || 0), replyMin: Number(d.avg_reply_minutes || 0), note: d.note || '', dayName: d.day_name || '', ch };
  });

  // Daily sales (เดือนปัจจุบัน) — derive จาก channels jsonb (ตรงกับ computeMonth, ไม่ใช้ legacy)
  const _cyM = today.yearBE, _cmM = today.month;
  const _curDaily = dailyAll.filter(d => d.year === _cyM && d.month === _cmM);
  const dailyMonth = _curDaily.map(d => ({ d: d.day, rev: round2(Object.values(d.ch).reduce((s, c) => s + (c.rev || 0), 0)) }));
  const dailyLog = [..._curDaily].sort((a, b) => b.day - a.day).slice(0, 7).map(d => ({
    date: thaiDate(d.date),
    day: d.dayName,
    shopee: d.ch.shopee?.rev || 0,
    tiktok: d.ch.tiktok?.rev || 0,
    lazada: d.ch.lazada?.rev || 0,
    facebook: d.ch.facebook?.rev || 0,
    line: d.ch.line?.rev || 0,
    crm: d.ch.crm?.rev || 0,
    total: round2(Object.values(d.ch).reduce((s, c) => s + (c.rev || 0), 0)), // รวม "ทุกช่องทาง" (รวมช่องที่เพิ่มเอง) — ตรงกับปฏิทิน
    ad: d.adSpend,
    note: d.note || '',
  }));

  // Monthly history → 3 เดือนล่าสุด + YoY
  const monthly = raw.monthly || [];
  // ใช้ปี/เดือนจริง (พ.ศ.) เป็นฐาน
  const currentYear = today.yearBE;
  const currentMonth = today.month;
  // overlay เดือนปัจจุบันด้วยยอดสดจาก daily (ให้ month3/YoY/quarter ตรงกับ dashboard ไม่ใช่ ฿0)
  {
    const liveMTD = round2(Object.values(dailyAgg).reduce((s, c) => s + (c.rev || 0), 0));
    const liveORD = Object.values(dailyAgg).reduce((s, c) => s + (c.ord || 0), 0);
    const liveAD = round2(dailyAdTotal);
    // เดือนปัจจุบันใช้ผลรวมรายวันเสมอ (รวมกรณี 0) — ลบยอดทั้งเดือนแล้ว quarter/YoY เป็น ฿0 ตาม ไม่ค้างค่าเก่า
    {
      const cur = monthly.find(m => Number(m.year) === currentYear && Number(m.month) === currentMonth);
      if (cur) {
        // assign (ไม่ใช่ max) → เดือนปัจจุบัน = ผลรวมรายวันเสมอ; แก้รายวันลดลงค่าก็ลดตาม ไม่ค้างสูงเพี้ยน
        cur.actual = liveMTD;
        cur.orders = liveORD;
        cur.ad_spend = liveAD;
      } else {
        monthly.push({ year: currentYear, month: currentMonth, month_th: THAI_MONTH[currentMonth - 1], actual: liveMTD, orders: liveORD, ad_spend: liveAD, projected: 0, messages: 0, meta: {} });
      }
    }
  }
  // 3 เดือนล่าสุดแบบ wrap ข้ามปี (ม.ค./ก.พ. ต้องดึง พ.ย./ธ.ค. ปีก่อนด้วย) — เดิม pin year เดียวทำให้ตกแท่ง
  const month3 = [];
  for (let off = 2; off >= 0; off--) {
    let mo = currentMonth - off, yr = currentYear;
    while (mo < 1) { mo += 12; yr -= 1; }
    const r = monthly.find(m => m.year === yr && m.month === mo);
    month3.push({ m: THAI_MONTH[mo - 1], actual: Number(r?.actual || 0), proj: Number(r?.projected || 0) });
  }
  // YoY: 6 เดือนของปีปัจจุบัน + ปีก่อน
  const lastYear = currentYear - 1;
  const yoy = [];
  for (let mo = 1; mo <= 6; mo++) {
    const cur = monthly.find(m => m.year === currentYear && m.month === mo);
    const prev = monthly.find(m => m.year === lastYear && m.month === mo);
    if (cur || prev) {
      yoy.push({
        m: THAI_MONTH[mo - 1],
        y25: Number(prev?.actual || 0),
        y26: Number(cur?.actual || 0),
      });
    }
  }

  // FB metrics
  const fbRaw = raw.fbMetrics || {};
  const fb = {
    revenue: Number(fbRaw.revenue || 0),
    spend: Number(fbRaw.spend || 0),
    inquiries: Number(fbRaw.inquiries || 0),
    orders: Number(fbRaw.orders || 0),
    newCust: Number(fbRaw.new_cust || 0),
    oldCust: Number(fbRaw.old_cust || 0),
    avgReplyMinutes: Number(fbRaw.avg_reply_minutes || 0),
  };
  fb.roas = fb.spend > 0 ? fb.revenue / fb.spend : 0;
  fb.acos = fb.revenue > 0 ? (fb.spend / fb.revenue) * 100 : 0;
  fb.conv = fb.inquiries > 0 ? (fb.orders / fb.inquiries) * 100 : 0;
  fb.aov = fb.orders > 0 ? fb.revenue / fb.orders : 0;
  fb.cpInq = fb.inquiries > 0 ? fb.spend / fb.inquiries : 0;
  fb.cpOrd = fb.orders > 0 ? fb.spend / fb.orders : 0;
  fb.cac = fb.newCust > 0 ? fb.spend / fb.newCust : 0;
  // FB message trend ย้ายไปคำนวณใน computeMonth (ตามเดือนที่เลือก) — global ตัวนี้ไม่ใช้แล้ว

  // Audit log
  const audit = memoSection('audit', [raw.audit], () => (raw.audit || []).map(a => {
    let details = {};
    try { details = typeof a.details === 'string' ? JSON.parse(a.details) : (a.details || {}); }
    catch { /* ignore */ }
    // type มาจาก a.action ตรงๆ (robust) — map action → หมวดที่ UI ใช้ (create/update/delete)
    const ACTION_TYPE = { create: 'create', update: 'update', delete: 'delete', purge: 'delete', restore: 'create', move: 'update', export: 'update' };
    const type = ACTION_TYPE[a.action] || (details.summary?.includes('สร้าง') ? 'create' : details.summary?.includes('ลบ') ? 'delete' : 'update');
    return {
      user: a.user_email?.split('@')[0] || 'system',
      userEmail: a.user_email || '', // อีเมลเต็ม — ให้ฟีดหน้าหลัก resolve staff (ชื่อ/สี avatar) ได้เหมือนหน้าบันทึกกิจกรรม
      action: a.action,
      type,
      entity: a.entity_type || details.entityType || 'system',
      entityId: a.entity_id ?? details.entityId ?? '',
      severity: a.severity || (/(delete|purge)/.test(a.action || '') ? 'warn' : 'info'), // คอลัมน์ severity (PART 54) · fallback เดา
      name: details.entityName || '',
      time: new Date(a.created_at).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }),
      ts: a.created_at, // วันที่ดิบ (ISO) — สำหรับจัดกลุ่มตามวัน + เวลาแบบ relative ในหน้าหลัก
      summary: details.summary || a.action,
      fields: Array.isArray(details.fields) ? details.fields : null,   // ค่าที่กรอก/บันทึก
      changes: Array.isArray(details.changes) ? details.changes : null, // สิ่งที่เปลี่ยน ก่อน→หลัง
      data: details.data || null, // ข้อมูลโครงสร้าง (machine-readable) — สำหรับรายงาน/กู้คืน
      flowId: a.flow_id || details.flowId || '', // ผูกโครงการ (คอลัมน์ flow_id ใหม่ · fallback details · graceful)
    };
  }));

  // Duties (หน้าที่)
  const duties = memoSection('duties', [raw.duties], () => (raw.duties || []).map(d => ({
    id: d.id,
    name: d.name,
    color: d.color || '#3b82f6',
    description: d.description || '',
    sortOrder: d.sort_order || 0,
  })));
  const dutyById = Object.fromEntries(duties.map(d => [d.id, d]));

  // Roles + Staff — link duty via duty_id
  const enrichedRoles = (raw.roles || []).map(r => {
    const duty = r.duty_id ? dutyById[r.duty_id] : null;
    return { ...r, dutyName: duty?.name || r.department || '', dutyColor: duty?.color || r.color };
  });
  const { roles, staff } = mapRolesAndStaff(enrichedRoles, raw.staff || []);

  // PO
  // Color/Size mix
  const colorMix = (raw.colorMix || []).map(c => ({
    name: c.name, hex: c.hex, pct: Number(c.pct || 0),
  }));
  const sizeMix = (raw.sizeMix || []).map(s => ({
    s: s.size, pct: Number(s.pct || 0),
  }));

  // Computed aggregates (ปัดเงินเป็นสตางค์ — ตัด noise float จากการบวก)
  const MTD = round2(channels.reduce((s, c) => s + c.actual, 0));
  const ORD = channels.reduce((s, c) => s + c.orders, 0);
  // ค่าแอดรวมจาก daily จริง (fallback เป็นผลรวม per-channel ถ้าไม่มี daily)
  const AD  = round2(dailyAdTotal || channels.reduce((s, c) => s + c.ad, 0));
  const NEW_REV = channels.reduce((s, c) => s + c.newRev, 0);
  const OLD_REV = channels.reduce((s, c) => s + c.oldRev, 0);
  const NEW_C = channels.reduce((s, c) => s + c.newCust, 0);
  const OLD_C = channels.reduce((s, c) => s + c.oldCust, 0);
  const PACE_TGT = DAYS > 0 ? (TARGET / DAYS) * DAY : 0;          // ไม่ปัดเศษ — ค่าจริง (ปัดเฉพาะตอนแสดงผล)
  const PACE_PCT = PACE_TGT > 0 ? (MTD / PACE_TGT) * 100 : 0;
  const RUN = DAY > 0 ? (MTD / DAY) * DAYS : 0;                   // ไม่ปัดเศษ
  const AOV = ORD > 0 ? MTD / ORD : 0;
  const ACOS_TOT = MTD > 0 ? (AD / MTD) * 100 : 0;
  // CLV เฉลี่ย — weighted avg ของ avg_clv แต่ละ segment ตามจำนวนลูกค้า (0 ถ้ายังไม่มี segment)
  const _segs = raw.segments || [];
  const _segCount = _segs.reduce((s, x) => s + Number(x.count || 0), 0);
  const CLV = _segCount > 0 ? (_segs.reduce((s, x) => s + Number(x.avg_clv || 0) * Number(x.count || 0), 0) / _segCount) : 0; // ไม่ปัดเศษ

  // raw monthly สำหรับ quarter view (target/actual จริงต่อเดือน/ปี)
  const monthlyRaw = monthly.map(m => ({
    month: Number(m.month), year: Number(m.year), monthTh: m.month_th,
    target: Number(m.target || 0), actual: Number(m.actual || 0),
    projected: Number(m.projected || 0), orders: Number(m.orders || 0),
    adSpend: Number(m.ad_spend || 0), newCust: Number(m.new_cust || 0),
    messages: Number(m.messages || 0), meta: m.meta || {},
  }));
  // ซิงค์เดือนปัจจุบันด้วยยอดรายวัน (live) — monthly_history.actual มักยังไม่อัปเดตจาก daily
  // → หน้าไตรมาส / กราฟ 3 เดือน / YoY แสดงเดือนนี้ตรงกับ dashboard
  { // เดือนปัจจุบัน = ผลรวมรายวันเสมอ (รวมกรณี 0) → ไตรมาส/3 เดือน/YoY ตรงกับ dashboard ไม่ค้างค่าเก่า
    const _cur = monthlyRaw.find(m => m.year === currentYear && m.month === currentMonth);
    if (_cur) {
      _cur.actual = MTD;
      _cur.orders = ORD;
      _cur.adSpend = AD;
    } else {
      monthlyRaw.push({ month: currentMonth, year: currentYear, monthTh: THAI_MONTH[currentMonth - 1],
        target: TARGET, actual: MTD, projected: 0, orders: ORD, adSpend: AD, newCust: NEW_C, messages: 0, meta: {} });
    }
  }

  // ออเดอร์/ลูกค้า ยุคเก่า (tmk_orders / tmk_customers) ลบถาวร PART 118 — Sale ใช้ tmk_mp_orders / tmk_mp_customers
  const orders = [], customers = [];

  return {
    consts: { TARGET, DAY, DAYS, ACOS_CEIL, AD_BUDGET, current_month: currentMonth, current_year: currentYear },
    channels, campaigns, tasks, brands, flows, products, dailyMonth, dailyLog, month3, yoy, monthly: monthlyRaw, dailyAll,
    colorMix, sizeMix, staff, fb, audit, roles, duties, orders, customers,
    adCampaigns: (raw.adCamps || []).map(c => ({
      id: c.id,
      name: c.name,
      platform: c.platform,
      budget: Number(c.budget || 0),
      spent: Number(c.spent || 0),
      revenue: Number(c.revenue || 0),   // กันแก้แล้ว revenue หาย (กลายเป็น 0)
      roas: Number(c.roas || 0),
      acos: Number(c.acos || 0),         // กันแก้แล้ว acos หาย (กลายเป็น 0)
      status: c.status || 'live',
      goal: c.goal || 'Conversion',   // กันแก้แล้ว goal หาย
      startDate: c.start_date || null,
      endDate: c.end_date || null,
    })),
    segments: (raw.segments || []).map(s => ({
      name: s.name,
      count: Number(s.count || 0),
      revPct: Number(s.rev_pct || 0),
      color: s.color,
      clv: Number(s.avg_clv || 0),
    })),
    computed: { MTD, ORD, AD, NEW_REV, OLD_REV, NEW_C, OLD_C, PACE_TGT, PACE_PCT, RUN, AOV, ACOS_TOT, CLV },
  };
}
