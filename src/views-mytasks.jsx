/* ============================================================
   views-mytasks.jsx — "งานของฉัน" (My Tasks) แยกจาก views-flows god-file (PART 84 REFACTOR-1)
   ============================================================
   FlowsView (views-flows.jsx) เรียก <MyTasksView/> เมื่อ sub==="mytasks" · behavior-preserving
   ============================================================ */
import { useState, useMemo } from 'react';
import { TMK } from './data.js';
import { Icon } from './components.jsx';
import { useData } from './dataContext.jsx';
import { SearchInput } from '@/components/ui/search-input';
import { TaskCard } from './taskCard.jsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Checkbox as ShadcnCheckbox } from '@/components/ui/checkbox';
import { userEmail, openModal } from './lib/appBus.js';
import { EmptyState } from './components/EmptyState.jsx';

/* ============================================================
   งานของฉัน (My Tasks) — ครบวงจร: KPI + ค้นหา/กรอง/เรียง/จัดกลุ่ม
   - จับคู่ตัวตน: userEmail() → ชื่อ/บทบาทใน TMK.roles + TMK.staff (+ dutyName)
   - reuse <TaskCard showFlow> · realtime ผ่าน useData().version
   ============================================================ */
const MT_PRIO = [{ id: 'high', name: 'สูง', color: '#cf4d5c' }, { id: 'medium', name: 'กลาง', color: '#c08a3e' }, { id: 'low', name: 'ต่ำ', color: '#64748b' }];
const mtToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ตัวกรอง multi-select เล็ก (reuse DropdownMenu + Checkbox) — ซ่อนเองถ้าไม่มีตัวเลือก (data-driven)
function MtFilter({ label, icon, options, value, onChange }) {
  if (!options || !options.length) return null;
  const toggle = (id) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  const active = value.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={active ? 'secondary' : 'outline'} size="sm" className="h-8 gap-1.5">
          <span className="inline-flex w-4 justify-center shrink-0"><Icon name={icon} className="size-3.5" /></span>
          {label}{active ? ` (${value.length})` : ''}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="max-h-72 overflow-auto">
        {options.map(o => (
          <DropdownMenuItem key={o.id} onSelect={e => { e.preventDefault(); toggle(o.id); }} className="gap-2">
            <ShadcnCheckbox checked={value.includes(o.id)} className="pointer-events-none" />
            {o.color ? <span className="size-2 rounded-full shrink-0" style={{ background: o.color }} /> : null}
            <span className="truncate">{o.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MyTasksView() {
  const { version } = useData() || {}; // realtime/refresh bump → recompute (กัน list ค้างตอนมีงานใหม่มอบหมายเข้ามา)
  const me = userEmail();
  const low = (x) => String(x || '').toLowerCase();
  const myNames = useMemo(() => {
    const s = new Set();
    const role = (TMK.roles || []).find(r => low(r.email) === low(me));
    if (role?.name) s.add(role.name);
    if (role?.dutyName) s.add(role.dutyName);
    const staff = (TMK.staff || []).find(st => low(st.email) === low(me));
    if (staff?.name) s.add(staff.name);
    if (staff?.dutyName) s.add(staff.dutyName);
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, version]); // roles/staff โหลด async → ผูก version ด้วย ไม่งั้นจับคู่ตัวตนไม่ได้จนกว่าจะรีโหลด
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mine = useMemo(() => (TMK.tasks || []).filter(t => (t.responsible || []).some(r => myNames.has(r))), [myNames, version]);

  // helpers (match TaskCard: flow = scopeId??id)
  const flowOf = (t) => (TMK.flows || []).find(x => (x.scopeId ?? x.id ?? '') === (t.flow || ''));
  const isDone = (t) => { const fl = flowOf(t); const sts = (fl?.statuses && fl.statuses.length) ? fl.statuses : null; return sts ? sts.filter(s => s.done).some(s => s.id === t.status) : t.status === 'done'; };
  const statusMeta = (t) => { const fl = flowOf(t); const sts = (fl?.statuses && fl.statuses.length) ? fl.statuses : (TMK.kanbanMeta || []); const m = sts.find(s => s.id === t.status); return { id: t.status || 'todo', label: m?.label || t.status || '—', color: m?.color || '' }; };
  const dueISOf = (t) => t.dateEnd || t.dateISO || '';
  const dueDiff = (t) => { const iso = dueISOf(t); if (!iso) return null; return Math.round((new Date(iso + 'T00:00:00') - new Date(mtToday() + 'T00:00:00')) / 86400000); };
  const chanList = (t) => (Array.isArray(t.channel) ? t.channel : [t.channel]).map(c => String(c || '').trim()).filter(Boolean);

  // filter/sort/group state
  const [query, setQuery] = useState('');
  const [fFlow, setFFlow] = useState([]); const [fStatus, setFStatus] = useState([]); const [fPrio, setFPrio] = useState([]);
  const [fTag, setFTag] = useState([]); const [fChan, setFChan] = useState([]); const [fDue, setFDue] = useState('all');
  const [groupBy, setGroupBy] = useState('status'); const [sortBy, setSortBy] = useState('due');
  const [filtersOpen, setFiltersOpen] = useState(false);   // ตัวกรองละเอียดพับไว้ (เปิดมาเห็นงานก่อน)
  const [doneOpen, setDoneOpen] = useState({});            // กลุ่ม "เสร็จแล้ว" พับไว้ก่อน

  // option lists (data-driven จาก mine)
  const flowOpts = useMemo(() => { const m = new Map(); mine.forEach(t => { const fl = flowOf(t); const id = t.flow || '__general__'; if (!m.has(id)) m.set(id, { id, name: fl?.name || 'งานทั่วไป', color: fl?.color || 'var(--ink-3)' }); }); return [...m.values()]; }, [mine]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- statusMeta เป็นฟังก์ชันที่สร้างใหม่ทุก render (อ่าน TMK ตรงๆ) ใส่เป็น dep จะคำนวณใหม่ทุกครั้ง = memo ไร้ผล
  const statusOpts = useMemo(() => { const m = new Map(); mine.forEach(t => { const s = statusMeta(t); if (!m.has(s.id)) m.set(s.id, { id: s.id, name: s.label, color: s.color }); }); return [...m.values()]; }, [mine]);
  const tagOpts = useMemo(() => { const s = new Set(); mine.forEach(t => (t.tags || []).forEach(x => s.add(x))); return [...s].map(x => ({ id: x, name: x })); }, [mine]);
  const chanOpts = useMemo(() => { const s = new Set(); mine.forEach(t => chanList(t).forEach(x => s.add(x))); return [...s].map(x => ({ id: x, name: x })); }, [mine]);
  const prioOpts = useMemo(() => { const used = new Set(mine.map(t => t.priority || 'medium')); return MT_PRIO.filter(p => used.has(p.id)); }, [mine]);

  // apply filters
  const q = low(query);
  const shown = useMemo(() => mine.filter(t => {
    if (fFlow.length && !fFlow.includes(t.flow || '__general__')) return false;
    if (fStatus.length && !fStatus.includes(t.status)) return false;
    if (fPrio.length && !fPrio.includes(t.priority || 'medium')) return false;
    if (fTag.length && !(t.tags || []).some(x => fTag.includes(x))) return false;
    if (fChan.length && !chanList(t).some(x => fChan.includes(x))) return false;
    if (fDue !== 'all') { const d = dueDiff(t); const open = !isDone(t); if (fDue === 'overdue' && !(open && d != null && d < 0)) return false; if (fDue === 'today' && !(open && d === 0)) return false; if (fDue === 'week' && !(open && d != null && d >= 0 && d <= 7)) return false; }
    if (q) { const hay = `${t.title || ''} ${t.detail || ''} ${(t.tags || []).join(' ')} ${(t.responsible || []).join(' ')}`.toLowerCase(); if (!hay.includes(q)) return false; }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [mine, fFlow, fStatus, fPrio, fTag, fChan, fDue, q]);

  // KPI จาก mine (ก่อนกรอง)
  const openT = mine.filter(t => !isDone(t));
  const kpi = {
    open: openT.length,
    overdue: openT.filter(t => { const d = dueDiff(t); return d != null && d < 0; }).length,
    today: openT.filter(t => dueDiff(t) === 0).length,
    soon: openT.filter(t => { const d = dueDiff(t); return d != null && d > 0 && d <= 7; }).length,
    week: openT.filter(t => { const d = dueDiff(t); return d != null && d >= 0 && d <= 7; }).length,   // = ตัวกรอง fDue 'week' เป๊ะ (รวมงานที่ครบวันนี้)
    done: mine.filter(t => isDone(t)).length,
  };
  const pct = mine.length ? Math.round((kpi.done / mine.length) * 100) : 0;

  // sort + group
  const prioRank = { high: 0, medium: 1, low: 2 };
  const sortFn = (a, b) => {
    if (sortBy === 'priority') return (prioRank[a.priority] ?? 1) - (prioRank[b.priority] ?? 1);
    if (sortBy === 'updated') return String(b.updatedAt || b.dateISO || '').localeCompare(String(a.updatedAt || a.dateISO || ''));
    const da = dueDiff(a), db = dueDiff(b);
    if (da == null && db == null) return 0; if (da == null) return 1; if (db == null) return -1; return da - db;
  };
  const groups = useMemo(() => {
    const sorted = [...shown].sort(sortFn);
    if (groupBy === 'flow') {
      const m = new Map();
      sorted.forEach(t => { const id = t.flow || '__general__'; const fl = flowOf(t); if (!m.has(id)) m.set(id, { key: id, label: fl?.name || 'งานทั่วไป', color: fl?.color || 'var(--ink-3)', items: [] }); m.get(id).items.push(t); });
      return [...m.values()];
    }
    if (groupBy === 'due') {
      const buckets = [
        { key: 'overdue', label: 'เลยกำหนด', color: 'var(--bad)', test: t => { const d = dueDiff(t); return !isDone(t) && d != null && d < 0; } },
        { key: 'today', label: 'ครบวันนี้', color: 'var(--warn)', test: t => !isDone(t) && dueDiff(t) === 0 },
        { key: 'week', label: 'ภายใน 7 วัน', color: 'var(--info)', test: t => { const d = dueDiff(t); return !isDone(t) && d != null && d > 0 && d <= 7; } },
        { key: 'later', label: 'หลังจากนี้', color: 'var(--accent)', test: t => { const d = dueDiff(t); return !isDone(t) && d != null && d > 7; } },
        { key: 'nodate', label: 'ไม่มีกำหนด', color: 'var(--ink-3)', test: t => !isDone(t) && dueDiff(t) == null },
        { key: 'done', label: 'เสร็จแล้ว', color: 'var(--good)', test: t => isDone(t) },
      ];
      return buckets.map(b => ({ key: b.key, label: b.label, color: b.color, items: sorted.filter(b.test) })).filter(b => b.items.length);
    }
    const order = (TMK.kanbanMeta || []).map(k => k.id);
    const m = new Map();
    sorted.forEach(t => { const s = statusMeta(t); if (!m.has(s.id)) m.set(s.id, { key: s.id, label: s.label, color: s.color || (isDone(t) ? 'var(--good)' : 'var(--ink-3)'), items: [] }); m.get(s.id).items.push(t); });
    const arr = [...m.values()];
    arr.sort((a, b) => { const ia = order.indexOf(a.key), ib = order.indexOf(b.key); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, groupBy, sortBy]);

  const openTask = (t) => openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] });
  const anyFilter = fFlow.length || fStatus.length || fPrio.length || fTag.length || fChan.length || fDue !== 'all' || query;
  const clearAll = () => { setFFlow([]); setFStatus([]); setFPrio([]); setFTag([]); setFChan([]); setFDue('all'); setQuery(''); };
  const nAdv = fFlow.length + fStatus.length + fPrio.length + fTag.length + fChan.length;
  const DUE_LABEL = { overdue: 'เลยกำหนด', today: 'ครบวันนี้', week: 'ใน 7 วัน' };
  const nameOfOpt = (opts, id) => (opts.find(o => o.id === id) || {}).name || id;
  const activeChips = [
    ...fFlow.map(v => ({ label: `โครงการ: ${nameOfOpt(flowOpts, v)}`, clear: () => setFFlow(fFlow.filter(x => x !== v)) })),
    ...fStatus.map(v => ({ label: `สถานะ: ${nameOfOpt(statusOpts, v)}`, clear: () => setFStatus(fStatus.filter(x => x !== v)) })),
    ...fPrio.map(v => ({ label: `ความสำคัญ: ${nameOfOpt(MT_PRIO, v)}`, clear: () => setFPrio(fPrio.filter(x => x !== v)) })),
    ...fTag.map(v => ({ label: `แท็ก: ${v}`, clear: () => setFTag(fTag.filter(x => x !== v)) })),
    ...fChan.map(v => ({ label: `ช่องทาง: ${v}`, clear: () => setFChan(fChan.filter(x => x !== v)) })),
    ...(fDue !== 'all' ? [{ label: `กำหนด: ${DUE_LABEL[fDue] || fDue}`, clear: () => setFDue('all') }] : []),
  ];

  return (
    <div className="flex flex-col gap-4 max-w-6xl mx-auto w-full">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><Icon name="user" className="size-5" /> งานของฉัน</h2>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{myNames.size ? `งานที่มอบหมายให้ ${[...myNames].join(' · ')} — ทุกโครงการ` : 'ยังจับคู่บัญชีกับสมาชิกทีมไม่ได้'}</p>
        </div>
        {myNames.size > 0 && mine.length > 0 && <SearchInput value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหา" className="w-full sm:w-64" />}
      </div>

      {myNames.size === 0 ? (
        <div className="border-2 border-dashed rounded-xl py-16 text-center text-muted-foreground">
          <Icon name="user" className="size-8 mx-auto opacity-30 mb-2" />
          <p className="text-sm">จับคู่อีเมลของคุณกับสมาชิกทีมไม่ได้</p>
          <p className="text-xs opacity-70 mt-1">เพิ่มชื่อ/อีเมลของคุณที่ ตั้งค่า → สิทธิ์ผู้ใช้ เพื่อให้ระบบดึงงานของคุณ</p>
        </div>
      ) : mine.length === 0 ? (
        <EmptyState icon="check" title="ยังไม่มีงานที่มอบหมายให้คุณ" hint="งานที่หัวหน้าหรือเพื่อนร่วมทีมมอบหมายให้ จะมาแสดงที่นี่" />
      ) : (
        <>
          {/* HERO: งานที่ต้องทำเด่น + ชิปกรองกดได้ (เดิม KPI 5 กล่องกดไม่ได้ + แถบคืบหน้าลอย) */}
          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground">งานที่ต้องทำของฉัน</div>
                <div className="flex items-baseline gap-2">
                  <span className="num" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.6px', lineHeight: 1.1, color: kpi.overdue ? 'var(--bad)' : 'var(--accent-2)' }}>{kpi.open}</span>
                  <span className="text-[12px] text-muted-foreground tabular-nums">ค้างอยู่ · เสร็จแล้ว {kpi.done} ({pct}%)</span>
                </div>
                <div className="mt-2 h-2 w-full min-w-[180px] rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} />
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap ml-auto">
                {[
                  { k: 'overdue', l: 'เลยกำหนด', v: kpi.overdue, c: 'var(--bad)' },
                  { k: 'today', l: 'ครบวันนี้', v: kpi.today, c: 'var(--warn)' },
                  // ต้องใช้ตัวนับชุดเดียวกับตัวกรอง (d>=0..7) — เดิมโชว์ kpi.soon (d>0) แต่กดแล้วกรอง d>=0 → เลขไม่ตรงกับรายการ
                  { k: 'week', l: 'ใน 7 วัน', v: kpi.week, c: 'var(--info)' },
                ].map(x => {
                  const on = fDue === x.k;
                  return (
                    <button key={x.k} type="button" onClick={() => setFDue(on ? 'all' : x.k)} aria-pressed={on} disabled={!x.v && !on}
                      className={'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors' + (!x.v && !on ? ' opacity-45' : '')}
                      style={{ borderColor: on ? x.c : 'var(--line)', background: on ? `color-mix(in srgb, ${x.c} 12%, var(--surface))` : 'var(--surface)', color: on ? x.c : 'var(--ink-3)' }}>
                      <span className="size-2 rounded-full" style={{ background: x.c }} />{x.l} <b className="num">{x.v}</b>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* แถบเตือน — งานเลยกำหนดชูขึ้นเอง พร้อมชื่อ 3 งานแรก */}
          {kpi.overdue > 0 && fDue !== 'overdue' && (
            <button type="button" onClick={() => setFDue('overdue')}
              className="flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left transition-colors hover:bg-muted/30"
              style={{ borderColor: 'color-mix(in srgb, var(--bad) 40%, transparent)', background: 'color-mix(in srgb, var(--bad) 7%, transparent)' }}>
              <Icon name="alertTriangle" className="size-4 shrink-0" style={{ color: 'var(--bad)' }} />
              <span className="text-[13px] font-semibold shrink-0" style={{ color: 'var(--bad)' }}>เลยกำหนด {kpi.overdue} งาน</span>
              <span className="text-[12px] text-muted-foreground truncate">{openT.filter(t => { const d = dueDiff(t); return d != null && d < 0; }).slice(0, 3).map(t => t.title).filter(Boolean).join(' · ')}</span>
              <Icon name="chevR" className="size-4 ml-auto shrink-0 opacity-60" />
            </button>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">จัดกลุ่ม</span>
            <ToggleGroup type="single" value={groupBy} onValueChange={v => v && setGroupBy(v)} variant="outline" size="sm">
              <ToggleGroupItem value="status" className="h-8 px-2.5 text-xs">สถานะ</ToggleGroupItem>
              <ToggleGroupItem value="flow" className="h-8 px-2.5 text-xs">โครงการ</ToggleGroupItem>
              <ToggleGroupItem value="due" className="h-8 px-2.5 text-xs">กำหนดส่ง</ToggleGroupItem>
            </ToggleGroup>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setFiltersOpen(v => !v)} aria-expanded={filtersOpen}>
              <Icon name="filter" className="size-3.5" /> ตัวกรอง{nAdv > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nAdv}</Badge>}
              <Icon name="chevD" className="size-3.5" style={filtersOpen ? { transform: 'rotate(180deg)' } : undefined} />
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-8 w-auto gap-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="due">เรียง: ครบกำหนด</SelectItem>
                  <SelectItem value="priority">เรียง: ความสำคัญ</SelectItem>
                  <SelectItem value="updated">เรียง: อัปเดตล่าสุด</SelectItem>
                </SelectContent>
              </Select>
              {anyFilter ? <Button variant="ghost" size="sm" className="h-8 text-[var(--bad)]" onClick={clearAll}>ล้าง</Button> : null}
            </div>
          </div>
          {/* ชิปบอกตัวกรองที่เปิดอยู่ (เห็นแม้พับแผง) */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 -mt-1">
              {activeChips.map(c => (
                <Badge key={c.label} variant="outline" onClick={c.clear} title="คลิกเพื่อเอาออก" style={{ cursor: 'pointer', padding: '2px 8px' }}>{c.label} <Icon name="x" className="size-3" /></Badge>
              ))}
            </div>
          )}
          {filtersOpen && (
            <div className="flex items-center gap-2 flex-wrap rounded-xl border p-3" style={{ borderColor: 'var(--line)' }}>
              <MtFilter label="โครงการ" icon="grid" options={flowOpts} value={fFlow} onChange={setFFlow} />
              <MtFilter label="สถานะ" icon="circle" options={statusOpts} value={fStatus} onChange={setFStatus} />
              <MtFilter label="ความสำคัญ" icon="target" options={prioOpts} value={fPrio} onChange={setFPrio} />
              <MtFilter label="แท็ก" icon="filter" options={tagOpts} value={fTag} onChange={setFTag} />
              <MtFilter label="ช่องทาง" icon="layers" options={chanOpts} value={fChan} onChange={setFChan} />
              <Select value={fDue} onValueChange={setFDue}>
                <SelectTrigger className="h-8 w-auto gap-1 text-xs"><Icon name="calendarDays" className="size-3.5" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">กำหนด: ทั้งหมด</SelectItem>
                  <SelectItem value="overdue">เลยกำหนด</SelectItem>
                  <SelectItem value="today">ครบวันนี้</SelectItem>
                  <SelectItem value="week">ใน 7 วัน</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {shown.length === 0 ? (
            <div className="border-2 border-dashed rounded-xl py-14 text-center text-muted-foreground">
              <Icon name="search" className="size-8 mx-auto opacity-30 mb-2" />
              <p className="text-sm">ไม่มีงานตรงกับตัวกรอง</p>
              <Button variant="link" size="sm" onClick={clearAll}>ล้างตัวกรอง</Button>
            </div>
          ) : groups.map(g => {
            // กลุ่มงานที่เสร็จแล้ว = พับไว้ (เดิมโชว์ครบทุกใบ ดันงานที่ต้องทำตกจอ)
            const isDoneGroup = g.key === 'done' || (g.items.length > 0 && g.items.every(t => isDone(t)));
            const open = !isDoneGroup || !!doneOpen[g.key];
            return (
              <div key={g.key} className="flex flex-col gap-3">
                <button type="button" disabled={!isDoneGroup} onClick={() => setDoneOpen(o => ({ ...o, [g.key]: !o[g.key] }))}
                  className={'flex items-center gap-2 text-left' + (isDoneGroup ? ' hover:opacity-80' : ' cursor-default')}>
                  <span className="size-2 rounded-full" style={{ background: g.color }} />
                  <h3 className="font-semibold text-sm">{g.label}</h3>
                  <Badge variant="secondary">{g.items.length}</Badge>
                  {isDoneGroup && <Icon name={open ? 'chevD' : 'chevR'} className="size-3.5 opacity-60" />}
                  {isDoneGroup && !open && <span className="text-[11px] text-muted-foreground">ซ่อนไว้ · กดเพื่อดู</span>}
                </button>
                {open && <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">{g.items.map(t => <TaskCard key={t.id} task={t} showFlow onClick={() => openTask(t)} />)}</div>}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
