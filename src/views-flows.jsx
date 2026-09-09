/* ============================================================
   FLOWS — board วางแผนงานหลายอัน (multi-flow) · PART 15 + 16
   - section บนสุด · แต่ละโครงการ = บอร์ดของตัวเอง (ปฏิทิน/คัมบัง/ไทม์ไลน์/รายการ/ตั้งค่า)
   - reuse <PlannerView flow={...}> จาก views-planner.jsx (scope งานตาม flow.scopeId)
   - "งานทั่วไป" แก้ได้ (config row __general__ · scopeId='' กรองงาน flow ว่าง — งาน null ไม่หาย)
   - graceful: ตาราง tmk_flows ยังไม่ migrate → เหลือ "งานทั่วไป" อันเดียว
   - ส่วนที่แยกออกไป: flowsShared.js (ค่าคงที่/helper) · flowCard.jsx · flowSettingsPage.jsx
     · flowHistory.jsx · flowShareDialog.jsx · flowPublicShare.jsx
   ============================================================ */
import { useState, useMemo, useEffect } from 'react';
import { TMK } from './data.js';
import { Icon, Avatar, FlowIcon, N } from './components.jsx';
import { useData } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { registerServices, toast, openModal, goSection, setFlow, userEmail } from './lib/appBus.js';
import { logAudit } from './lib/audit.js';
import { todayISO } from './lib/dateUtils.js';
import { taskStats } from './lib/taskFilters.js';
import { plusDaysISO } from './lib/uiLogic.js';
import { SearchInput } from '@/components/ui/search-input';
import { PlannerView } from './views-planner.jsx';
import { TaskCard } from './taskCard.jsx';
import { MyTasksView } from './views-mytasks.jsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PALETTE, NEW_ICONS, GENERAL_ID, VIEWS, guardEdit, isMissing, doneSetOf, flowBrands, visibleFlows } from './flowsShared.js';
import { FlowCard } from './flowCard.jsx';
import { FlowSettingsPage } from './flowSettingsPage.jsx';
import { FlowHistoryView } from './flowHistory.jsx';
import { ShareFlowDialog } from './flowShareDialog.jsx';
import { EmptyState } from './components/EmptyState.jsx';

export { visibleFlows };   // คง public API เดิมของไฟล์นี้ (ย้ายตัวจริงไป flowsShared.js)

