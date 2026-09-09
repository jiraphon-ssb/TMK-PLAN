/* ============================================================
   saleCrm.jsx — ลูกค้า (CRM) · PART 45: ครบจบพร้อมใช้งาน + UI คลีน
   ============================================================
   - ยอด/ครั้ง/ซื้อล่าสุด = คำนวณสดจาก tmk_mp_orders (คีย์ customer_code จากใบเสร็จ
     · fallback 'N'+ชื่อ สำหรับออเดอร์เก่าที่ code ว่าง) → ยกเลิกใบแล้วยอดหายทันที
   - โปรไฟล์ (เบอร์/ที่อยู่/เจ้าของ/แท็ก/โน้ต) = tmk_mp_customers · แก้ไขได้ใน drawer
   - "สร้างงานติดตาม" → เปิดงานใหม่ในระบบโครงการ (prefill ชื่อ/รายละเอียด)
   - Insight ต่อลูกค้า: ลาย/สี/ไซซ์ที่ซื้อบ่อย (จาก tmk_mp_skus · lazy ตอนเปิด drawer)
   - ก้อน UI ย่อยแยกไฟล์แล้ว: saleCrmPanels.jsx (ตัวกรอง/skeleton/แดชบอร์ด/popup รายวัน)
     · saleCrmDetail.jsx (drawer รายละเอียดลูกค้า) — ไฟล์นี้เหลือ hook โหลดข้อมูล + aggregate + ตารางลูกค้า
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { N, Icon, useDelayedFlag, PersonAvatar } from './components.jsx';
import { channelColor } from './charts.jsx';
import { SideSheet } from './modals-core.jsx';
import { TIER_CHIP, TIERS, PER_PAGE, CRM_SORT, STATUS_PRED, STATUS_OPTS, pageList, buildDirectory, findDuplicateCustomers } from './lib/crmDirectory.js';
import { buildCrmMonth, crmCustomerKey, crmTargetProgress, isCrmOrder } from './lib/crmAgg.js';
import { mergeOrderOverrides } from './lib/saleOverrides.js';
import { fetchCrmTargets } from './lib/crmTargets.js';
import { fetchContacts, saveContact, nextSnoozeISO, CONTACTS_MIGRATION } from './lib/crmContacts.js';
import { pgErrorText } from './lib/pgError.js';
import { buildFollowUpTask } from './lib/crmFollowUp.js';
import { TMK } from './data.js';
import { toast, openModal } from './lib/appBus.js';
import { useUser } from './userContext.jsx';
import { isAdmin } from './lib/roleAccess.js';
import { fmtBaht } from './lib/money.js';
import { cachedFetchAll, OVERRIDES_SEL, fetchCustomerProfiles } from './lib/saleData.js';
import { useSaleLiveReload } from './lib/useSaleLive.js';
import { T } from './lib/tables.js';
import { usePersistedState, usePersistedMonth } from './hooks/usePersistedState.js';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { downloadCsv } from './lib/exportCsv.js';
import { useTableSort, SortHead, CardTable } from './components/DataTableParts.jsx';
import { MultiSelect, CrmSkeleton, CrmDashboard, CrmDayDetail } from './saleCrmPanels.jsx';
import { crmNotesSummary, cohortRetention, RfmTiles, DuplicateCustomers } from './crmBlocks.jsx';
import { RFM_TIERS } from './lib/saleAgg.js';
import { supabase } from './lib/supabaseClient.js';
import { todayISO } from './lib/dateUtils.js';
import { CustomerDetail } from './saleCrmDetail.jsx';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { SearchInput } from '@/components/ui/search-input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { EmptyState } from './components/EmptyState.jsx';

const baht = (n) => fmtBaht(Number(n) || 0); // decimal-aware กลาง (lib/money.js)
try { localStorage.removeItem('tmk-crm-seller'); } catch { /* เลิก persist ตัวเลือกเซลล์ — เข้าใหม่ล็อคเซลล์หลักเสมอ (PART 87.2) */ }

/* ---------- โหลดข้อมูล ---------- */
// โปรไฟล์ — graceful เมื่อคอลัมน์เสริม (note/contact_channel/last_order) ยังไม่มี
async function loadProfiles() {
  // ตัวโหลดกลาง (lib/saleData.js) — ลิ้นชักลูกค้าใช้ตัวเดียวกัน กันสอง select เพี้ยนออกจากกัน
  const r = await fetchCustomerProfiles();
  return { data: r.rows, error: r.error };
}
// source ต้องมี — ORDER_OV_KEY = `${source}:${order_no}` (merge override ระดับออเดอร์)
// payment_type/cod_amount/customer_type/note/customer_phone/job_type — ไว้ใช้ในการ์ดออเดอร์ popup รายวัน (OVERRIDES_SEL มีครบ merge ต่อเนื่อง)
const ORDERS_CRM_SEL = 'order_no,source,customer_code,customer_name,customer_social,customer_phone,channel,salesperson,province,sales,qty,order_date,status,payment_type,cod_amount,customer_type,note,job_type';

