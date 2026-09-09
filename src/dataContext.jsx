/* ============================================================
   TMK Operation — Data Context (Supabase only — no mock)
   ============================================================
   - โหลดทั้งหมด 15 ตารางจาก Supabase ตอน mount
   - Mutate TMK object in-place เพื่อให้ views ที่ import { TMK } เห็นค่าจริง
   - Force re-render ผ่าน React state เมื่อ data มา
   - Realtime subscription: อัปเดตอัตโนมัติเมื่อ DB เปลี่ยน
   ============================================================ */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { TMK } from './data.js';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient.js';
import { toast } from './lib/appBus.js';
import { getToday } from './lib/dateUtils.js';
import { computeMonthPure } from './lib/computeMonthPure.js';
import { mapToTMK, clearMapMemo } from './lib/mapToTMK.js';
import { applyMapped } from './lib/applyTMK.js';
import { rtDiag } from './realtime/diagnostics.js';

const DataContext = createContext();





// Query map ต่อตาราง — แยกออกมาเพื่อใช้ซ้ำใน refreshTables (per-table refresh)
// จุดเดียวเปลี่ยน → ทั้ง loadAllTables และ refreshTables เห็นพร้อมกัน
// หน้าต่างโหลดยอดรายวัน (เดือน) — PART 92: ขยาย 13→37 เดือน กันยอดเดือนเก่า "หาย" เมื่อหลุดหน้าต่าง
// (tmk_daily_sales = 1 แถว/วัน แถวเล็ก ~1,100 แถว/3 ปี → egress แทบไม่กระทบ) · daily-first ยังคุมให้ใช้รายวันเสมอเมื่อมีข้อมูล
// ปรับค่าเดียวนี้ถ้าต้องการนานกว่านี้ (เช่น 61 = 5 ปี) · เดือนที่เก่ากว่านี้ค่อย fallback tmk_monthly_history.actual
const DAILY_WINDOW_MONTHS = 37;
// เพดานแถวของตารางที่โหลด "เฉพาะล่าสุด" — export ให้ view เอาไปขึ้นป้ายบอกขอบเขตข้อมูล
// เดิมตัดเงียบ ผู้ใช้ค้นของเก่าไม่เจอแล้วนึกว่าระบบไม่มีข้อมูล = เสียความเชื่อมั่นในตัวเลข
export const ROW_LIMITS = { customers: 150, orders: 200, audit: 200 };
const dailyFromDate = () => { const d = new Date(); d.setMonth(d.getMonth() - DAILY_WINDOW_MONTHS); return d.toISOString().slice(0, 10); };
const QUERIES = {
  settings:    () => supabase.from('tmk_settings').select('*').eq('id', 'main').maybeSingle(),
  channels:    () => supabase.from('tmk_channels').select('*').is('deleted_at', null).order('sort_order'),
  campaigns:   () => supabase.from('tmk_campaigns').select('*').is('deleted_at', null).order('sort_order', { nullsFirst: false }).order('start_date'),
  tasks:       () => supabase.from('tmk_tasks').select('*').is('deleted_at', null).order('date'),
  brands:      () => supabase.from('tmk_brands').select('*').is('deleted_at', null).order('sort_order'),
  flows:       () => supabase.from('tmk_flows').select('*').is('deleted_at', null).order('sort_order'),
  audit:       () => supabase.from('tmk_audit_logs').select('id,user_email,action,details,created_at,flow_id,entity_type,entity_id,severity').order('created_at', { ascending: false }).limit(ROW_LIMITS.audit),
  roles:       () => supabase.from('tmk_user_roles').select('*').is('deleted_at', null),
  staff:       () => supabase.from('tmk_staff').select('*').is('deleted_at', null).order('joined_at'),
  duties:      () => supabase.from('tmk_duties').select('*').is('deleted_at', null).order('sort_order'),
  // จำกัด DAILY_WINDOW_MONTHS เดือนล่าสุด — เดือนเก่ากว่านั้น computeMonth fallback ไป tmk_monthly_history.actual
  daily:       () => supabase.from('tmk_daily_sales').select('date,day_name,channels,ad_spend,avg_reply_minutes,note,deleted_at,shopee,tiktok,lazada,facebook,line_oa,crm').gte('date', dailyFromDate()).order('date'),
  adCamps:     () => supabase.from('tmk_ad_campaigns').select('*').is('deleted_at', null).order('start_date'),
  // PART 109 (ลด egress): เลิกโหลดตารางที่ไม่มีหน้าไหนใช้แล้ว — ไม่มี consumer เหลือใน src/
  //   segments (กลุ่มลูกค้า · ตัดทิ้งตาม D12) · fbMetrics (D16) · colorMix/sizeMix (หน้าที่ใช้ถูกลบไปแล้ว)
  //   mapToTMK null-safe อยู่แล้ว (raw.X || []) → ไม่ต้องแก้ที่อื่น · ถ้าจะใช้อีกให้เพิ่ม query กลับมาที่นี่
  monthly:     () => supabase.from('tmk_monthly_history').select('*').order('year').order('month'),
  /* PART 116 — เลิกโหลด tmk_products / tmk_customers / tmk_orders ตอนเปิดแอป
     ทั้ง 3 ตัวเป็น "ระบบสินค้า/ออเดอร์ยุคเก่า" ที่ถอด section ไปแล้ว (PART 35) — ไม่มีหน้าไหนแสดงผลอีก
     ที่เหลืออ่านมันมีแค่ Spotlight (ย้ายไปค้นตารางจริงตอนพิมพ์แล้ว) และ modal เก่าที่กดไม่ถึงแล้ว
     mapToTMK null-safe อยู่แล้ว (raw.X || []) → TMK.products/orders/customers = [] ไม่พัง
     ถ้าจะใช้ใหม่: เพิ่ม query กลับมาที่นี่ + ใส่ชื่อตารางกลับใน channelTables/POLL_TABLES */
  commentCounts: () => supabase.from('tmk_task_comment_counts').select('task_id,comment_count'),
};
// ตาราง Supabase → key ใน raw/QUERIES (สำหรับแมป realtime event)
const TABLE_KEY = {
  tmk_channels: 'channels', tmk_campaigns: 'campaigns', tmk_tasks: 'tasks', tmk_brands: 'brands', tmk_flows: 'flows',
  tmk_settings: 'settings', tmk_user_roles: 'roles', tmk_staff: 'staff', tmk_duties: 'duties',
  tmk_daily_sales: 'daily', tmk_ad_campaigns: 'adCamps', tmk_monthly_history: 'monthly',
  // (segments / fbMetrics / colorMix / sizeMix เลิกโหลดแล้ว — ไม่ต้อง map ชื่อไว้)
};
// ตารางที่กระทบ derived (orderCount/totalSpent) → ต้อง refresh view ด้วย
// ตารางที่ใช้เฉพาะหน้า Sales/แคตตาล็อก — ไม่โหลดตอนเปิดแอป · โหลดเมื่อกดเข้า section (ensureLoaded) · mapToTMK null-safe (raw.X || [])
// หมายเหตุ: audit ไม่ defer (หน้าหลักโชว์ "อัพเดทล่าสุด") · monthly ไม่ defer (เป็นเป้ายอด)
const DEFERRED = new Set(['adCamps']);

