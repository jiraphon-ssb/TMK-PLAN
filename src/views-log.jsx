/* ============================================================
   TMK Operation — "บันทึกกิจกรรม / Log" (Comprehensive Audit Trail) · PART 54
   ============================================================
   Section แยกเต็มหน้า · แอดมินเท่านั้น (gate ที่ App)
   - ดึงตรงจาก tmk_audit_logs (server-paginated 50/หน้า · count exact)
   - กรอง server-side ผ่านคอลัมน์ใหม่ (entity_type/severity + user/action/flow/date)
     · graceful: ก่อนรัน migration 20260707 = คอลัมน์ใหม่ไม่มี → ตัดตัวกรองนั้นเงียบ + หมายเหตุ
   - detail drawer (raw JSON/machine data) · CSV export ตาม filter · live-tail toggle
   ============================================================ */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Icon, N, Avatar, SkelTable } from './components.jsx';
import { supabase } from './lib/supabaseClient.js';
import { rtDiag } from './realtime/diagnostics.js';
import { useData } from './dataContext.jsx';
import { TMK } from './data.js';
import { downloadCsv } from './lib/exportCsv.js';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { SearchInput } from '@/components/ui/search-input';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from './lib/appBus.js';
import { MultiSelect } from './components/MultiSelect.jsx'; // แหล่งเดียวของทั้งแอป (เดิมมีสำเนา 6 ชุด)

const DD = TMK;

/* ---- ความหมาย action/entity/severity (สำเนา · ให้ไฟล์นี้แยกอิสระ · ไม่ drag chunk views-2) ---- */
const ACTION_META = {
  create:  { l: 'สร้าง',       c: 'var(--good)',    g: 'create' },
  update:  { l: 'แก้ไข',       c: 'var(--info)',    g: 'update' },
  delete:  { l: 'ลบ',          c: 'var(--bad)',     g: 'delete' },
  purge:   { l: 'ลบถาวร',      c: 'var(--bad)',     g: 'delete' },
  restore: { l: 'กู้คืน',       c: 'var(--good)',    g: 'create' },
  move:    { l: 'ย้ายสถานะ',   c: 'var(--accent)',  g: 'update' },
  sale:    { l: 'ขาย/ตัดสต็อก', c: 'var(--accent)',  g: 'update' },
  adjust:  { l: 'ปรับสต็อก',    c: 'var(--info)',    g: 'update' },
  receive: { l: 'รับเข้าสต็อก', c: 'var(--good)',    g: 'create' },
  reserve: { l: 'จองสต็อก',     c: 'var(--accent)',  g: 'update' },
  release: { l: 'ปล่อยจอง',     c: 'var(--ink-3)',   g: 'update' },
  order:   { l: 'ออเดอร์',      c: 'var(--accent-2)', g: 'update' },
  export:  { l: 'ส่งออก',      c: 'var(--warn)',    g: 'update' },
  login:   { l: 'เข้าสู่ระบบ',   c: 'var(--good)',    g: 'auth' },
  logout:  { l: 'ออกจากระบบ',   c: 'var(--ink-3)',   g: 'auth' },
};
const actionMeta = (a) => ACTION_META[a] || { l: a || 'อื่นๆ', c: 'var(--info)', g: 'update' };
const ACTION_GROUP = Object.entries(ACTION_META).reduce((acc, [k, v]) => { (acc[v.g] = acc[v.g] || []).push(k); return acc; }, {});
const ENTITY_TH = { task:'งาน', flow:'โครงการ', comment:'คอมเมนต์', order:'ออเดอร์', receipt:'ใบเสร็จ', customer:'ลูกค้า', product:'สินค้า', campaign:'แคมเปญ', channel:'ช่องทาง', duty:'หน้าที่', brand:'แบรนด์', user:'ผู้ใช้', daily:'ยอดขายรายวัน', monthly:'รายเดือน', segment:'กลุ่มลูกค้า', adCampaign:'แคมเปญแอด', ad:'แคมเปญแอด', po:'PO / สต็อก', target:'เป้า/คอม', auth:'ระบบ', data:'ข้อมูล', settings:'ตั้งค่า', system:'ระบบ' };
const ENTITY_KEYS = ['task','flow','comment','order','receipt','customer','product','campaign','channel','duty','brand','user','daily','monthly','segment','ad','po','target','settings','data','auth'];
const SEV_META = {
  info:   { l: 'ปกติ',   c: 'var(--info)' },
  warn:   { l: 'เตือน',   c: 'var(--warn)' },
  urgent: { l: 'สำคัญ',   c: 'var(--bad)' },
};