/* ============================================================
   หน้า ลูกค้า (CRM)
   ============================================================ */
export function CrmView() {
  const [raw, setRaw] = useState(null); // { profiles, orders } — orders merge override แล้ว
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = usePersistedState('tmk-crm-statusF', []);
  const [ownerF, setOwnerF] = usePersistedState('tmk-crm-ownerF', []);
  const [channelF, setChannelF] = usePersistedState('tmk-crm-channelF', []);
  const [provF, setProvF] = usePersistedState('tmk-crm-provF', []);
  const [tierF, setTierF] = usePersistedState('tmk-crm-tierF', []);
  const [seg, setSeg] = usePersistedState('tmk-crm-seg', 'all'); // แยกช่องทาง: all | crm | phone | line
  // เดือนของแดชบอร์ด CRM — จำได้ภายในเดือนเดียวกันเท่านั้น (เดิมค้างที่เดือนเก่าถาวร)
  const [month, setMonth] = usePersistedMonth('tmk-crm-month');
  const [seller, setSeller] = useState(null); // scope เซลล์ CRM (session-only) · null = ยังไม่เลือก (default = เซลล์หลัก · เข้าใหม่ล็อคเสมอ) · '' = รวมทุกคน
  const [crmTargets, setCrmTargets] = useState([]); // เป้า CRM ต่อเซลล์ของเดือนที่ดู
  const [monthNotes, setMonthNotes] = useState([]); // บันทึกประจำวันทั้งเดือน (กิจกรรมโทร/อัพเซลล์) — รื้อ 22 ส.ค.
  const [contacts, setContacts] = useState([]);     // บันทึกการติดต่อรายลูกค้า (PART 110) — ของเดือนที่ดู
  const [contactsMissing, setContactsMissing] = useState(false); // ยังไม่ได้รัน migration
  const { user } = useUser();
  const [dayOpen, setDayOpen] = useState(null); // 'YYYY-MM-DD' ที่กดในกราฟ → popup รายวัน
  const [sel, setSel] = useState(null);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rk, setRk] = useState(0); // bump จาก realtime → refetch สด

  useEffect(() => {
    let alive = true;   // 1.6: กัน setState หลัง unmount (fetch all-time ช้า)
    (async () => {
      const [p, o, ov] = await Promise.all([
        loadProfiles(),
        cachedFetchAll('tmk_mp_orders', ORDERS_CRM_SEL),
        cachedFetchAll('tmk_order_overrides', OVERRIDES_SEL),
      ]);
      if (!alive) return;
      if (p.error) { setErr(p.error.message); return; }
      // merge override (channel/ยอด/วันที่ ที่แอดมินแก้) ทับออเดอร์ดิบ — ให้ยอด CRM ตรง dashboard/perf
      const ovMap = {}; if (ov && !ov.error) (ov.data || []).forEach(x => { ovMap[x.order_id] = x; });
      /* เดิม: o.error → [] เงียบ ๆ ขณะที่ p.error ข้างบนเตือน → มาตรฐานคนละอย่างในฟังก์ชันเดียวกัน
       ผลคือยอด CRM / %ซื้อซ้ำ / ลิสต์ "ควรติดต่อ" / tier ลูกค้า ว่างหมดโดยไม่มีข้อความใด ๆ */
    if (o.error) { setErr(o.error.message); return; }
    const orders = mergeOrderOverrides(o.data || [], ovMap);
      setRaw({ profiles: p.data || [], orders });
    })();
    return () => { alive = false; };
  }, [rk]);
  // realtime: ออเดอร์/ลูกค้า/override เปลี่ยน → CRM เห็นสด (invalidate cache ก่อน refetch — บทเรียน PART 80)
  // + tmk_crm_targets: แก้เป้า CRM ในหน้าตั้งค่า → หน้านี้เด้งตามทันที (เดิมค้างเลขเก่าจนรีเฟรช — user เจอ 100,000 ค้างทั้งที่แก้เป็น 70,000)
  useSaleLiveReload([T.mpOrders, T.mpCustomers, T.orderOverrides, 'tmk_crm_targets'], () => setRk(k => k + 1), { invalidate: [T.mpOrders, T.mpCustomers, T.orderOverrides] });
  // fallback ไม่พึ่ง realtime: กลับมาโฟกัสแท็บ/หน้า → refetch เป้า+ข้อมูลสด (กันเลขเป้าค้างกรณีตารางเป้าไม่อยู่ใน publication)
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') setRk(k => k + 1); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // เป้า CRM ต่อเซลล์ของเดือนที่ดู (graceful [] ก่อน migration) · rk เพื่อ refresh หลังตั้งค่า
  const curYm = todayISO().slice(0, 7);
  const monthClamped = month > curYm ? curYm : month; // เดือน persisted อนาคต → clamp
  useEffect(() => { let alive = true; (async () => { const t = await fetchCrmTargets(monthClamped); if (alive) setCrmTargets(t); })(); return () => { alive = false; }; }, [monthClamped, rk]);
  // บันทึกการติดต่อรายลูกค้าของเดือนที่ดู (PART 110) — ใช้ตัดลิสต์ "ควรติดต่อ" + เติมจำนวนสายให้บันทึกประจำวัน
  useEffect(() => { let alive = true; (async () => {
    const [yy, mm] = monthClamped.split('-').map(Number); const dim = new Date(yy, mm, 0).getDate();
    /* ต้องดึงย้อนไป 45 วันก่อนต้นเดือนด้วย — การเลื่อนนัด (snooze) และ "ติดต่อล่าสุด" ข้ามเดือนได้
       เดิมดึงเฉพาะเดือนที่ดู → ทุกวันที่ 1 ลูกค้าที่เลื่อนนัดไว้ปลายเดือนก่อนจะเด้งกลับขึ้นลิสต์เหมือนไม่เคยติดต่อ */
    const startD = new Date(yy, mm - 1, 1); startD.setDate(startD.getDate() - 45);
    const fromISO = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-${String(startD.getDate()).padStart(2, '0')}`;
    const r = await fetchContacts(fromISO, `${monthClamped}-${String(dim).padStart(2, '0')}`);
    if (!alive) return;
    setContacts(r.rows); setContactsMissing(!!r.missing);
    // error จริง (ไม่ใช่ยังไม่ migrate) ต้องเห็น ไม่ใช่เงียบแล้วโชว์ลิสต์ว่าง
    if (r.error && !r.missing) toast('โหลดบันทึกการติดต่อไม่สำเร็จ: ' + pgErrorText(r.error), 'error');
  })(); return () => { alive = false; }; }, [monthClamped, rk]);

  // บันทึกประจำวันทั้งเดือน (ทุกเซลล์ · กรอง scope ตอน render) — graceful ถ้าตาราง/คอลัมน์ data ยังไม่มี
  useEffect(() => { let alive = true; (async () => {
    const [yy, mm] = monthClamped.split('-').map(Number); const dim = new Date(yy, mm, 0).getDate();
    let rows;
    try {
      let r = await supabase.from('tmk_crm_notes').select('salesperson,date,note,data').gte('date', `${monthClamped}-01`).lte('date', `${monthClamped}-${String(dim).padStart(2, '0')}`);
      if (r.error && /column .*\bdata\b.* does not exist|schema cache/i.test(r.error.message || '')) r = await supabase.from('tmk_crm_notes').select('salesperson,date,note').gte('date', `${monthClamped}-01`).lte('date', `${monthClamped}-${String(dim).padStart(2, '0')}`);
      rows = r.error ? [] : (r.data || []);
    } catch { rows = []; }
    if (alive) setMonthNotes(rows);
  })(); return () => { alive = false; }; }, [monthClamped, rk]);

  // directory (ตารางลูกค้า all-time) + stats (แดชบอร์ด CRM รายเดือน) — derive จาก raw
  const data = useMemo(() => raw ? buildDirectory(raw.profiles, raw.orders, todayISO()) : null, [raw]);
  // statsAll = รวมทุกคน (ให้ bySeller + default เซลล์หลัก) · effSeller = seller ที่เลือก (null → default = เซลล์ CRM อันดับ 1)
  const statsAll = useMemo(() => raw ? buildCrmMonth(raw.orders, monthClamped, '') : null, [raw, monthClamped]);
  // D8 ([[crm-team-definition]]): ทีม CRM = คนที่มีเป้า CRM เดือนนั้น (ตอนนี้ = FAH) — ไม่ hardcode ชื่อ
  const crmTeam = useMemo(() => crmTargets.filter(t => Number(t.sales_target) > 0).map(t => (t.salesperson || '').trim()).filter(Boolean), [crmTargets]);
  // default = สมาชิกทีมคนแรก · ไม่มีทีม (ยังไม่ตั้งเป้า) → fallback เซลล์ CRM อันดับ 1 แบบเดิม + hint ใน header
  const effSeller = seller === null ? (crmTeam[0] || statsAll?.bySeller?.[0]?.name || '') : seller;
  // บันทึกผลการติดต่อ 1 คลิกจากการ์ด "ควรติดต่อ" (PART 110)
  const logContact = async (row, { result, snoozeDays } = {}) => {
    const t = todayISO();
    const key = row.key || row.code;
    const kind = row.grp === 'risk' ? 'repurchase' : row.grp === 'wait' ? '5day' : 'other';
    const r = await saveContact({
      customerKey: key, customerName: row.name || '', salesperson: effSeller || '', dateISO: t,
      kind, result: result || 'answered',
      snoozeUntil: result === 'snooze' ? nextSnoozeISO(t, snoozeDays || 7) : null,
      by: user?.email || '',
    });
    if (r.error) {
      toast(r.missing ? `ต้องรัน migration ${CONTACTS_MIGRATION} ใน Supabase ก่อน` : 'บันทึกไม่สำเร็จ: ' + pgErrorText(r.error), r.missing ? 'warn' : 'error');
      return;
    }
    setContacts(c => [...c, r.row]);
    toast(result === 'snooze' ? `เลื่อน "${row.name || key}" ไปอีก ${snoozeDays || 7} วัน` : result === 'no_answer' ? `บันทึก "ไม่รับสาย" แล้ว` : `บันทึกการติดต่อ "${row.name || key}" แล้ว`, 'success');
  };
  // วันนี้กรอกบันทึกประจำวันแล้วหรือยัง (ของเซลล์ที่กำลังดู · ดูรวมทีม = ถือว่ากรอกแล้วถ้ามีอย่างน้อย 1 คน)
  const todayNoteFilled = (() => {
    const t = todayISO();
    if (t.slice(0, 7) !== monthClamped) return null;         // ไม่ได้ดูเดือนปัจจุบัน → ไม่ต้องเตือน
    const rows = (monthNotes || []).filter(n => n.date === t && (effSeller ? n.salesperson === effSeller : true));
    return rows.some(n => (n.note || '').trim() || n.data);
  })();
  const stats = useMemo(() => {
    if (!raw) return null;
    if (effSeller === '') return crmTeam.length ? buildCrmMonth(raw.orders, monthClamped, new Set(crmTeam)) : statsAll; // '' = รวมทีม CRM (ไม่ใช่ทุกเซลล์)
    return buildCrmMonth(raw.orders, monthClamped, effSeller);
  }, [raw, monthClamped, effSeller, statsAll, crmTeam]);
  // เป้า CRM: เลือกคน → เป้าคนนั้น · รวมทุกคน → ผลรวมเป้าทุกเซลล์ (ตรง requirement) · ความคืบหน้าเทียบยอดสะสม
  const target = useMemo(() => {
    if (!effSeller) return crmTargets.reduce((s, t) => s + (Number(t.sales_target) || 0), 0);
    return Number(crmTargets.find(t => t.salesperson === effSeller)?.sales_target) || 0;
  }, [crmTargets, effSeller]);
  const targetProg = useMemo(() => stats ? crmTargetProgress({ crmSales: stats.crmSales, month: monthClamped, target, todayISO: todayISO() }) : null, [stats, monthClamped, target]);
  // เดือนก่อน (scope เดียวกัน) → เส้นประในกราฟรายวัน
  const prevStats = useMemo(() => {
    if (!raw) return null;
    const [yy, mm] = monthClamped.split('-').map(Number); const pm = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, '0')}`;
    if (effSeller === '') return crmTeam.length ? buildCrmMonth(raw.orders, pm, new Set(crmTeam)) : buildCrmMonth(raw.orders, pm, '');
    return buildCrmMonth(raw.orders, pm, effSeller);
  }, [raw, monthClamped, effSeller, crmTeam]);
  // โน้ตใน scope (เซลล์ที่เลือก / ทีม) → สรุปกิจกรรม
  const notesSummary = useMemo(() => crmNotesSummary(monthNotes.filter(n => effSeller ? (n.salesperson || '').trim() === effSeller : (!crmTeam.length || crmTeam.includes((n.salesperson || '').trim())))), [monthNotes, effSeller, crmTeam]);
  // ลูกค้า CRM (เคยซื้อผ่านโทร/LINE) สำหรับ ควรตามต่อ/RFM — รูปเดียวกับ CustomerTable กลาง
  const crmCustRows = useMemo(() => (data || []).filter(c => c.segPhone || c.segLine).map(c => ({
    key: c.key, code: c.key, name: c.name || c.key, contact: c.contact || c.social || '',
    tier: c.tier, sales: c.sales, orders: c.count, aov: c.aov, last: c.last, recency: c.recency, flag: c.flag,
    // ต้องส่งไปด้วย: cadence = ใช้ตัดสินกลุ่ม "ถึงรอบติดตาม" (ไม่ส่ง = กลุ่มนี้ไม่มีวันขึ้นเลย)
    //               owner   = ใช้ตั้งผู้รับผิดชอบตอนสร้างงานติดตาม (ไม่ส่ง = งานไม่มีเจ้าของ)
    cadence: c.cadence, owner: c.owner,
  })), [data]);
  // cohort: ลูกค้าที่ซื้อผ่าน LINE/โทรครั้งแรกในแต่ละเดือน (6 เดือนถึงเดือนที่ดู) กลับมาซื้ออีกกี่ % — สโคปเดียวกับ stats
  // ลูกค้าที่น่าจะซ้ำ (เบอร์/ชื่อเดียวกันแต่คนละคีย์) — คิดจากรายชื่อทั้งหมด ไม่ผูกตัวกรองหน้า
  const dupGroups = useMemo(() => findDuplicateCustomers(data || []), [data]);
  const cohortRows = useMemo(() => {
    if (!raw) return [];
    const os = raw.orders.filter(o => isCrmOrder(o) && (effSeller ? (o.salesperson || '').trim() === effSeller : (!crmTeam.length || crmTeam.includes((o.salesperson || '').trim()))));
    return cohortRetention(os, { keyOf: crmCustomerKey, asOfYm: monthClamped, months: 6 });
  }, [raw, effSeller, crmTeam, monthClamped]);
  // ออเดอร์ที่ scope ตามเซลล์ (สำหรับ popup รายวัน)
  const dayOrders = useMemo(() => {
    const os = raw?.orders || [];
    if (effSeller) return os.filter(o => (o.salesperson || '').trim() === effSeller);
    return crmTeam.length ? os.filter(o => crmTeam.includes((o.salesperson || '').trim())) : os; // '' = รวมทีม CRM
  }, [raw, effSeller, crmTeam]);

  // แก้โปรไฟล์จาก drawer → patch raw.profiles (ตาราง+memo คำนวณใหม่) + sel in-place (drawer ที่เปิดอยู่)
  const applyProfile = (key, row) => {
    // อัปเดตโปรไฟล์ต้นทาง — buildDirectory คีย์ตาม p.customer_code
    setRaw(prev => {
      if (!prev) return prev;
      const profiles = [...(prev.profiles || [])];
      const idx = profiles.findIndex(p => p.customer_code === key);
      if (idx >= 0) profiles[idx] = { ...profiles[idx], ...row };
      else profiles.push({ ...row, customer_code: key });
      return { ...prev, profiles };
    });
    // drawer ที่เปิดอยู่ — merge in-place ให้เห็นผลทันที (memo ไม่ผูกกับ sel)
    setSel(s => {
      if (!s || s.key !== key) return s;
      const contactChannel = row.contact_channel ?? s.contactChannel;
      const segPhone = s.channels?.has?.('Phone') || contactChannel === 'Phone';
      const segLine = s.channels?.has?.('LINE') || contactChannel === 'LINE';
      return {
        ...s,
        name: row.name || s.name, contact: row.phone ?? s.contact, social: row.social_name ?? s.social,
        address: row.address ?? s.address, province: row.province ?? s.province,
        owner: row.owner ?? s.owner, cadence: row.cadence ?? s.cadence,
        note: row.note ?? s.note, tags: Array.isArray(row.tags) ? row.tags : s.tags,
        contactChannel, segPhone, segLine, segCrm: segPhone || segLine,
        hasContact: !!(row.phone || s.contact), queue: !!((row.cadence ?? s.cadence) || (row.owner ?? s.owner)),
      };
    });
  };

  const opts = useMemo(() => {
    const d = data || [];
    const uniq = (f) => [...new Set(d.map(f).filter(Boolean))].sort();
    return {
      owners: uniq(c => c.owner),
      channels: uniq(c => c.mainChannel),
      provs: uniq(c => c.province),
      tiers: TIERS.filter(t => d.some(c => c.tier === t)),
    };
  }, [data]);

  // segment โทร/LINE (แยกช่องทาง) — CRM = โทร+LINE · สมาชิกจากช่องที่เคยซื้อ + ที่ตั้ง contact_channel ไว้
  const segRows = useMemo(() => {
    const d = data || [];
    if (seg === 'crm') return d.filter(c => c.segCrm);
    if (seg === 'phone') return d.filter(c => c.segPhone);
    if (seg === 'line') return d.filter(c => c.segLine);
    return d;
  }, [data, seg]);
  // สรุประดับ RFM ของ segment ที่เลือก (ชุดเดียวกับตาราง → เลขตรงกัน)
  const rfmSummary = useMemo(() => {
    const tot = segRows.reduce((a, r) => a + r.sales, 0);
    return RFM_TIERS.map(t => { const g = segRows.filter(r => r.tier === t.key); const sl = g.reduce((a, r) => a + r.sales, 0); return { ...t, count: g.length, sales: sl, share: segRows.length ? g.length / segRows.length : 0, sharePct: tot ? sl / tot : 0, avg: g.length ? sl / g.length : 0 }; });
  }, [segRows]);
  // ยอดที่เกี่ยวกับ segment (โทร→ยอดโทร · LINE→ยอดไลน์ · อื่น→ยอดรวม)
  const segSalesOf = (c) => seg === 'phone' ? c.phoneSales : seg === 'line' ? c.lineSales : c.sales;

  const filtered = useMemo(() => {
    let r = segRows;
    const sf = statusF.filter(s => STATUS_PRED[s]);   // ทิ้งป้ายเก่าที่ persisted จากเวอร์ชันก่อน
    if (sf.length) r = r.filter(c => sf.some(s => STATUS_PRED[s](c)));
    if (ownerF.length) r = r.filter(c => ownerF.includes(c.owner));
    if (channelF.length) r = r.filter(c => channelF.includes(c.mainChannel));
    if (provF.length) r = r.filter(c => provF.includes(c.province));
    if (tierF.length) r = r.filter(c => tierF.includes(c.tier));
    const ql = q.trim().toLowerCase();
    if (ql) r = r.filter(c => `${c.name} ${c.contact} ${c.social} ${c.owner} ${c.salesperson} ${c.province}`.toLowerCase().includes(ql));
    return r;
  }, [segRows, statusF, ownerF, channelF, provF, tierF, q]);

  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(filtered, { key: 'sales', dir: 'desc', accessors: CRM_SORT });
  // eslint-disable-next-line react-hooks/set-state-in-effect -- รีเซ็ตหน้ากลับ 1 เมื่อเปลี่ยนตัวกรอง/เรียง (page เป็น state ที่ผู้ใช้กดเอง — derive ไม่ได้)
  useEffect(() => { setPage(1); }, [statusF, ownerF, channelF, provF, tierF, q, seg, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = sorted.slice((pageClamped - 1) * PER_PAGE, pageClamped * PER_PAGE);
  const nFilters = statusF.length + ownerF.length + channelF.length + provF.length + tierF.length;
  const activeChips = [
    ...statusF.map(v => ({ dim: 'สถานะ', v, clear: () => setStatusF(statusF.filter(x => x !== v)) })),
    ...ownerF.map(v => ({ dim: 'เซลล์', v, clear: () => setOwnerF(ownerF.filter(x => x !== v)) })),
    ...channelF.map(v => ({ dim: 'ช่องทาง', v, clear: () => setChannelF(channelF.filter(x => x !== v)) })),
    ...provF.map(v => ({ dim: 'จังหวัด', v, clear: () => setProvF(provF.filter(x => x !== v)) })),
    ...tierF.map(v => ({ dim: 'ระดับ', v, clear: () => setTierF(tierF.filter(x => x !== v)) })),
  ];
  const clearFilters = () => { setStatusF([]); setOwnerF([]); setChannelF([]); setProvF([]); setTierF([]); };

  const showSkel = useDelayedFlag(!data, 120);
  if (err) return <div className="content-inner"><Card className="p-5" style={{ color: 'var(--bad)' }}>{err}</Card></div>;
  if (showSkel) return <CrmSkeleton />;
  if (!data) return null;

  const total = segRows.length; // ใช้ใน empty state ของตาราง
  const SEGS = [['all', 'ทั้งหมด'], ['crm', 'CRM (โทร+LINE)'], ['phone', 'โทร'], ['line', 'LINE']];

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {/* แดชบอร์ดยอด CRM รายเดือน (โทร + LINE) — PART 87 · พาดหัวสลับเซลล์ได้ + กดแท่งดูรายวัน */}
      {stats && <CrmDashboard stats={stats} prevStats={prevStats} month={monthClamped} setMonth={setMonth} curYm={curYm}
        seller={effSeller} setSeller={setSeller} team={crmTeam} crmTargets={crmTargets}
        target={target} targetProg={targetProg} isAdminUser={isAdmin(user)}
        notesSummary={notesSummary} custRows={crmCustRows} cohortRows={cohortRows}

        onPickCustomer={(r) => { const c = (data || []).find(x => x.key === (r.key || r.code)); if (c) setSel(c); }}
        contacts={contacts} contactsMissing={contactsMissing} onLogContact={logContact}
        tasks={TMK.tasks || []} onFollowUp={(row) => openModal('task', buildFollowUpTask(row, { today: todayISO(), days: 0, owner: row.owner || '' }))}
        onEditDay={(d) => setDayOpen(d)}
        // กด "บันทึกวันนี้" ตอนดูรวมทีม → ล็อกไปที่เซลล์ CRM คนแรกก่อน (เดิมเปิดมาแล้วไม่มีฟอร์มให้กรอก)
        onNewNote={() => { if (!effSeller && crmTeam.length) setSeller(crmTeam[0]); setDayOpen(todayISO()); }}
        todayFilled={todayNoteFilled}
        onDayClick={(i) => { const d = stats.byDay[i]; if (d) setDayOpen(d.date); }} />}

      {/* คั่น: ด้านบน = แดชบอร์ดรายเดือน · ด้านล่าง = รายชื่อลูกค้าทั้งหมด (ไม่จำกัดเดือน) */}
      <div id="crm-directory" className="row items-center gap-2" style={{ marginTop: 4, paddingTop: 12, borderTop: '1px solid var(--line)', scrollMarginTop: 70 }}>
        <Icon name="users" />
        <h2 className="m-0 text-lg font-bold leading-tight" style={{ color: 'var(--ink)' }}>รายชื่อลูกค้า</h2>
        <span className="cap" style={{ color: 'var(--ink-4)' }}>ทั้งหมด ไม่จำกัดเดือน</span>
      </div>
      {/* แยกช่องทาง: ทั้งหมด | CRM(โทร+LINE) | โทร | LINE — สลับแล้วตาราง+สรุปคิดตาม segment */}
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <ToggleGroup type="single" value={seg} onValueChange={(v) => v && setSeg(v)} className="gap-0.5 rounded-md border bg-muted/30 p-0.5">
          {SEGS.map(([v, l]) => <ToggleGroupItem key={v} value={v} size="sm" className="px-3 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">{l}</ToggleGroupItem>)}
        </ToggleGroup>
        {seg !== 'all' && <span className="cap" style={{ color: 'var(--ink-4)' }}>ลูกค้าที่เคยซื้อผ่านช่องนี้ หรือถูกตั้ง "ช่องทางติดต่อหลัก" ไว้</span>}
      </div>

      {/* ระดับลูกค้า (RFM) — ชุดเดียวกับตารางด้านล่าง (ตาม segment ที่เลือก) · คลิก = กรองระดับของตาราง */}
      <RfmTiles summary={rfmSummary} sel={tierF.length === 1 ? tierF[0] : 'all'} onPick={(k) => setTierF(k === 'all' ? [] : [k])}
        title={`ระดับลูกค้า · ${SEGS.find(x => x[0] === seg)?.[1] || 'ทั้งหมด'}`} sub="ทุกเดือน · ต้องผ่านทั้ง ยอดซื้อ + ความถี่ + ความสดใหม่ · คลิกระดับ = กรองตารางด้านล่าง" />

      {/* ลูกค้าที่น่าจะเป็นคนเดียวกัน (PART 110) — พับไว้ ไม่รบกวนถ้าไม่มี */}
      <DuplicateCustomers groups={dupGroups} onPick={setSel} />

      {/* ตารางลูกค้า */}
      <Card className="p-4">
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 mr-1 text-base font-bold leading-tight" style={{ color: 'var(--ink)', whiteSpace: 'nowrap' }}>ลูกค้า</h3>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 rounded-full">
                <Icon name="filter" /> ตัวกรอง{nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
                <Icon name="chevD" style={filtersOpen ? { transform: 'rotate(180deg)' } : undefined} />
              </Button>
            </CollapsibleTrigger>
            {nFilters > 0 && <Button variant="ghost" size="sm" className="text-[var(--bad)]" onClick={clearFilters}><Icon name="x" /> ล้าง</Button>}
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา" wrapperClassName="w-full sm:w-[240px]" />
            <Button variant="outline" size="sm" className="flex-none" disabled={!filtered.length}
              onClick={() => downloadCsv(`ลูกค้า_CRM_${filtered.length}ราย`, sorted, [
                { label: 'ชื่อลูกค้า', key: 'name' },
                { label: 'เบอร์', key: 'contact' },
                { label: 'โซเชียล', key: 'social' },
                { label: 'ช่องทางหลัก', key: 'mainChannel' },
                { label: 'จังหวัด', key: 'province' },
                { label: 'เซลล์', map: (c) => c.owner || c.salesperson || '' },
                { label: 'ระดับ', key: 'tier' },
                { label: 'ยอดซื้อสะสม', key: 'sales' },
                { label: 'จำนวนครั้ง', key: 'count' },
                { label: 'ซื้อล่าสุด', key: 'last' },
              ])} title="ส่งออกลูกค้าตามตัวกรองปัจจุบัน">
              <Icon name="external" /> CSV
            </Button>
          </div>
        </div>
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {activeChips.map(({ dim, v, clear }) => <Badge key={dim + v} variant="outline" onClick={clear} title="คลิกเพื่อเอาออก" style={{ cursor: 'pointer', padding: '2px 8px' }}><span style={{ color: 'var(--ink-4)' }}>{dim}:</span> {v || '(ไม่ระบุ)'} <Icon name="x" /></Badge>)}
            </div>
          )}
          <CollapsibleContent>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 12, marginTop: 10, borderTop: '1px solid var(--line)' }}>
              <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 600, width: 64, flexShrink: 0 }}>ตัวกรอง</span>
              <MultiSelect label="สถานะ" options={STATUS_OPTS} value={statusF} onChange={setStatusF} />
              {opts.channels.length > 0 && <MultiSelect label="ช่องทาง" options={opts.channels} value={channelF} onChange={setChannelF} />}
              {opts.provs.length > 0 && <MultiSelect label="จังหวัด" options={opts.provs} value={provF} onChange={setProvF} />}
              {opts.owners.length > 0 && <MultiSelect label="เซลล์" options={opts.owners} value={ownerF} onChange={setOwnerF} />}
              {opts.tiers.length > 0 && <MultiSelect label="ระดับ" options={opts.tiers} value={tierF} onChange={setTierF} />}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <CardTable className="cozy"><Table>
          <TableHeader><TableRow>
            <SortHead field="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>ลูกค้า</SortHead>
            <TableHead>ติดต่อ</TableHead>
            <TableHead>ระดับ</TableHead>
            <SortHead field="sales" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ยอดซื้อ</SortHead>
            <SortHead field="count" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ครั้ง</SortHead>
            <SortHead field="recency" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ซื้อล่าสุด</SortHead>
          </TableRow></TableHeader>
          <TableBody>
            {pageRows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="p-0">
                {total === 0
                  ? <EmptyState icon="users" title="ยังไม่มีลูกค้าในระบบ" hint="ส่งยอดใบเสร็จแล้วลูกค้าจะเข้ามาที่นี่เอง" className="border-0 bg-transparent" />
                  : <EmptyState mode="filtered" title="ไม่พบลูกค้าที่ตรงกับตัวกรอง" hint="ลองเปลี่ยนคำค้นหรือล้างตัวกรองเพื่อดูทั้งหมด" className="border-0 bg-transparent" />}
              </TableCell></TableRow>
            )}
            {pageRows.map(c => (
              <TableRow key={c.key} onClick={() => setSel(c)} style={{ cursor: 'pointer' }}>
                <TableCell className="cell-title">
                  <div className="crm-person">
                    <PersonAvatar name={c.name} size={34} color={channelColor(c.mainChannel)} className={!c.contact ? 'opacity-60' : ''} />
                    <div style={{ minWidth: 0 }}>
                      <div className="crm-name">{c.name}</div>
                      <div className="cap" style={{ color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.province || c.owner || c.salesperson || '—'}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="cap" style={{ whiteSpace: 'nowrap' }}>
                  {c.contact ? <span className="num">{c.contact}</span> : (c.social ? <span style={{ color: 'var(--ink-3)' }}>@{c.social}</span> : <span style={{ color: 'var(--ink-4)' }}>—</span>)}
                  {c.mainChannel && <Badge variant="outline" className="ml-1.5 rounded-full text-[10px] font-medium" style={{ color: channelColor(c.mainChannel), background: `color-mix(in srgb, ${channelColor(c.mainChannel)} 14%, transparent)`, borderColor: `color-mix(in srgb, ${channelColor(c.mainChannel)} 40%, transparent)` }}>{c.mainChannel}</Badge>}
                </TableCell>
                <TableCell>{c.tier && <span className={`tier-chip ${TIER_CHIP[c.tier] || ''}`}>{c.tier}</span>}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>
                  {baht(c.sales)}
                  {(seg === 'phone' || seg === 'line') && <div className="cap" style={{ color: channelColor(seg === 'phone' ? 'Phone' : 'LINE'), fontWeight: 500 }}>{seg === 'phone' ? 'โทร' : 'LINE'} {baht(segSalesOf(c))}</div>}
                </TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{N(c.count)}</TableCell>
                <TableCell className="num cap" style={{ textAlign: 'right', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                  {c.recency != null ? `${N(c.recency)} วันก่อน` : (c.last || '—')}
                  {c.flag && <Badge variant="outline" className="ml-1.5 rounded-full text-[10px]" style={{ color: c.flag === 'เสี่ยงหลุด' ? 'var(--warn)' : 'var(--accent)', borderColor: 'currentColor' }}>{c.flag}</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table></CardTable>

        {filtered.length > PER_PAGE && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="cap" style={{ color: 'var(--ink-4)' }}>แสดง {N((pageClamped - 1) * PER_PAGE + 1)}–{N(Math.min(pageClamped * PER_PAGE, filtered.length))} จาก {N(filtered.length)} ราย</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="gap-1" disabled={pageClamped <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><Icon name="chevL" /> ก่อนหน้า</Button>
              {pageList(pageClamped, totalPages).map((p, i) => p === '…'
                ? <span key={'e' + i} className="px-1.5 text-[var(--ink-4)]">…</span>
                : <Button key={p} variant={p === pageClamped ? 'default' : 'outline'} size="sm" className="min-w-9 px-0" onClick={() => setPage(p)}>{p}</Button>)}
              <Button variant="outline" size="sm" className="gap-1" disabled={pageClamped >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>ถัดไป <Icon name="chevR" /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* popup รายละเอียดวัน (กดแท่งกราฟ) */}
      {dayOpen && (
        <SideSheet size="lg" icon="calendarDays"
          title={`ออเดอร์ CRM วันที่ ${Number(dayOpen.slice(8, 10))}`}
          sub={`${dayOpen}${effSeller ? ` · ${effSeller}` : ' · รวมทุกคน'}`}
          onClose={() => setDayOpen(null)}>
          <CrmDayDetail dateISO={dayOpen} orders={dayOrders} allOrders={raw?.orders} seller={effSeller} user={user} contacts={contacts}
            onPickCustomer={(o) => { const c = (data || []).find(x => x.key === crmCustomerKey(o)); setDayOpen(null); if (c) setSel(c); }} />
        </SideSheet>
      )}

      {sel && <CustomerDetail c={sel} onClose={() => setSel(null)} onSaved={applyProfile} />}
    </div>
  );
}