// โหลดทุกตารางพร้อมกัน (ครั้งแรก) — เรียก QUERIES ทั้งชุด
async function loadAllTables() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase ยังไม่ได้ตั้งค่า (.env)');
  }

  const mainKeys = Object.keys(QUERIES).filter(k => k !== 'commentCounts' && !DEFERRED.has(k));
  const tables = Object.fromEntries(mainKeys.map(k => [k, QUERIES[k]()]));

  const keys = Object.keys(tables);
  // ยิงทุกตารางพร้อมกัน + commentCounts (optional) ในชุดเดียว
  // (customerTotals ถูกตัดออกพร้อม tmk_orders/tmk_customers — PART 116)
  const [results, ccRes] = await Promise.all([
    Promise.all(Object.values(tables)),
    QUERIES.commentCounts(),
  ]);

  // ตรวจ errors — log ตารางไหนล้ม (อาจจะยังไม่ได้ run migration / สิทธิ์ RLS)
  const result = {};
  const failed = [];
  results.forEach((r, i) => {
    const key = keys[i];
    if (r.error) {
      console.warn(`⚠️ tmk_${key}: ${r.error.message}`);
      /* ⚠️ เดิมยกเว้น flows/brands ทั้งหมด (เผื่อยังไม่ migrate) → อ่านพลาดจริงก็เงียบ
         ผลคือ TMK.flows = [] → sidebar เหลือ "งานทั่วไป" → App เห็นว่า activeFlow ไม่อยู่ในลิสต์
         → เขียนทับ localStorage['tmk-flow'] → โครงการที่เปิดค้างไว้หายถาวร และงานที่สร้างตอนนั้นลงผิดโครงการ
         แยกให้ถูก: "ตารางยังไม่มี" (42P01) = เงียบได้ · error อื่น (เน็ต/RLS/5xx) = ต้องแจ้ง */
      const tableMissing = r.error.code === '42P01' || /does not exist|relation .* does not exist/i.test(r.error.message || '');
      if (!((key === 'brands' || key === 'flows') && tableMissing)) failed.push(key);
      result[key] = Array.isArray(r.data) ? [] : null;
    } else {
      result[key] = r.data;
    }
  });
  if (failed.length) result.__errors = failed; // ส่งต่อให้ load() แจ้งผู้ใช้ (กันตารางพังดูเหมือน "ไม่มีข้อมูล")

  // จำนวนคอมเมนต์ต่อ task (ป้าย 💬 บนการ์ด) — optional · ก่อนรัน migration view = เงียบ
  if (!ccRes.error && Array.isArray(ccRes.data)) result.commentCounts = ccRes.data;

  return result;
}