/* ---- helpers ---- */
const PAGE = 50;
const TH_TZ = '+07:00';
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const shiftISO = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
// แปลง raw row → รูปที่ใช้แสดง (รองรับทั้งคอลัมน์ใหม่ + fallback details JSON)
function mapRow(r) {
  let d = {};
  try { d = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {}); } catch { /* ignore */ }
  return {
    id: r.id,
    action: r.action || '',
    entity: r.entity_type || d.entityType || '',
    entityId: r.entity_id ?? d.entityId ?? '',
    entityName: d.entityName || '',
    severity: r.severity || 'info',
    user: r.user_email || 'system',
    summary: d.summary || r.action || '',
    changes: Array.isArray(d.changes) ? d.changes : null,
    fields: Array.isArray(d.fields) ? d.fields : null,
    data: d.data || null,
    flowId: r.flow_id ?? d.flowId ?? null,
    ts: r.created_at,
    raw: r,
  };
}
const fmtClock = (ts) => new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });   // แถวในฟีด: เวลาอย่างเดียว (วันอยู่หัวกลุ่ม)
const fmtFull = (ts) => new Date(ts).toLocaleString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
// group หัววัน
function dayLabel(ts) {
  const iso = new Date(ts).toLocaleDateString('sv-SE'); // YYYY-MM-DD local
  const t = todayISO();
  if (iso === t) return 'วันนี้';
  if (iso === shiftISO(t, -1)) return 'เมื่อวาน';
  return new Date(ts).toLocaleDateString('th-TH', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/* ==================================================================== */
export function LogView() {
  const { version } = useData() || {};

  // ---- filters ----
  const [users, setUsers] = useState([]);          // user_email[]
  const [entities, setEntities] = useState([]);    // entity_type[]
  const [severities, setSeverities] = useState([]); // severity[]
  const [actionG, setActionG] = useState('all');   // create|update|delete|auth|all
  const [flowId, setFlowId] = useState('');        // '' = ทั้งหมด
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);   // realtime prepend เฉพาะหน้าแรก (newest)
  useEffect(() => { pageRef.current = page; }, [page]);   // sync ref หลัง commit (อ่านใน callback realtime เท่านั้น)

  // ---- data ----
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [colsOk, setColsOk] = useState(true);       // false = ยังไม่รัน migration (คอลัมน์ใหม่ไม่มี)
  const [stats, setStats] = useState({ today: 0, groups: {} });
  const [detail, setDetail] = useState(null);       // row สำหรับ drawer
  const [filtersOpen, setFiltersOpen] = useState(false);   // ตัวกรองละเอียดพับไว้ (เปิดมาเห็นข้อมูลก่อน)

  // reset page เมื่อ filter เปลี่ยน
  const resetPage = () => setPage(0);
  useEffect(() => { const id = setTimeout(() => { setSearchQ(search); setPage(0); }, 300); return () => clearTimeout(id); }, [search]);

  // ตัวเลือกผู้ใช้ (จาก staff + flow) — data-driven
  const userOpts = useMemo(() => {
    const seen = new Map();
    (DD.staff || []).forEach(s => { if (s.email) seen.set(s.email, s.name || s.email); });
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- DD เป็น singleton module-level (ไม่ใช่ reactive) · version = สัญญาณให้คำนวณใหม่หลังโหลดข้อมูล ห้ามตัดทิ้ง
  }, [version]);
  const entityOpts = useMemo(() => ENTITY_KEYS.map(k => ({ value: k, label: ENTITY_TH[k] || k })), []);
  const sevOpts = useMemo(() => Object.entries(SEV_META).map(([value, m]) => ({ value, label: m.l })), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- DD เป็น singleton module-level (ไม่ใช่ reactive) · version = สัญญาณให้คำนวณใหม่หลังโหลดข้อมูล ห้ามตัดทิ้ง
  const flows = useMemo(() => (DD.flows || []).filter(f => f.id !== '__general__'), [version]);

  // สร้าง query ตาม filter (ใช้ทั้งดึงข้อมูล + count)
  const applyFilters = useCallback((q, { withRange = true, withAction = true } = {}) => {
    q = q.order('created_at', { ascending: false });
    if (withRange) q = q.range(page * PAGE, page * PAGE + PAGE - 1);
    if (dateFrom) q = q.gte('created_at', dateFrom + 'T00:00:00' + TH_TZ);
    if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59' + TH_TZ);
    if (users.length) q = q.in('user_email', users);
    if (searchQ.trim()) q = q.ilike('details', `%${searchQ.trim()}%`);
    if (withAction && actionG !== 'all') q = q.in('action', ACTION_GROUP[actionG] || [actionG]);
    // คอลัมน์ใหม่ — เฉพาะเมื่อ migration รันแล้ว (colsOk)
    if (colsOk && entities.length) q = q.in('entity_type', entities);
    if (colsOk && severities.length) q = q.in('severity', severities);
    if (flowId) q = q.eq('flow_id', flowId);
    return q;
  }, [page, dateFrom, dateTo, users, searchQ, actionG, entities, severities, flowId, colsOk]);

  // ดึงข้อมูล + สถิติ
  useEffect(() => {
    let cancel = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag ก่อน async fetch
    setLoading(true);
    (async () => {
      const q = applyFilters(supabase.from('tmk_audit_logs').select('*', { count: 'exact' }));
      const { data, count, error } = await q;
      if (cancel) return;
      if (error) {
        // graceful: คอลัมน์ใหม่ยังไม่มี → ปิด adv filter แล้วให้ effect รันซ้ำ
        if (colsOk && /(entity_type|severity|entity_id|column)/i.test(error.message || '')) { setColsOk(false); return; }
        setRows([]); setTotal(0); setLoading(false); return;
      }
      setRows((data || []).map(mapRow)); setTotal(count || 0); setLoading(false);
    })();
    return () => { cancel = true; };
    // colsOk อยู่ใน deps ของ applyFilters อยู่แล้ว → ใส่เพิ่มไม่ทำให้ยิงซ้ำ
  }, [applyFilters, colsOk]);

  // สถิติ (วันนี้ + นับต่อกลุ่ม action) — เคารพ filter อื่น ยกเว้น action-group เอง
  useEffect(() => {
    let cancel = false;
    (async () => {
      const headBase = () => applyFilters(supabase.from('tmk_audit_logs').select('id', { count: 'exact', head: true }), { withRange: false, withAction: false });
      const todayQ = headBase().gte('created_at', todayISO() + 'T00:00:00' + TH_TZ);
      const groups = ['create', 'update', 'delete', 'auth'];
      const [todayR, ...grpR] = await Promise.all([
        todayQ,
        ...groups.map(g => headBase().in('action', ACTION_GROUP[g] || [])),
      ]);
      if (cancel) return;
      const gc = {}; groups.forEach((g, i) => { gc[g] = grpR[i]?.count || 0; });
      setStats({ today: todayR?.count || 0, groups: gc });
    })();
    return () => { cancel = true; };
  }, [applyFilters]);

  // ---- realtime: subscribe INSERT เสมอ (log ใหม่ขึ้นบนสุดทันที · ไม่ต้องติ๊ก · teardown สะอาด) ----
  const chRef = useRef(null);
  // client-side filter สำหรับแถวที่ไหลเข้า (ให้ตรงกับ filter ปัจจุบัน)
  const passesFilter = useCallback((m) => {
    if (users.length && !users.includes(m.user)) return false;
    if (actionG !== 'all' && !(ACTION_GROUP[actionG] || []).includes(m.action)) return false;
    if (colsOk && entities.length && !entities.includes(m.entity)) return false;
    if (colsOk && severities.length && !severities.includes(m.severity)) return false;
    if (flowId && m.flowId !== flowId) return false;
    if (searchQ.trim() && !JSON.stringify(m.raw?.details || '').includes(searchQ.trim())) return false;
    return true;
  }, [users, actionG, entities, severities, flowId, searchQ, colsOk]);
  const passRef = useRef(passesFilter);
  useEffect(() => { passRef.current = passesFilter; }, [passesFilter]);   // sync ref หลัง commit (อ่านใน callback realtime เท่านั้น)

  useEffect(() => {
    const ch = supabase.channel('audit-live-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tmk_audit_logs' }, (payload) => {
        rtDiag.event('tmk_audit_logs'); // Phase 0 baseline (dev-only) — ตัวอย่าง patch จาก payload (ไม่ refetch)
        const m = mapRow(payload.new || {});
        setTotal(t => t + 1);
        if (pageRef.current !== 0 || !passRef.current(m)) return;   // แทรกบนสุดเฉพาะหน้าแรก + ผ่านตัวกรอง
        setRows(prev => prev.some(x => x.id === m.id) ? prev : [{ ...m, _fresh: true }, ...prev].slice(0, PAGE));
      })
      .subscribe();
    chRef.current = ch; rtDiag.channelOpen('audit-live');
    return () => { const c = chRef.current; chRef.current = null; rtDiag.channelClose('audit-live'); if (c) supabase.removeChannel(c); };
  }, []);

  // ---- CSV export (ตาม filter · ดึงวน cap 5000) ----
  const [exporting, setExporting] = useState(false);
  const exportCsvNow = async () => {
    setExporting(true);
    try {
      const CAP = 5000, CHUNK = 1000; let all = [], from = 0;
      while (from < CAP) {
        const q = applyFilters(supabase.from('tmk_audit_logs').select('*', { count: 'exact' }), { withRange: false })
          .range(from, from + CHUNK - 1);
        const { data, error } = await q;
        if (error || !data?.length) break;
        all = all.concat(data.map(mapRow));
        if (data.length < CHUNK) break;
        from += CHUNK;
      }
      const truncated = all.length >= CAP;
      downloadCsv(`activity-log-${todayISO()}`, all, [
        { key: 'ts', label: 'เวลา', map: r => fmtFull(r.ts) },
        { key: 'user', label: 'ผู้ใช้', map: r => nameOf(r.user) },
        { key: 'email', label: 'อีเมล', map: r => r.user },
        { key: 'action', label: 'การกระทำ', map: r => actionMeta(r.action).l },
        { key: 'entity', label: 'ชนิด', map: r => ENTITY_TH[r.entity] || r.entity },
        { key: 'severity', label: 'ระดับ', map: r => SEV_META[r.severity]?.l || r.severity },
        { key: 'summary', label: 'รายละเอียด' },
        { key: 'flowId', label: 'โครงการ', map: r => (DD.flows || []).find(f => f.id === r.flowId)?.name || (r.flowId === '' ? 'งานทั่วไป' : '') },
      ]);
      toast(truncated ? `ส่งออก ${N(all.length)} รายการ (ครบสูงสุด — กรองช่วงให้แคบลงเพื่อครบทั้งหมด)` : `ส่งออก ${N(all.length)} รายการ`, 'success');
    } catch (e) { toast('ส่งออกไม่สำเร็จ: ' + (e?.message || ''), 'warn'); }
    setExporting(false);
  };

  // ---- chips + clear ----
  const nFilters = users.length + entities.length + severities.length + (actionG !== 'all' ? 1 : 0) + (flowId ? 1 : 0) + (dateFrom || dateTo ? 1 : 0) + (searchQ ? 1 : 0);
  const clearAll = () => { setUsers([]); setEntities([]); setSeverities([]); setActionG('all'); setFlowId(''); setDateFrom(''); setDateTo(''); setSearch(''); setSearchQ(''); setPage(0); };

  const datePresets = useMemo(() => {
    const t = todayISO();
    return [
      { label: 'วันนี้', from: t, to: t },
      { label: '7 วัน', from: shiftISO(t, -6), to: t },
      { label: '30 วัน', from: shiftISO(t, -29), to: t },
      { label: 'เดือนนี้', from: `${t.slice(0, 7)}-01`, to: t },
    ];
  }, []);
  const setRange = (from, to) => { setDateFrom(from); setDateTo(to); setPage(0); };
  const activePresetLabel = datePresets.find(p => p.from === dateFrom && p.to === dateTo)?.label;
  const activePreset = activePresetLabel;
  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const nameOf = (email) => (DD.staff.find(s => s.email === email || s.name === email)?.name) || (email || '').split('@')[0] || 'system';
  // ชิปบอกตัวกรองที่เปิดอยู่ (เห็นแม้พับแผง) + จำนวนตัวกรองละเอียด
  const nAdv = users.length + entities.length + severities.length + (flowId ? 1 : 0) + ((dateFrom || dateTo) ? 1 : 0);
  const activeChips = [
    ...users.map(v => ({ label: `ผู้ใช้: ${nameOf(v)}`, clear: () => { setUsers(users.filter(x => x !== v)); resetPage(); } })),
    ...entities.map(v => ({ label: `ชนิด: ${ENTITY_TH[v] || v}`, clear: () => { setEntities(entities.filter(x => x !== v)); resetPage(); } })),
    ...severities.map(v => ({ label: `ระดับ: ${SEV_META[v]?.l || v}`, clear: () => { setSeverities(severities.filter(x => x !== v)); resetPage(); } })),
    ...(flowId ? [{ label: `โครงการ: ${(flows.find(f => f.id === flowId) || {}).name || flowId}`, clear: () => { setFlowId(''); resetPage(); } }] : []),
    ...((dateFrom || dateTo) && activePresetLabel !== 'วันนี้' ? [{ label: `ช่วง: ${dateFrom || '—'} → ${dateTo || '—'}`, clear: () => setRange('', '') }] : []),
  ];

  // ข้อมูลอยู่ใน TMK singleton แล้ว = ไม่มีการโหลดจริง → render ทันที (เดิมมี skeleton หลอก 320-350ms)

  return (
    <div className="flex flex-col gap-4 max-w-6xl mx-auto w-full">
      {/* ---- หัว + สถิติ ---- */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Icon name="clock" className="size-6 text-primary" />
          <h1 className="text-xl font-bold">บันทึกกิจกรรม</h1>
          <span className="text-sm text-muted-foreground font-normal">({N(total)})</span>
        </div>
        <div className="sm:ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1" title="อัปเดตสด — log ใหม่ขึ้นบนสุดทันที"><span className="size-2 rounded-full bg-[var(--good)] animate-pulse" /> อัปเดตสด</span>
          <Button variant="outline" size="sm" onClick={exportCsvNow} disabled={exporting}>
            <Icon name={exporting ? 'refresh' : 'external'} className={'size-4 mr-1.5' + (exporting ? ' animate-spin' : '')} /> CSV
          </Button>
        </div>
      </div>

      {/* ---- แถบเดียว: ชิปกรองที่กดได้ (เดิมเป็น KPI 5 กล่องกดไม่ได้ + ชิปกรองซ้ำอีกแถว) + ตัวกรองละเอียดพับไว้ ---- */}
      <Card className="p-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            ['all', 'ทั้งหมด', N(total), 'var(--ink-2)'],
            ['create', 'สร้าง', N(stats.groups.create || 0), 'var(--good)'],
            ['update', 'แก้ไข/ย้าย', N(stats.groups.update || 0), 'var(--info)'],
            ['delete', 'ลบ', N(stats.groups.delete || 0), 'var(--bad)'],
            ['auth', 'เข้า/ออก', N(stats.groups.auth || 0), 'var(--ink-3)'],
          ].map(([k, l, v, c]) => {
            const on = actionG === k;
            return (
              <button type="button" key={k} onClick={() => { setActionG(k); resetPage(); }} aria-pressed={on}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors"
                style={{ borderColor: on ? c : 'var(--line)', background: on ? `color-mix(in srgb, ${c} 12%, var(--surface))` : 'var(--surface)', color: on ? c : 'var(--ink-3)' }}>
                {k !== 'all' && <span className="size-2 rounded-full" style={{ background: c }} />}{l} <b className="num">{v}</b>
              </button>
            );
          })}
          <span className="mx-1 h-5 w-px" style={{ background: 'var(--line)' }} />
          {/* วันนี้ = ตัวกรองช่วงวัน (เดิมเป็นตัวเลขเฉยๆ ใน KPI) */}
          <button type="button" onClick={() => setRange(activePreset === 'วันนี้' ? '' : todayISO(), activePreset === 'วันนี้' ? '' : todayISO())} aria-pressed={activePreset === 'วันนี้'}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors"
            style={{ borderColor: activePreset === 'วันนี้' ? 'var(--accent)' : 'var(--line)', background: activePreset === 'วันนี้' ? 'var(--accent-soft)' : 'var(--surface)', color: activePreset === 'วันนี้' ? 'var(--accent-2)' : 'var(--ink-3)' }}>
            วันนี้ <b className="num">{N(stats.today)}</b>
          </button>
          <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาในบันทึก" wrapperClassName="ml-auto w-full sm:w-56" className="h-8" />
          <Button variant="outline" size="sm" className="h-8 gap-1.5 shrink-0" onClick={() => setFiltersOpen(v => !v)} aria-expanded={filtersOpen}>
            <Icon name="filter" className="size-3.5" /> ตัวกรอง{nAdv > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nAdv}</Badge>}
            <Icon name="chevD" className="size-3.5" style={filtersOpen ? { transform: 'rotate(180deg)' } : undefined} />
          </Button>
        </div>
        {/* ชิปตัวกรองที่เปิดอยู่ — เห็นเสมอแม้พับแผงไว้ */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {activeChips.map(({ label, clear }) => (
              <Badge key={label} variant="outline" onClick={clear} title="คลิกเพื่อเอาออก" style={{ cursor: 'pointer', padding: '2px 8px' }}>{label} <Icon name="x" className="size-3" /></Badge>
            ))}
            <Button variant="ghost" size="sm" className="h-7 text-[var(--bad)]" onClick={clearAll}>ล้างทั้งหมด</Button>
          </div>
        )}
        {filtersOpen && (
          <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
            <div className="flex flex-wrap items-center gap-2">
              <MultiSelect label="ผู้ใช้" options={userOpts} value={users} onChange={(v) => { setUsers(v); resetPage(); }} />
              <MultiSelect label="ชนิด" options={entityOpts} value={entities} onChange={(v) => { setEntities(v); resetPage(); }} />
              <MultiSelect label="ระดับ" options={sevOpts} value={severities} onChange={(v) => { setSeverities(v); resetPage(); }}
                render={o => <span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: SEV_META[o.value]?.c }} />{o.label}</span>} />
              {flows.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className={'h-8 rounded-full font-normal gap-1' + (flowId ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')}>
                      โครงการ{flowId && <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[11px]">1</Badge>}<Icon name="chevD" className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={6} className="max-h-72 w-52 overflow-auto">
                    <DropdownMenuLabel className="py-1">โครงการ</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem checked={flowId === ''} onSelect={e => { e.preventDefault(); setFlowId(''); resetPage(); }}>ทั้งหมด</DropdownMenuCheckboxItem>
                    {flows.map(f => <DropdownMenuCheckboxItem key={f.id} checked={flowId === f.id} onSelect={e => { e.preventDefault(); setFlowId(f.id); resetPage(); }}>{f.name}</DropdownMenuCheckboxItem>)}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-background border rounded-md p-1 h-9">
                <DatePicker value={dateFrom} onChange={(v) => setRange(v, dateTo)} placeholder="ตั้งแต่" className="h-7 w-[130px] text-sm" />
                <span className="text-muted-foreground text-sm">→</span>
                <DatePicker value={dateTo} onChange={(v) => setRange(dateFrom, v)} placeholder="ถึง" className="h-7 w-[130px] text-sm" />
              </div>
              {datePresets.map(p => (
                <Button key={p.label} variant={activePreset === p.label ? 'secondary' : 'outline'} size="sm" onClick={() => setRange(p.from, p.to)}>{p.label}</Button>
              ))}
              {!colsOk && <span className="text-[12px] text-[var(--warn)]">* กรอง “ชนิด/ระดับ” ครบเมื่อรัน migration 20260707</span>}
            </div>
          </div>
        )}
      </Card>

      {/* ---- รายการ (group ตามวัน) ---- */}
      <Card className="overflow-hidden">
        {loading && <div className="p-4"><SkelTable cols={3} rows={8} /></div>}
        {!loading && rows.length === 0 && (
          <div className="py-16 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed m-4 rounded-lg bg-muted/10">
            <Icon name="clock" className="size-8 opacity-20 mb-3" />
            <p className="text-sm">ไม่พบบันทึกตามเงื่อนไข</p>
            {nFilters > 0 && <Button variant="link" size="sm" onClick={clearAll}>ล้างตัวกรอง</Button>}
          </div>
        )}
        {!loading && rows.length > 0 && (
          <div className="flex flex-col">
            {rows.map((a, i) => {
              const prev = rows[i - 1];
              const showDay = !prev || dayLabel(prev.ts) !== dayLabel(a.ts);
              return (
                <div key={a.id}>
                  {showDay && <div className="px-4 py-1.5 bg-muted/40 text-[12px] font-semibold text-muted-foreground border-y border-border/40 sticky top-0 z-[1]">{dayLabel(a.ts)}</div>}
                  <LogRow a={a} onClick={() => setDetail(a)} nameOf={nameOf} />
                </div>
              );
            })}
          </div>
        )}
        {/* pagination (ซ่อนตอน live-tail) */}
        {total > PAGE && (
          <div className="flex items-center justify-center gap-4 p-3 border-t bg-muted/10">
            <Button variant="outline" size="sm" disabled={page <= 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}><Icon name="chevL" className="size-4 mr-1.5" /> ก่อนหน้า</Button>
            <span className="text-sm text-muted-foreground tabular-nums">หน้า {page + 1} <span className="opacity-50">/</span> {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1 || loading} onClick={() => setPage(p => p + 1)}>ถัดไป <Icon name="chevR" className="size-4 ml-1.5" /></Button>
          </div>
        )}
      </Card>

      {/* ---- detail drawer ---- */}
      <Sheet open={!!detail} onOpenChange={o => { if (!o) setDetail(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {detail && <LogDetail a={detail} nameOf={nameOf} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}


function LogRow({ a, onClick, nameOf }) {
  const m = actionMeta(a.action);
  const s = DD.staff.find(x => x.email === a.user || x.name === a.user) || { color: 'var(--ink-3)' };
  const sev = SEV_META[a.severity] || SEV_META.info;
  const fl = a.flowId == null ? null : (a.flowId === '' ? { name: 'งานทั่วไป', color: '#64748b' } : (DD.flows || []).find(f => f.id === a.flowId));
  const who = nameOf(a.user);
  // สรุป: ตัดชื่อคนที่ห้อยท้ายในวงเล็บ "(PAI)" ออก — ซ้ำกับ avatar+ชื่อด้านหน้าอยู่แล้ว (เทียบแบบไม่สนตัวพิมพ์ · ครอบทั้งชื่อและอีเมล)
  const summary = (() => {
    const t = String(a.summary || '').trim();
    const m2 = t.match(/\(([^()]{1,40})\)\s*$/);
    if (!m2) return t;
    const inside = m2[1].trim().toLowerCase();
    const mine = [who, a.user, String(a.user || '').split('@')[0]].filter(Boolean).map(x => String(x).toLowerCase());
    return mine.includes(inside) ? t.slice(0, m2.index).trim() : t;
  })();
  return (
    <button onClick={onClick} className={'w-full text-left flex gap-2.5 px-3 py-2.5 sm:px-4 hover:bg-muted/30 transition-colors border-b border-border/40 ' + (a._fresh ? 'bg-[var(--good)]/5' : '')}>
      <span className="mt-1.5 size-2 shrink-0 rounded-full" title={sev.l} style={{ background: sev.c }} />
      <div className="shrink-0"><Avatar name={who} color={s.color} size={30} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-semibold shrink-0" style={{ background: m.c + '15', color: m.c, borderColor: m.c + '30' }}>{m.l}</Badge>
          <span className="text-[13.5px] text-foreground/90 min-w-0">{summary}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 flex-wrap text-[11px]" style={{ color: 'var(--ink-4)' }}>
          <span className="font-medium" style={{ color: 'var(--ink-3)' }}>{who}</span>
          <span>· {ENTITY_TH[a.entity] || a.entity || 'ระบบ'}</span>
          {fl && <span className="inline-flex items-center gap-1">· <span className="size-1.5 rounded-full" style={{ background: fl.color || '#64748b' }} />{fl.name}</span>}
        </div>
        {a.changes && a.changes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {a.changes.slice(0, 3).map((c, j) => (
              <Badge key={j} variant="secondary" className="text-[11px] font-normal bg-muted/50">
                <span className="opacity-70 mr-1">{c.label}:</span><span className="line-through opacity-50 mr-1">{c.from || '—'}</span><span className="mx-0.5">→</span><span className="text-primary font-semibold ml-1">{c.to || '—'}</span>
              </Badge>
            ))}
            {a.changes.length > 3 && <span className="text-[11px] text-muted-foreground self-center">+{a.changes.length - 3}</span>}
          </div>
        )}
      </div>
      {/* เวลาอย่างเดียว — วันที่อยู่หัวกลุ่มวันแล้ว */}
      <span className="shrink-0 self-start text-[11px] tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-4)' }}>{fmtClock(a.ts)}</span>
    </button>
  );
}

function relTime(ts) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 90) return 'เมื่อสักครู่';
  if (diff < 3600) return `${Math.round(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.round(diff / 3600)} ชม.ที่แล้ว`;
  const d = Math.round(diff / 86400);
  return d < 30 ? `${d} วันที่แล้ว` : '';
}
function LogDetail({ a, nameOf }) {
  // รื้อ 22 ส.ค.: เดิม JSON 2 ก้อนกางเต็มเสมอ (Raw ครอบ machine อยู่แล้ว) + "รายละเอียด" เป็นชิป 12 อันเรียงยาว
  const [rawOpen, setRawOpen] = useState(false);
  const m = actionMeta(a.action);
  const sev = SEV_META[a.severity] || SEV_META.info;
  const st = DD.staff.find(x => x.email === a.user || x.name === a.user) || { color: 'var(--ink-3)' };
  const fl = a.flowId == null ? null : (a.flowId === '' ? { name: 'งานทั่วไป', color: '#64748b' } : (DD.flows || []).find(f => f.id === a.flowId));
  const rawJson = (() => { try { return JSON.stringify(JSON.parse(a.raw.details), null, 2); } catch { return String(a.raw.details || ''); } })();
  const copy = (txt) => { navigator.clipboard?.writeText(txt).then(() => toast('คัดลอกแล้ว', 'success')); };
  const who = nameOf(a.user);
  const entityTh = ENTITY_TH[a.entity] || a.entity || 'ระบบ';
  const idShown = a.entityId && String(a.entityId) !== String(a.entityName || '') && !String(a.entityName || '').includes(String(a.entityId));
  const rel = relTime(a.ts);
  // ข้อความสรุปทั้งรายการ (คัดลอกไปแปะแชท/ตั๋วได้เลย)
  const plain = [
    `${m.l} · ${entityTh}${a.entityName ? ` · ${a.entityName}` : ''}`,
    a.summary,
    `${who} (${a.user}) · ${fmtFull(a.ts)}`,
    ...(a.fields || []).map(f => `${f.label}: ${f.value}`),
    ...(a.changes || []).map(c => `${c.label}: ${c.from || '—'} → ${c.to || '—'}`),
  ].filter(Boolean).join('\n');
  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-start gap-2.5">
          <Avatar name={who} color={st.color} size={34} />
          <div className="flex flex-col items-start min-w-0">
            <span className="row items-center gap-2 flex-wrap">
              <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-semibold" style={{ background: m.c + '15', color: m.c, borderColor: m.c + '30' }}>{m.l}</Badge>
              <span className="text-base">{entityTh}</span>
              {a.severity !== 'info' && <Badge variant="outline" className="h-5 px-1.5 text-[11px]" style={{ background: sev.c + '15', color: sev.c, borderColor: sev.c + '30' }}>{sev.l}</Badge>}
            </span>
            <span className="text-xs font-normal text-muted-foreground mt-0.5">{who} · {rel ? `${rel} · ` : ''}{fmtFull(a.ts)}</span>
          </div>
        </SheetTitle>
      </SheetHeader>
      <div className="flex flex-col gap-4 mt-3">
        {/* สรุปสิ่งที่เกิดขึ้น — เด่นสุดในหน้า */}
        <div className="rounded-xl border p-3.5" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
          <div className="text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>{a.summary || '—'}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: 'var(--ink-4)' }}>
            {a.entityName && <span>รายการ: <b style={{ color: 'var(--ink-2)' }}>{a.entityName}</b>{idShown ? <span className="num"> #{a.entityId}</span> : null}</span>}
            {fl && <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: fl.color }} />{fl.name}</span>}
            <span className="num">{a.user}</span>
          </div>
        </div>

        {/* การเปลี่ยนแปลง — ตาราง จาก → เป็น */}
        {a.changes && a.changes.length > 0 && (
          <div>
            <div className="text-[12px] font-semibold text-muted-foreground mb-1.5">การเปลี่ยนแปลง ({N(a.changes.length)})</div>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--line)' }}>
              {a.changes.map((c, j) => (
                <div key={j} className="grid items-center gap-2 px-3 py-2 text-[13px]" style={{ gridTemplateColumns: 'minmax(72px, 26%) 1fr auto 1fr', borderTop: j ? '1px solid var(--line)' : undefined }}>
                  <span className="truncate" style={{ color: 'var(--ink-4)' }}>{c.label}</span>
                  <span className="truncate line-through" style={{ color: 'var(--ink-4)' }}>{c.from || '—'}</span>
                  <Icon name="arrowR" className="size-3.5" style={{ color: 'var(--ink-4)' }} />
                  <span className="truncate font-semibold" style={{ color: 'var(--accent-2)' }}>{c.to || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* รายละเอียด — ตารางคีย์/ค่า (เดิมเป็นชิป 12 อันเรียงพันกัน อ่านคู่ไม่ออก) */}
        {a.fields && a.fields.length > 0 && (
          <div>
            <div className="text-[12px] font-semibold text-muted-foreground mb-1.5">รายละเอียด</div>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--line)' }}>
              {a.fields.map((f, j) => (
                <div key={j} className="flex items-start gap-3 px-3 py-1.5 text-[13px]" style={{ borderTop: j ? '1px solid var(--line)' : undefined, background: j % 2 ? 'var(--surface-2)' : undefined }}>
                  <span className="shrink-0" style={{ color: 'var(--ink-4)', width: 108 }}>{f.label}</span>
                  <span className="min-w-0 flex-1 font-medium" style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>{f.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ข้อมูลดิบ — พับไว้ (คนใช้จริงไม่ได้อ่าน · เดิมกางเต็ม 2 ก้อนซ้ำกัน) */}
        <div className="rounded-lg border" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-center gap-2 px-3 py-2">
            <button type="button" onClick={() => setRawOpen(v => !v)} className="row items-center gap-1.5 text-[12px] font-semibold" style={{ color: 'var(--ink-3)' }} aria-expanded={rawOpen}>
              <Icon name="chevD" className="size-3.5" style={rawOpen ? { transform: 'rotate(180deg)' } : undefined} /> ข้อมูลดิบ (JSON)
            </button>
            <span className="text-[11px] text-muted-foreground">สำหรับตรวจสอบ/ส่งให้ผู้ดูแลระบบ</span>
            <button type="button" className="ml-auto text-[11px] text-primary hover:underline" onClick={() => copy(rawJson)}>คัดลอก JSON</button>
          </div>
          {rawOpen && (
            <div className="border-t px-3 py-2" style={{ borderColor: 'var(--line)' }}>
              {a.data && <>
                <div className="mb-1 text-[11px] font-semibold text-muted-foreground">data</div>
                <pre className="mb-2 max-h-56 overflow-auto rounded-md bg-muted/40 p-2.5 text-[11px]">{JSON.stringify(a.data, null, 2)}</pre>
              </>}
              <div className="mb-1 text-[11px] font-semibold text-muted-foreground">details (ทั้งก้อน)</div>
              <pre className="max-h-72 overflow-auto rounded-md bg-muted/40 p-2.5 text-[11px]">{rawJson}</pre>
            </div>
          )}
        </div>

        <Button variant="outline" size="sm" className="self-start gap-1.5" onClick={() => copy(plain)}><Icon name="layers" className="size-3.5" /> คัดลอกสรุปทั้งรายการ</Button>
      </div>
    </>
  );
}

