/* ============================================================
   views-planner.jsx — จุดเข้าหน้าวางแผน (PlannerView)
   ============================================================
   - state/ตัวกรอง/scope งาน อยู่ที่นี่ที่เดียว แล้วส่งลงวิวเป็น props
   - ตรรกะกรอง/เรียง/นับ = lib/taskFilters.js (pure · มีเทส) — PART 104
   - วิวย่อย: plannerCalendar / plannerKanban / plannerTimeline / plannerList
   - แถบเครื่องมือ = plannerFilters.jsx · คอลัมน์สถานะ = plannerColumns.js
   ============================================================ */
import { useState, useMemo } from 'react';
import { TMK } from './data.js';
import { useData } from './dataContext.jsx';
import { userEmail } from './lib/appBus.js';
import { doneIdsOf } from './plannerColumns.js';
import { filterTasks, taskStats, myNameSet, isoToday } from './lib/taskFilters.js';
import { tokenizeCh } from './taskCard.jsx';
import { CalendarView } from './plannerCalendar.jsx';
import { KanbanBoard } from './plannerKanban.jsx';
import { TimelineView } from './plannerTimeline.jsx';
import { TaskListView } from './plannerList.jsx';


export function PlannerView({ sub, tasks, setTasks, flow, readOnly }) {
  const { version } = useData() || {};
  const [filterCamp, setFilterCamp] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterResp, setFilterResp] = useState([]);
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState([]);
  const [filterTags, setFilterTags] = useState([]);
  const [filterChannel, setFilterChannel] = useState([]);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [datePreset, setDatePreset] = useState('all');
  const [quick, setQuick] = useState(null); // ชิปด่วน: mine / overdue / week

  // โครงการ — จำกัดงานเฉพาะของโครงการนี้ (scopeId: ปกติ=id · "งานทั่วไป"='' → งานที่ flow ว่าง)
  const sid = flow ? (flow.scopeId ?? flow.id ?? '') : null;
  const scoped = useMemo(() => (flow ? (tasks || []).filter(t => (t.flow || '') === sid) : (tasks || [])), [tasks, flow, sid]);
  const doneIds = useMemo(() => doneIdsOf(flow), [flow]);
  const today = isoToday();
  // ตัวตน "ฉัน" — ใช้กับชิปด่วน "ของฉัน" (ชื่อคน + ชื่อบทบาท)
  const me = userEmail();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roles/staff โหลด async → ผูก version ด้วย
  const myNames = useMemo(() => myNameSet(me, { roles: TMK.roles, staff: TMK.staff }), [me, version]);

  const respOptions = useMemo(() => [...new Set((scoped || []).flatMap(t => t.responsible || []))].filter(Boolean).sort(), [scoped]);
  const tagOptions = useMemo(() => [...new Set((scoped || []).flatMap(t => t.tags || []))].filter(Boolean).sort(), [scoped]);
  const campsInTasks = useMemo(() => [...new Set((scoped || []).map(t => t.camp))].filter(Boolean), [scoped]);
  const campScope = (flow && flow.campaignIds && flow.campaignIds.length) ? flow.campaignIds : (flow ? campsInTasks : null);

  const baseOpts = { filterCamp, filterStatus, search, filterResp, doneIds, tokenizeCh,
    filterPriority, filterTags, filterChannel, filterDateFrom, filterDateTo, today, myNames };
  // base = กรองทุกอย่างยกเว้นชิปด่วน → ตัวเลขบนชิปตรงกับผลลัพธ์เมื่อกด
  const base = useMemo(() => filterTasks(scoped, baseOpts), [scoped, filterCamp, filterStatus, search, filterResp, doneIds, filterPriority, filterTags, filterChannel, filterDateFrom, filterDateTo, today, myNames]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => filterTasks(base, { quick, myNames, today, doneIds }), [base, quick, myNames, today, doneIds]);
  const stats = useMemo(() => {
    const s = taskStats(base, doneIds, today);
    s.mine = base.filter(t => (t.responsible || []).some(r => myNames.has(r))).length;
    return s;
  }, [base, doneIds, today, myNames]);

  const fProps = { filterCamp, setFilterCamp, filterStatus, setFilterStatus, filterResp, setFilterResp, search, setSearch, respOptions, campScope,
    filterPriority, setFilterPriority, filterTags, setFilterTags, tagOptions, filterChannel, setFilterChannel,
    filterDateFrom, setFilterDateFrom, filterDateTo, setFilterDateTo, datePreset, setDatePreset,
    quick, setQuick, stats, shown: filtered.length, total: scoped.length };

  if (sub === 'kanban') return <KanbanBoard tasks={scoped} setTasks={setTasks} filtered={filtered} fProps={fProps} flow={flow} readOnly={readOnly} />;
  if (sub === 'timeline') return <TimelineView filtered={filtered} fProps={fProps} flow={flow} readOnly={readOnly} />;
  if (sub === 'list') return <TaskListView filtered={filtered} fProps={fProps} flow={flow} readOnly={readOnly} />;
  return <CalendarView tasks={scoped} filtered={filtered} fProps={fProps} flow={flow} readOnly={readOnly} />;
}