// แคมเปญแอดอยู่ในเดือนที่เลือกหรือไม่ (ช่วงวันที่ทับซ้อนเดือน) — ไม่มีวันที่ = แสดงทุกเดือน
export function adCampaignInMonth(c, monthIdx0, yearBE) {
  if (!c.startDate && !c.endDate) return true;
  const yearCE = yearBE - 543;
  const mStart = new Date(yearCE, monthIdx0, 1);
  const mEnd = new Date(yearCE, monthIdx0 + 1, 0, 23, 59, 59);
  const s = c.startDate ? new Date(c.startDate) : mStart;
  const e = c.endDate ? new Date(c.endDate) : mEnd;
  return s <= mEnd && e >= mStart;
}
// คำนวณข้อมูลของ "เดือนที่เลือก" จาก TMK.dailyAll + TMK.monthly + TMK.channels
// ใช้ใน SalesView เพื่อให้เปลี่ยนเดือนแล้วข้อมูลเปลี่ยนตาม (อดีต/ปัจจุบัน/อนาคต)
export function computeMonth(monthIdx0, yearBE) {
  return computeMonthPure(monthIdx0, yearBE, {
    dailyAll: TMK.dailyAll, monthly: TMK.monthly, channels: TMK.channels,
    clv: TMK.computed.CLV, today: getToday(),
  });
}

// Mutate TMK in-place — views ที่ import TMK จะเห็นค่าใหม่
// ARCH-1: logic การ mutate แยกไป lib/applyTMK.js (pure · testable) — mutateTMK คงไว้เป็น wrapper บาง (call-site เดิมไม่ต้องแก้)
function mutateTMK(mapped) {
  applyMapped(TMK, mapped);
}

// หมายเหตุ: บันทึก snapshot มูลค่า/จำนวนคลังรวมรายวัน — เลิกใช้ถาวรแล้ว (2026-08-15)
// เดิมเขียนฝั่ง client ทุกครั้งที่โหลดแอป → ย้ายไป server cron (P3-6c) → ล่าสุดยกเลิกทั้งหมด
// (หน้าคลัง/สต็อกถูกลบตั้งแต่ PART 35 · ไม่มีใครอ่านตาราง tmk_inventory_snapshots แล้ว)