export function FlowsView({ sub, tasks, setTasks, activeFlow }) {
  const { reload, refresh } = useData() || {};
  const me = userEmail();
  const flows = visibleFlows();
  const realFlows = flows.filter(f => !f.isGeneral);

  // activeId มาจาก App (single source of truth · ไม่มี state ซ้อนใน FlowsView → ไม่ lag/กดซ้ำ)
  const activeId = activeFlow || GENERAL_ID;
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [query, setQuery] = useState(''); // ค้นหางานข้ามโครงการ (E4)
  const [drill, setDrill] = useState(''); // เจาะดูงานตาม KPI: '' | 'open' | 'soon' | 'overdue' | 'person'
  const [drillPerson, setDrillPerson] = useState(''); // ชื่อคนที่กดจาก "งานค้างต่อคน"
  const [flowSort, setFlowSort] = useState('default'); // จัดเรียงการ์ดโครงการ: default | progress | overdue | tasks

  const goView = (flowId, view) => { setFlow(flowId); goSection('flows', view || 'kanban'); };

  const createFlow = async () => {
    if (!guardEdit()) return;
    setBusy(true);
    try {
      // eslint-disable-next-line react-hooks/purity -- สุ่ม id ตอนกดปุ่มสร้าง (event handler ไม่ใช่ตอน render) · ต้องสุ่มจริงเพื่อไม่ให้ id ชนกัน
      const id = 'flow_' + Math.random().toString(36).slice(2, 9);
      const maxOrder = Math.max(0, ...realFlows.map(f => f.sortOrder || 0));
      const payload = { id, name: 'โครงการใหม่', color: PALETTE[realFlows.length % PALETTE.length], icon: NEW_ICONS[realFlows.length % NEW_ICONS.length], owner: me, default_view: 'kanban', sort_order: maxOrder + 1 };
      const { error } = await supabase.from('tmk_flows').insert(payload);
      if (error) { if (isMissing(error)) throw new Error('ยังไม่ได้รัน migration — รัน 20260710-flows-brands.sql ก่อน'); throw error; }
      logAudit({ action: 'create', entityType: 'flow', entityName: 'โครงการใหม่', summary: 'สร้างโครงการใหม่', flowId: id });
      if (refresh) await refresh(['tmk_flows']); else if (reload) await reload();
      setFlow(id);
      goSection('flows', 'settings'); // เด้งเข้าหน้าตั้งค่าทันที (ตั้งชื่อ/แบรนด์/สี)
      toast('สร้างโครงการแล้ว — ตั้งค่าต่อได้เลย', 'success');
    } catch (err) { toast('สร้างไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  // เปิดให้ sidebar ปุ่ม "+ สร้างโครงการ" เรียกได้ (setFlow/activeFlow เป็นของ App แล้ว · guard โครงการหายอยู่ที่ App)
  useEffect(() => { registerServices({ createFlow }); });

  const active = flows.find(f => f.id === activeId) || flows[0];

  const tasksByFlow = useMemo(() => {
    const m = {};
    (TMK.tasks || []).forEach(t => { const k = t.flow || ''; (m[k] = m[k] || []).push(t); });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- TMK เป็น singleton module-level (compiler มองว่าไม่ reactive) แต่ TMK.tasks เปลี่ยนอ้างอิงทุกครั้งที่โหลดใหม่ → ต้องคง dep ไว้ ไม่งั้น group ค้างข้อมูลเก่า
  }, [TMK.tasks]);
  const tasksOf = (f) => tasksByFlow[f.scopeId ?? f.id ?? ''] || [];

  // ข้อมูลอยู่ใน TMK singleton แล้ว = ไม่มีการโหลดจริง → render ทันที (เดิมมี skeleton หลอก 320-350ms)

  // ===== หน้ารวมโครงการ (overview) — แดชบอร์ด + ค้นหาข้ามโครงการ (E4) =====
  if (sub === 'overview' || !sub) {
    const openTask = (t) => openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] });
    const doneOfTask = (t) => doneSetOf(flows.find(f => (f.scopeId ?? f.id ?? '') === (t.flow || '')) || {}).has(t.status);
    const dueOf = (t) => t.dateEnd || t.dateISO || '';
    /* ⚠️ ต้องนับเฉพาะงานที่ "มีการ์ดให้กด" — TMK.tasks รวมงานใน flow ที่ถูกเก็บเข้าคลังด้วย
       เดิม: ชิปบอก "ค้างอยู่ 61 · เลยกำหนด 60 · เสร็จ 67 จาก 128"
             แต่ผลรวมจากการ์ดได้ 60 / 59 / 127 — ต่างกัน 1 ใบที่อยู่ใน flow ที่ archived
       ผู้ใช้กดชิปแล้วหางานใบนั้นไม่เจอ เพราะไม่มีการ์ดให้เปิด */
    const visibleFlowKeys = new Set(flows.map(f => f.scopeId ?? f.id ?? ''));
    const allTasks = (TMK.tasks || []).filter(t => visibleFlowKeys.has(t.flow || ''));
    const tdy = todayISO();
    const weekEnd = plusDaysISO(tdy, 7);   // เวลาท้องถิ่น (มีเทสที่ lib/uiLogic.js — toISOString ทำให้ UTC+7 หายไป 1 วัน)
    // จัดกลุ่มงานรอบเดียว: เสร็จ / ค้าง / เลยกำหนด / ครบใน 7 วัน
    let kDone = 0;
    const openTasks = [], overdueTasks = [], soonTasks = [];
    allTasks.forEach(t => {
      if (doneOfTask(t)) { kDone++; return; }
      openTasks.push(t);
      const due = dueOf(t);
      if (due && due < tdy) overdueTasks.push(t);
      else if (due && due <= weekEnd) soonTasks.push(t);
    });
    const donePct = allTasks.length ? Math.round(kDone / allTasks.length * 100) : 0;
    // งานต่อคน (workload) — เฉพาะงานค้าง เรียงคนที่ถือเยอะสุด
    const workload = (() => {
      const m = {};
      openTasks.forEach(t => (t.responsible || []).forEach(r => {
        if (!r) return; const g = m[r] || (m[r] = { name: r, open: 0, overdue: 0 });
        g.open++; const due = dueOf(t); if (due && due < tdy) g.overdue++;
      }));
      return Object.values(m).sort((a, b) => b.open - a.open).slice(0, 8);
    })();
    // สถิติต่อโครงการ (สำหรับจัดเรียงการ์ด)
    const flowStat = (f) => {
      const ts = tasksOf(f), ds = doneSetOf(f);
      const done = ts.filter(t => ds.has(t.status)).length;
      const overdue = ts.filter(t => !ds.has(t.status) && dueOf(t) && dueOf(t) < tdy).length;
      return { total: ts.length, pct: ts.length ? done / ts.length : 0, overdue };
    };
    const sortedFlows = flowSort === 'default' ? flows : [...flows].sort((a, b) => {
      if (a.isGeneral !== b.isGeneral) return a.isGeneral ? -1 : 1; // งานทั่วไปนำเสมอ
      const sa = flowStat(a), sb = flowStat(b);
      if (flowSort === 'progress') return sb.pct - sa.pct;
      if (flowSort === 'overdue') return sb.overdue - sa.overdue;
      if (flowSort === 'tasks') return sb.total - sa.total;
      return 0;
    });
    const q = query.trim().toLowerCase();
    const results = q ? allTasks.filter(t =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.detail || '').toLowerCase().includes(q) ||
      (t.tags || []).some(tg => String(tg).toLowerCase().includes(q)) ||
      (t.responsible || []).some(r => String(r).toLowerCase().includes(q))
    ) : [];
    const drillMeta = { open: { label: 'งานค้างทั้งหมด', tasks: openTasks }, soon: { label: 'ครบกำหนดใน 7 วัน', tasks: soonTasks }, overdue: { label: 'งานเลยกำหนด', tasks: overdueTasks },
      person: { label: `งานค้างของ ${drillPerson}`, tasks: openTasks.filter(t => (t.responsible || []).includes(drillPerson)) } };
    const drillView = drill && drillMeta[drill] ? drillMeta[drill] : null;
    const drillTasks = drillView ? [...drillView.tasks].sort((a, b) => (dueOf(a) || '9999').localeCompare(dueOf(b) || '9999')) : [];
    const SORTS = [['default', 'เริ่มต้น'], ['progress', 'คืบหน้า'], ['overdue', 'เลยกำหนด'], ['tasks', 'งานเยอะ']];
    return (
      <div className="flex flex-col gap-4 w-full">
        {/* หัว + ค้นหา + สร้าง */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            {/* ต้องนับเท่าที่กริดโชว์จริง — เดิมใช้ realFlows (ตัด "งานทั่วไป" ออก) แต่กริดยังโชว์การ์ดของมัน
                → หัวข้อบอก 1 แต่มี 2 การ์ด */}
            <h2 className="text-xl font-bold text-foreground">โครงการทั้งหมด <span className="text-base font-normal text-muted-foreground">· {N(flows.length)} โครงการ</span></h2>
            <p className="text-sm text-muted-foreground mt-0.5">บอร์ดวางแผนงานแยกอิสระ — กดการ์ดเพื่อเปิดบอร์ด · ไอคอนเฟืองเพื่อตั้งค่า</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SearchInput placeholder="ค้นหางานทุกโครงการ" value={query} onChange={e => setQuery(e.target.value)} wrapperClassName="w-full sm:w-[240px]" />
            <Button onClick={createFlow} disabled={busy}><Icon name="plus" className="size-4 mr-2" /> สร้างโครงการ</Button>
          </div>
        </div>

        {/* HERO: ความคืบหน้ารวมเด่น + ชิปเจาะงาน (เดิม KPI 6 กล่องเท่ากันหมด · ตัวนิ่งกับตัวกดได้หน้าตาเหมือนกัน) */}
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground">ความคืบหน้ารวมทุกโครงการ</div>
              <div className="flex items-baseline gap-2">
                <span className="num" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.6px', lineHeight: 1.1, color: 'var(--accent-2)' }}>{donePct}%</span>
                <span className="text-[12px] text-muted-foreground tabular-nums">เสร็จ {N(kDone)} จาก {N(allTasks.length)} งาน</span>
              </div>
              <div className="mt-2 h-2 w-full min-w-[180px] rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                <div className="h-full rounded-full" style={{ width: `${donePct}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} />
              </div>
            </div>
            {/* ชิปเจาะงาน — กดแล้วโชว์รายการงานด้านล่าง */}
            <div className="flex items-center gap-2 flex-wrap ml-auto">
              {[
                { k: 'open', l: 'ค้างอยู่', v: openTasks.length, c: 'var(--info)' },
                { k: 'soon', l: 'ครบใน 7 วัน', v: soonTasks.length, c: 'var(--warn)' },
                { k: 'overdue', l: 'เลยกำหนด', v: overdueTasks.length, c: 'var(--bad)' },
              ].map(x => {
                const on = drill === x.k;
                return (
                  <button key={x.k} type="button" onClick={() => { setDrill(on ? '' : x.k); setDrillPerson(''); }} aria-pressed={on}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
                    style={{ borderColor: on ? x.c : 'var(--line)', background: on ? `color-mix(in srgb, ${x.c} 12%, var(--surface))` : 'var(--surface)', color: on ? x.c : 'var(--ink-3)' }}>
                    <span className="size-2 rounded-full" style={{ background: x.c }} />{x.l} <b className="num">{N(x.v)}</b>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* แถบเตือนงานเลยกำหนด — ชูขึ้นมาเอง ไม่ต้องกดหา (เดิมต้องกด KPI ถึงเห็น) */}
        {!q && !drill && overdueTasks.length > 0 && (
          <button type="button" onClick={() => setDrill('overdue')}
            className="flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left transition-colors hover:bg-muted/30"
            style={{ borderColor: 'color-mix(in srgb, var(--bad) 40%, transparent)', background: 'color-mix(in srgb, var(--bad) 7%, transparent)' }}>
            <Icon name="alertTriangle" className="size-4 shrink-0" style={{ color: 'var(--bad)' }} />
            <span className="text-[13px] font-semibold" style={{ color: 'var(--bad)' }}>งานเลยกำหนด {N(overdueTasks.length)} งาน</span>
            <span className="text-[12px] text-muted-foreground truncate">{overdueTasks.slice(0, 3).map(t => t.title).filter(Boolean).join(' · ')}</span>
            <Icon name="chevR" className="size-4 ml-auto shrink-0 opacity-60" />
          </button>
        )}

        {q ? (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-muted-foreground">ผลการค้นหา “{query}” — {results.length} งาน</div>
            {results.length === 0
              ? <EmptyState size="inline" mode="filtered" title="ไม่พบงานที่ตรงกับคำค้น" />
              : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">{results.map(t => <TaskCard key={t.id} task={t} showFlow onClick={() => openTask(t)} />)}</div>}
          </div>
        ) : drillView ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-foreground">{drillView.label} — {drillTasks.length} งาน{drillPerson ? ` · ${drillPerson}` : ''}</div>
              <Button variant="ghost" size="sm" onClick={() => { setDrill(''); setDrillPerson(''); }}><Icon name="x" className="size-3.5 mr-1" /> ปิด</Button>
            </div>
            {drillTasks.length === 0
              ? <div className="text-sm text-muted-foreground py-8 text-center">ไม่มีงานในกลุ่มนี้ 🎉</div>
              : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">{drillTasks.map(t => <TaskCard key={t.id} task={t} showFlow onClick={() => openTask(t)} />)}</div>}
          </div>
        ) : (
          <>
            {/* งานค้างต่อคน — กดชื่อเพื่อดูงานของคนนั้น (เดิมดูได้อย่างเดียว) */}
            {workload.length > 0 && (
              <div className="rounded-xl border bg-card p-4">
                <div className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5"><Icon name="users" className="size-4" />งานค้างต่อคน <span className="font-normal text-muted-foreground">· กดชื่อเพื่อดูงานของคนนั้น</span></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-2.5">
                  {workload.map(w => {
                    const s = (TMK.staff || []).find(x => x.name === w.name) || { color: '#888' };
                    const max = workload[0].open || 1;
                    return (
                      <button key={w.name} type="button" onClick={() => { setDrillPerson(w.name); setDrill('person'); }}
                        className="flex items-center gap-2.5 min-w-0 rounded-lg px-1.5 py-1 -mx-1.5 text-left transition-colors hover:bg-muted/40">
                        <Avatar name={w.name} color={s.color} size={26} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium truncate">{w.name}</span>
                            <span className="text-xs tabular-nums shrink-0">{w.open}{w.overdue > 0 && <span className="text-[var(--bad,#cf4d5c)]"> · {w.overdue} เลย</span>}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${w.open / max * 100}%`, background: w.overdue > 0 ? 'var(--bad, #cf4d5c)' : s.color }} /></div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* การ์ดโครงการ + ตัวเรียง (แถวเดียวกับหัว) */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">โครงการ</span>
              {realFlows.length > 1 && (<>
                <span className="text-xs text-muted-foreground ml-auto">เรียงตาม</span>
                <ToggleGroup type="single" value={flowSort} onValueChange={(v) => v && setFlowSort(v)} className="gap-0.5 rounded-md border bg-muted/30 p-0.5">
                  {SORTS.map(([v, l]) => <ToggleGroupItem key={v} value={v} size="sm" className="px-2.5 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">{l}</ToggleGroupItem>)}
                </ToggleGroup>
              </>)}
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))' }}>
              {sortedFlows.map(f => (
                <FlowCard key={f.id} flow={f} tasks={tasksOf(f)} today={tdy}
                  onOpen={() => goView(f.id, f.defaultView)}
                  onSettings={() => goView(f.id, 'settings')} />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // ===== งานของฉัน (ทุกโครงการ) =====
  if (sub === 'mytasks') return <MyTasksView />;

  // ===== บอร์ดของโครงการ (calendar/kanban/timeline/list/settings) =====
  const brands = flowBrands(active);
  // สรุปงานของโครงการนี้ — หัวบอร์ดเดิมไม่บอกอะไรเลยว่าโครงการนี้ค้างเท่าไหร่/เลยกำหนดกี่งาน
  const boardStats = taskStats(tasksOf(active), doneSetOf(active));
  const isBoardView = !['settings', 'history'].includes(sub);
  return (
    <div className="space-y-4">
      {/* แถบหัวบอร์ด — ชื่อ+สรุปซ้าย · วิว+จัดการขวา · ปุ่มหลัก "เพิ่มงาน" ชัดหนึ่งปุ่ม */}
      <div className="content-inner">
       <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <button className="flex items-center gap-2.5 min-w-0 text-left" onClick={() => goView(active.id, active.defaultView)} title="เปิดบอร์ด">
            <FlowIcon icon={active.icon} className="size-8 shrink-0" style={{ color: active.color }} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold truncate" style={{ color: active.color }}>{active.name}</h2>
                {brands.map(b => <Badge key={b.id} variant="outline" className="gap-1 shrink-0"><span className="size-2 rounded-full" style={{ background: b.color }} />{b.name}</Badge>)}
              </div>
              {/* สรุปสด: ค้าง · เลยกำหนด · ครบใน 7 วัน · เสร็จ % (แทนคำบรรยายที่ไม่ค่อยมีคนกรอก) */}
              <div className="flex items-center gap-2 flex-wrap text-[12px] mt-0.5">
                <span className="text-muted-foreground">ค้าง <b className="num text-foreground">{boardStats.open}</b></span>
                {boardStats.overdue > 0 && <span className="font-semibold" style={{ color: 'var(--bad)' }}>เลยกำหนด {boardStats.overdue}</span>}
                {boardStats.week > 0 && <span style={{ color: 'var(--warn)' }}>ครบใน 7 วัน {boardStats.week}</span>}
                <span className="text-muted-foreground">เสร็จ <b className="num text-foreground">{boardStats.pct}%</b></span>
                <span className="h-1.5 w-20 rounded-full overflow-hidden hidden sm:block" style={{ background: 'var(--surface-3)' }}>
                  <span className="block h-full rounded-full" style={{ width: `${boardStats.pct}%`, background: active.color || 'var(--accent)' }} />
                </span>
              </div>
            </div>
          </button>
        </div>

        {/* สลับวิว + เพิ่มงาน + เมนูจัดการ (แชร์/ประวัติ/ตั้งค่า) — เดิมเป็นไอคอนลอย 3 ปุ่มเรียงกัน */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0 max-w-full">
          <ToggleGroup type="single" value={sub} onValueChange={(v) => v && goSection('flows', v)} className="gap-0.5 rounded-md border bg-muted/30 p-0.5 overflow-x-auto">
            {VIEWS.map(([v, ic, l]) => (
              <ToggleGroupItem key={v} value={v} size="sm" className="gap-1.5 px-2.5 shrink-0 data-[state=on]:bg-background data-[state=on]:shadow-sm" title={l} aria-label={l}><Icon name={ic} className="size-3.5" /><span className="hidden lg:inline">{l}</span></ToggleGroupItem>
            ))}
          </ToggleGroup>
          {isBoardView && <Button size="sm" className="h-8 shrink-0" onClick={() => openModal('task', { flow_id: (active.scopeId ?? active.id) })}><Icon name="plus" className="size-4 mr-1" /> เพิ่มงาน</Button>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 shrink-0" title="จัดการโครงการ" aria-label="จัดการโครงการ"><Icon name="menu" className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!active.isGeneral && <DropdownMenuItem onSelect={() => setShareOpen(true)}><Icon name="layers" className="size-4" /> แชร์ลิงก์โครงการ{active.shareEnabled ? ' (เปิดอยู่)' : ''}</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => goSection('flows', 'history')}><Icon name="clock" className="size-4" /> ประวัติกิจกรรม</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => goSection('flows', 'settings')}><Icon name="system" className="size-4" /> ตั้งค่าโครงการ</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
       </div>
      </div>
      {!active.isGeneral && <ShareFlowDialog flow={active} open={shareOpen} onOpenChange={setShareOpen} />}

      {/* เนื้อหา */}
      {sub === 'settings'
        ? <FlowSettingsPage key={active.id} flow={active} onAfter={(view) => goView(active.id, view || active.defaultView)} onGone={() => goView(GENERAL_ID, 'overview')} />
        : sub === 'history'
        ? <FlowHistoryView flow={active} />
        : <PlannerView sub={sub} tasks={tasks} setTasks={setTasks} flow={active} />}
    </div>
  );
}