export function DataProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0); // bump on reload → forces re-render
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false); // กันโหลดซ้อน (window.__reload + realtime ยิงพร้อมกัน)
  const pendingRef = useRef(false);            // จอง "full reload" (มาจาก load ซ้อนเท่านั้น)
  const pendingTablesRef = useRef(new Set());  // จอง per-table refresh ที่เข้ามาระหว่าง in-flight → ระบายเฉพาะตารางนั้น (ไม่ full load)
  const lastRefreshAtRef = useRef({});         // เวลาที่ตารางถูก refresh จาก "การเซฟของเครื่องนี้" — ให้ realtime ข้าม echo ตัวเอง
  const rawRef = useRef(null); // baseline ของทุกตาราง — ใช้สำหรับ per-table refresh (ไม่ต้องโหลดใหม่ทั้งชุด)

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- ต้องคง useCallback: load/refreshTables อ้างอิงกันเป็นวง (load ระบายคิวผ่าน refreshTablesRef) และเป็น deps ของ effect realtime + ค่าใน context · identity เปลี่ยน = ต่อ WS ใหม่/รีโหลดทั้งแอป
  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setError('Supabase ยังไม่ได้ตั้งค่า');
      return;
    }
    if (inFlightRef.current) { pendingRef.current = true; return; } // กำลังโหลดอยู่ → จองโหลดอีกรอบหลังเสร็จ
    inFlightRef.current = true;
    try {
      setLoading(true);
      const raw = await loadAllTables();
      if (!mountedRef.current) return;
      rawRef.current = raw; // เก็บ baseline สำหรับ refreshTables (per-table refresh ที่จะใช้แทน full reload)
      const mapped = mapToTMK(raw);
      mutateTMK(mapped);
      setError(null);
      setVersion(v => v + 1);
      if (raw.__errors?.length) toast(`บางตารางโหลดไม่สำเร็จ: ${raw.__errors.join(', ')} — อาจต้องรัน migration หรือสิทธิ์ไม่พอ`, 'warn');
      console.log('✅ Loaded from Supabase:', {
        channels: TMK.channels.length,
        campaigns: TMK.campaigns.length,
        tasks: TMK.tasks.length,
        daily: TMK.dailyMonth.length,
        target: TMK.consts.TARGET,
        MTD: TMK.computed.MTD,
      });
    } catch (e) {
      console.error('❌ Load failed:', e);
      if (mountedRef.current) setError(e.message);
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
      if (pendingRef.current && mountedRef.current) { pendingRef.current = false; pendingTablesRef.current.clear(); load(); } // มีคำขอค้าง → โหลดอีกรอบให้ได้ข้อมูลล่าสุด
      else if (pendingTablesRef.current.size && mountedRef.current) { const ts = [...pendingTablesRef.current]; pendingTablesRef.current.clear(); refreshTablesRef.current?.(ts, { fromRealtime: true }); } // per-table ค้างระหว่าง full load → ระบายเฉพาะตารางนั้น (กันพลาดการเปลี่ยนแปลงระหว่างโหลด)
    }
  }, []);

  // Per-table refresh — ตารางไหนเปลี่ยน fetch ใหม่เฉพาะตารางนั้น แล้วยัดกลับเข้า raw cache + map ใหม่ + bump version
  // ลด bandwidth/render churn เมื่อใครเซฟอะไรก็ตาม (ไม่ต้องดาวน์โหลด 20 ตารางใหม่ทุกครั้ง)
  // — ไม่มี baseline หรือ list มี customers/orders ที่ตัวรวม view ต้องอัปเดต → fallback ไป full load
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- เหตุผลเดียวกับ load ด้านบน (identity ต้องคงที่ · เป็น dep ของ effect realtime และค่าใน context)
  const refreshTables = useCallback(async (tableNames, opts = {}) => {
    const keys = [...new Set((tableNames || []).map(t => TABLE_KEY[t]).filter(k => k && QUERIES[k]))];
    const needCounts = (tableNames || []).includes('tmk_task_comments'); // คอมเมนต์เปลี่ยน → รีเฟรชจำนวน 💬 บนการ์ด
    if (!rawRef.current || (!keys.length && !needCounts)) { return load(); }
    if (inFlightRef.current) { (tableNames || []).forEach(t => pendingTablesRef.current.add(t)); return; } // กำลังโหลด → จองเฉพาะตารางที่ขอ (ระบายด้วย per-table refresh ไม่ใช่ full load)
    inFlightRef.current = true;
    // จดเวลาเฉพาะการเซฟของเครื่องนี้ (ไม่ใช่ flush จาก realtime) → ให้ handler ข้าม echo event ของตัวเอง 1 ครั้ง
    if (!opts.fromRealtime) { const now = Date.now(); (tableNames || []).forEach(t => { lastRefreshAtRef.current[t] = now; }); }
    try {
      const results = await Promise.all(keys.map(k => QUERIES[k]()));
      if (!mountedRef.current) return;
      /* ⚠️ error ที่นี่เคยถูกข้ามเงียบทั้งหมด — pendingTables ถูกเคลียร์ไปก่อนยิง query แล้ว
         → event realtime ของตารางนั้นหายไปเลย หน้าจอค้างเลขเก่าโดยไม่มีสัญญาณ
           และจะไม่อัปเดตอีกจนกว่าจะมี event ตัวถัดไปของตารางเดียวกัน (โหมด realtime ไม่มี poll)
         ตอนนี้: คิวตารางที่ล้มกลับเข้า pending เพื่อให้รอบถัดไปลองใหม่ + แจ้งผู้ใช้ */
      const refetchFailed = [];
      results.forEach((r, i) => {
        if (!r.error) { rawRef.current[keys[i]] = r.data; rtDiag.refetch(keys[i], r.data?.length || 0); } // Phase 0 baseline: นับ per-table refetch + rows (dev-only)
        else { refetchFailed.push(keys[i]); console.warn(`⚠️ refresh tmk_${keys[i]}: ${r.error.message}`); }
      });
      if (refetchFailed.length) {
        const nameOf = Object.fromEntries(Object.entries(TABLE_KEY).map(([t, k]) => [k, t]));
        refetchFailed.forEach(k => { const t = nameOf[k]; if (t) pendingTablesRef.current.add(t); });
        toast(`อัปเดตข้อมูลบางส่วนไม่สำเร็จ (${refetchFailed.join(', ')}) — ตัวเลขบนจออาจยังเป็นของเก่า`, 'warn');
      }
      if (needCounts) {
        const cc = await QUERIES.commentCounts();
        if (!cc.error && Array.isArray(cc.data)) rawRef.current.commentCounts = cc.data;
      }
      const mapped = mapToTMK(rawRef.current);
      mutateTMK(mapped);
      setVersion(v => v + 1);
    } catch (e) {
      console.warn('per-table refresh failed, fallback to full load:', e?.message);
      await load();
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current && mountedRef.current) { pendingRef.current = false; pendingTablesRef.current.clear(); load(); } // มี full reload ค้าง → โหลดเต็ม (ครอบทุกตาราง)
      else if (pendingTablesRef.current.size && mountedRef.current) { const ts = [...pendingTablesRef.current]; pendingTablesRef.current.clear(); refreshTables(ts, { fromRealtime: true }); } // per-table ค้าง → ระบายเฉพาะตารางนั้น (เดิม fallback เป็น full load 20 ตาราง)
    }
    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- dep [load] ต้องคงไว้ตามเดิม (refreshTables เรียก load() เป็น fallback) · compiler มองว่า load ถูก "mutate" เพราะ refreshTablesRef ผูกวงกลับไปหา load — ไม่ใช่การแก้ค่าจริง
  }, [load]);
  // ให้ load() (นิยามก่อนหน้า) เรียกระบายคิว per-table ได้ — เขียน ref ใน effect (ไม่เขียนตอน render)
  // effect นี้อยู่เหนือ effect โหลดข้อมูล → รันก่อนตอน mount ค่า ref จึงพร้อมก่อน load() ถูกเรียก
  const refreshTablesRef = useRef(null);
  useEffect(() => { refreshTablesRef.current = refreshTables; }, [refreshTables]);

  /* Optimistic patch — ยัดแถวที่เพิ่งเซฟเข้า cache "ทันที" โดยไม่รอ network รอบสอง
     เดิม: กดบันทึก → upsert → refresh (ดึงตารางใหม่ทั้งตาราง) → ค่อยเห็นผล = มีช่วง 200-400ms
     ที่หน้าจอยังเป็นค่าเก่าทั้งที่ toast ขึ้น "สำเร็จ" แล้ว → ผู้ใช้ไม่แน่ใจว่าติดจริงไหม
     ตอนนี้: เห็นผลทันที แล้ว refresh ตามมา reconcile (ลำดับแถว/derived view) ให้ถูกต้อง
     → ถ้า patch วางลำดับไม่ตรง query ก็อยู่แค่ชั่วครู่ เดี๋ยว refresh ทับให้เอง (ไม่ค้างผิด) */
  const patchRows = useCallback((tableName, rows) => {
    const key = TABLE_KEY[tableName];
    if (!key || !rawRef.current || !Array.isArray(rows) || !rows.length) return;
    const cur = rawRef.current[key];
    if (!Array.isArray(cur)) return;
    const idx = new Map(cur.map((r, i) => [String(r?.id), i]));
    const next = cur.slice();
    let touched = false;
    for (const r of rows) {
      const id = r?.id == null ? '' : String(r.id);
      if (!id) continue;                       // แถวไม่มี id → ข้าม (ปล่อยให้ refresh จัดการ)
      const i = idx.get(id);
      if (i != null) next[i] = { ...next[i], ...r };  // merge — คงคอลัมน์ที่ select ไม่ได้ดึงมา
      else next.unshift(r);                    // แถวใหม่ → บนสุด (ตารางส่วนใหญ่เรียง created_at desc)
      touched = true;
    }
    if (!touched) return;
    rawRef.current[key] = next;                // reference ใหม่ → memoSection map เฉพาะส่วนนี้
    mutateTMK(mapToTMK(rawRef.current));
    setVersion(v => v + 1);
  }, []);

  // โหลดตาราง deferred ตอนกดเข้า section ที่ใช้ (ครั้งเดียว/แคช) → ลด egress ตอนเปิดแอป
  const deferredLoadedRef = useRef(new Set());
  const ensureLoaded = useCallback(async (wantKeys) => {
    if (!rawRef.current) return; // ยังโหลดครั้งแรกไม่เสร็จ — section จะเรียกซ้ำเมื่อ version ขยับ
    const keys = (wantKeys || []).filter(k => QUERIES[k] && !deferredLoadedRef.current.has(k));
    if (!keys.length) return;
    keys.forEach(k => deferredLoadedRef.current.add(k)); // mark ก่อน กัน race โหลดซ้ำ
    // fetch เฉพาะที่ยังไม่มีใน rawRef (realtime/refreshTables อาจโหลดให้แล้ว → ไม่ดึงซ้ำ/ไม่ทับของใหม่)
    const toFetch = keys.filter(k => rawRef.current[k] === undefined);
    if (!toFetch.length) return;
    try {
      const results = await Promise.all(toFetch.map(k => QUERIES[k]()));
      if (!mountedRef.current) return;
      let any = false;
      results.forEach((r, i) => { if (!r.error) { rawRef.current[toFetch[i]] = r.data; any = true; } else { deferredLoadedRef.current.delete(toFetch[i]); } });
      if (any) { mutateTMK(mapToTMK(rawRef.current)); setVersion(v => v + 1); }
    } catch { toFetch.forEach(k => deferredLoadedRef.current.delete(k)); }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // RLS-ready: โหลด "หลังมี session" เท่านั้น — ถ้าโหลดตอน anon RLS จะคืน 0 แถวแบบเงียบ (ไม่ error) → แอปว่าง
    // - restore session (localStorage) → getSession เจอ → โหลดทันที (เหมือนเดิม)
    // - login ใหม่ → รอ SIGNED_IN แล้วค่อยโหลดด้วย JWT (AppInner โชว์ LoginScreen ก่อน data gate อยู่แล้ว — ไม่ติดจอโหลด)
    // - logout → เคลียร์ baseline ให้ SIGNED_IN คนถัดไปโหลดใหม่ (กันข้อมูลค้างข้าม user)
    let authSub = null;
    /* Realtime ก็ต้องรอ session เหมือน load() — เดิม connectRealtime() ยิงตอน mount เลย
       → หน้า login เปิด WS ทั้งที่ anon อ่านอะไรไม่ได้อยู่แล้ว (RLS คืน 0 แถว)
       เปลือง connection + console หน้า login มี error (e2e จับได้บน CI 9 ก.ย. 69)
       ประกาศเป็น let ตรงนี้ แล้ว assign ตัวจริงหลัง connectRealtime ถูกนิยามด้านล่าง */
    let startRt = () => {};
    if (!isSupabaseConfigured) {
      load(); // ไม่ได้ตั้งค่า .env → ให้ load() รายงาน error ตามเดิม
    } else {
      (async () => {
        const { data } = await supabase.auth.getSession();
        if (!mountedRef.current) return;
        if (data?.session) { load(); startRt(); }
        const res = supabase.auth.onAuthStateChange((event) => {
          if (!mountedRef.current) return;
          if (event === 'SIGNED_OUT') { rawRef.current = null; clearMapMemo(); } // ล้างแคช map ด้วย — กันข้อมูล user เดิมค้างข้ามคน
          if (event === 'SIGNED_IN' && !rawRef.current) load();
          if (event === 'SIGNED_IN') startRt();   // login ใหม่ → ค่อยเปิด WS (idempotent — กันซ้ำใน startRt)
        });
        authSub = res?.data?.subscription || null;
      })();
    }

    // Realtime subscription — ถ้าต่อ WS ไม่ได้ (เน็ตหลุด/ปิด realtime) → degrade เป็น polling (ไม่ retry รัวจน console รก)
    let timer = null, pollTimer = null, connectTimeout = null, usingPoll = false;
    const onVis = () => { // กลับมาที่แท็บ (โหมด poll) → ดึงตารางหลัก + ลองต่อ realtime ใหม่ (เน็ตอาจกลับมาแล้ว)
      if (document.visibilityState !== 'visible' || !mountedRef.current) return;
      refreshTables(POLL_TABLES, { fromRealtime: true });
      retryRealtime();
    };
    // ตารางที่เปลี่ยนบ่อยระหว่างทำงาน — poll fallback ดึงเฉพาะกลุ่มนี้ (ลด egress; ตารางตั้งค่าที่นิ่งจะรีเฟรชตอนสลับแท็บ/โหลดใหม่)
    const POLL_TABLES = ['tmk_daily_sales', 'tmk_tasks', 'tmk_channels', 'tmk_campaigns', 'tmk_ad_campaigns', 'tmk_flows', 'tmk_task_comments'];
    const startPolling = () => {
      if (usingPoll || !mountedRef.current) return;
      usingPoll = true;
      teardownChannel(); // เอาเฉพาะ channel ของ data-context ออก (อย่า disconnect ทั้ง socket — กระดิ่งแจ้งเตือน + แผงคอมเมนต์มี channel ของตัวเองที่ยังต้องใช้)
      pollTimer = setInterval(() => { if (document.visibilityState === 'visible') refreshTables(POLL_TABLES, { fromRealtime: true }); }, 120000); // ดึงเฉพาะตารางที่เปลี่ยนบ่อย ทุก 120 วิ
      document.addEventListener('visibilitychange', onVis); // + ตอนกลับมาที่แท็บ (ดึงตารางหลัก + ลองต่อ realtime ใหม่)
      console.info('ℹ️ Realtime ใช้ไม่ได้ — สลับเป็นรีเฟรชอัตโนมัติ (120 วิ เฉพาะตารางหลัก · กลับมาที่แท็บ = ดึง+ลองต่อ realtime ใหม่); การบันทึกในเครื่องนี้รีเฟรชทันทีอยู่แล้ว');
    };
    const pendingTables = new Set(); // ตารางที่เปลี่ยน — flush ทีเดียวด้วย refreshTables
    const channelTables = [
      'tmk_channels','tmk_campaigns','tmk_tasks','tmk_brands','tmk_flows','tmk_settings',
      'tmk_user_roles','tmk_staff','tmk_duties','tmk_daily_sales','tmk_ad_campaigns',
      /* เอา 4 ตารางที่เลิกโหลดออกจาก realtime ด้วย (segments/fb_metrics/color_mix/size_mix)
         ถ้าปล่อยไว้: มี event มา → refreshTables หา key ไม่เจอ → ตกไปที่ load() = โหลดใหม่ "ทั้งแอป"
         ซึ่งตรงข้ามกับที่ตั้งใจลด egress */
      'tmk_monthly_history',
      'tmk_task_comments', // เปลี่ยน → รีเฟรชจำนวน 💬 บนการ์ด (needCounts ใน refreshTables · ไม่ full load)
      // ไม่ subscribe tmk_audit_logs — การเขียน log ไม่ควร trigger reload เต็ม (ลด reload ซ้ำตอนเซฟ)
    ];
    // ต่อ realtime แบบทนทาน: WS blip/หลับเครื่อง (CLOSED/TIMED_OUT) → ลองต่อใหม่ backoff ก่อน · เฉพาะ error จริง → poll
    let channel = null, reconnectAttempts = 0, reconnectTimer = null;
    const MAX_RECONNECT = 3;
    // สำคัญ: null "ก่อน" removeChannel — unsubscribe ยิง status CLOSED กลับเข้า callback แบบ synchronous
    // ถ้า null ทีหลัง callback จะเรียก teardown ซ้ำเป็นลูกโซ่ = Maximum call stack size exceeded
    const teardownChannel = () => {
      if (!channel) return;
      const ch = channel; channel = null;
      rtDiag.channelClose('tmk-realtime'); // Phase 0 baseline
      try { supabase.removeChannel(ch); } catch { /* ignore */ }
    };
    const connectRealtime = () => {
      if (!supabase) { startPolling(); return; }
      if (usingPoll || !mountedRef.current) return;
      const ch = supabase.channel('tmk-realtime');
      channel = ch;
      channelTables.forEach(t => {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
          rtDiag.event(t); // Phase 0 baseline: นับ realtime event ที่รับต่อ table (dev-only · รวม echo)
          // ข้าม echo ของการเซฟจากเครื่องนี้เอง "1 ครั้ง" — เราเพิ่ง refresh ตารางนี้ไปแล้ว (<800ms) ไม่ต้องดึงซ้ำ
          // ปลอดภัยเพราะ event มาตามลำดับ commit: event แรกหลังเซฟเรา = ของเราเอง (ข้อมูลอยู่ใน fetch แล้ว)
          // ลบ stamp หลังข้าม → event ถัดไป (ของคนอื่น) ประมวลผลปกติ ไม่มีช่องพลาดข้อมูล
          if (Date.now() - (lastRefreshAtRef.current[t] || 0) < 800) { delete lastRefreshAtRef.current[t]; return; }
          pendingTables.add(t);
          clearTimeout(timer);
          timer = setTimeout(() => {
            const ts = [...pendingTables]; pendingTables.clear();
            refreshTables(ts, { fromRealtime: true }); // ดึงเฉพาะตารางที่เปลี่ยน (flush จาก realtime — ไม่ stamp กัน echo กินต่อกันเป็นลูกโซ่)
          }, 300);
        });
      });
      ch.subscribe((status) => {
        if (channel !== ch) return; // event จาก channel เก่าที่ถูก teardown ไปแล้ว (CLOSED ตอน unsubscribe) — เมิน กันลูป
        if (status === 'SUBSCRIBED') { clearTimeout(connectTimeout); reconnectAttempts = 0; rtDiag.channelOpen('tmk-realtime'); }
        else if (status === 'CHANNEL_ERROR') { clearTimeout(connectTimeout); teardownChannel(); startPolling(); }
        else if (status === 'CLOSED' || status === 'TIMED_OUT') {
          clearTimeout(connectTimeout); teardownChannel();
          if (mountedRef.current && !usingPoll && reconnectAttempts < MAX_RECONNECT) {
            reconnectAttempts += 1; rtDiag.reconnect(); // Phase 0 baseline

            reconnectTimer = setTimeout(connectRealtime, 1000 * reconnectAttempts); // backoff 1/2/3 วิ
          } else { startPolling(); }
        }
      });
      connectTimeout = setTimeout(() => { if (channel === ch) { teardownChannel(); startPolling(); } }, 8000); // WS ค้าง → fallback (เฉพาะ channel ปัจจุบัน)
    };
    // กลับจากโหมด poll → realtime เมื่อเน็ตกลับมา (เดิม: หลุดเกิน 3 ครั้ง = poll ถาวรจนรีเฟรชหน้า)
    const retryRealtime = () => {
      if (!usingPoll || !mountedRef.current) return;
      usingPoll = false;
      clearInterval(pollTimer); pollTimer = null;
      document.removeEventListener('visibilitychange', onVis);
      reconnectAttempts = 0;
      connectRealtime(); // ต่อไม่สำเร็จ → status handler จะ startPolling กลับให้เอง (interval+listener ตั้งใหม่)
    };
    let rtStarted = false;
    startRt = () => { if (rtStarted || !mountedRef.current) return; rtStarted = true; connectRealtime(); };
    if (!isSupabaseConfigured) startRt();   // ไม่มี client → connectRealtime จะ startPolling ให้เอง (พฤติกรรมเดิม)

    return () => {
      mountedRef.current = false;
      authSub?.unsubscribe();
      clearTimeout(timer); clearTimeout(connectTimeout); clearTimeout(reconnectTimer); clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVis);
      teardownChannel();
    };
  }, [load, refreshTables]);

  return (
    <DataContext.Provider value={{ loading, error, version, reload: load, refresh: refreshTables, ensureLoaded, patchRows }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  return useContext(DataContext);
}
