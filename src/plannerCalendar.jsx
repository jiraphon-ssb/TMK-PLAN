/* ============================================================
   plannerCalendar.jsx — วิว "ปฏิทิน" ของหน้าวางแผน (แยกจาก views-planner.jsx)
   - CalendarView ยกมาทั้งดุ้น ไม่แก้เนื้อใน · รับ filtered/fProps/flow/readOnly เป็น props เหมือนเดิม
   ============================================================ */
import React, { useState } from 'react';
import { pgErrorText } from './lib/pgError.js';
import { Icon } from './components.jsx';
import { supabase } from './lib/supabaseClient.js';
import { versionedUpdate, promptConflictResolution } from './lib/optimisticUpdate.js';
import { logAudit } from './lib/audit.js';
import { getToday, parseTaskDate, thaiDate, THAI_MONTHS as MONTHS_TH_SHORT, THAI_MONTHS_FULL as MONTHS_TH } from './lib/dateUtils.js';
import { colorForTask, colorSourceOf } from './lib/taskColor.js';
import { TaskCard, ChIcon, matchedChannelsFor } from './taskCard.jsx';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DD, _isoToDate, _dateToIso } from './saleWidgets.jsx';
import { toast, openModal, refresh, canEdit } from './lib/appBus.js';
import { PlannerFilters } from './plannerFilters.jsx';
import { doneIdsOf } from './plannerColumns.js';
import { dueInfo, sortTasks, isoToday } from './lib/taskFilters.js';

/* ---- Calendar (month navigation + week view) — ชื่อเดือนใช้ร่วมจาก lib/dateUtils ---- */
const DAY_LABELS = ['อา','จ','อ','พ','พฤ','ศ','ส'];


export function CalendarView({ filtered, fProps, flow, readOnly }) {
  const newTaskBase = flow ? { flow_id: (flow.scopeId ?? flow.id) } : {};
  const colorSrc = colorSourceOf(flow); // แหล่งสีแถบ/ชิป ตามตั้งค่าโครงการ — ไม่มี flow (ปฏิทินรวม) = campaign
  const T = getToday();                       // วันจริง
  const curY = T.yearBE, curM = T.month - 1;  // เดือนปัจจุบัน (0-indexed)
  const [ym, setYm] = useState({ y: curY, m: curM });
  const [sel, setSel] = useState(T.day);

  const greg = ym.y - 543;
  const daysInMonth = new Date(greg, ym.m + 1, 0).getDate();
  const firstWeekday = new Date(greg, ym.m, 1).getDay(); // Sun-first (0=Sun)
  const isCurrentMonth = ym.y === curY && ym.m === curM;
  const todayDay = isCurrentMonth ? T.day : -1;

  // จับคู่งานกับวันของ "เดือนที่เลือก" (ym) — ทุกงานเป็น "ชิปวันเดียว" ที่วันเริ่ม (ไม่พาดยาวข้ามวัน)
  //   งานหลายวัน = โชว์ชิปที่วันเริ่ม + ลูกศร › (คลิกดูช่วงเต็มใน tooltip/แผงข้าง) · dayAll ยังคลุมทุกวันเพื่อแผงข้าง/ไอคอน/จุด
  const pad2 = (n) => String(n).padStart(2, '0');
  const mkIso = (d) => `${greg}-${pad2(ym.m + 1)}-${pad2(d)}`;
  const monthFirst = mkIso(1), monthLast = mkIso(daysInMonth);
  const byDay = {};   // วันเริ่ม → [{ t, multi, contPrev, s, e }]
  const dayAll = {};  // ทุกงานที่คาบเกี่ยววันนั้น → แผงข้าง/ไอคอนช่องทาง/จุดมือถือ
  filtered.forEach(t => {
    const s = t.dateISO || parseTaskDate(t.date);
    if (!s) return;
    const e = (t.dateEnd && t.dateEnd > s) ? t.dateEnd : s;
    if (e < monthFirst || s > monthLast) return; // ไม่คาบเกี่ยวเดือนนี้
    const contPrev = s < monthFirst;             // เริ่มก่อนเดือนนี้ → โชว์ชิปที่วันที่ 1
    const ds = contPrev ? 1 : Number(s.slice(8));
    const de = e >= monthLast ? daysInMonth : Number(e.slice(8));
    (byDay[ds] = byDay[ds] || []).push({ t, multi: e > s, contPrev, s, e });
    for (let d = ds; d <= de; d++) (dayAll[d] = dayAll[d] || []).push(t);
  });

  // เปลี่ยนเดือน — คงวันที่เดิมไว้ (เดิมเด้งไปวันที่ 1 ทุกครั้ง = เสียบริบท) · กลับมาเดือนนี้ = วันนี้
  const shiftMonth = (delta) => {
    let m = ym.m + delta, y = ym.y;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    const dim = new Date(y - 543, m + 1, 0).getDate();
    const keep = (y === curY && m === curM) ? T.day : Math.min(sel, dim);
    setYm({ y, m }); setSel(keep);
  };
  const goToday = () => { setYm({ y: curY, m: curM }); setSel(T.day); };

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null); // เติมท้ายให้เต็มสัปดาห์ — กริดเป็นสี่เหลี่ยมเต็มผืน
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));


  // งานของวันที่เลือก — เรียงตามความเร่งด่วน (เลยกำหนดก่อน) ไม่ใช่ลำดับที่บังเอิญมาจากลูป
  const doneIds = doneIdsOf(flow);
  const todayIso = isoToday();
  const selTasks = sortTasks(dayAll[sel] || [], 'due');
  const selOverdue = selTasks.filter(t => dueInfo(t, todayIso, doneIds).state === 'overdue').length;
  const pickDay = (d) => {
    setSel(d);
    // จอแคบ: แผงงานอยู่ใต้ปฏิทิน → เลื่อนให้เห็นทันทีที่กดวัน
    if (typeof window !== 'undefined' && window.innerWidth <= 900) {
      requestAnimationFrame(() => dayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  // ลากงานเปลี่ยนวัน (E3) — ลากการ์ดมาวางที่ช่องวัน → อัปเดต date
  const dragId = React.useRef(null);
  const [dropDay, setDropDay] = useState(null);
  const [dragActive, setDragActive] = useState(false); // ไฮไลต์ช่องวันเฉพาะตอนกำลังลากจริง (กัน border ค้าง)
  const dayRef = React.useRef(null); // เลื่อนมาที่ส่วน "งานวันที่เลือก" เมื่อกดวัน
  // กันไฮไลต์ค้าง: ปล่อยลากนอกกริด/บางเบราว์เซอร์ไม่ยิง dragend ที่การ์ด → รีเซ็ตที่ระดับ window เสมอ
  React.useEffect(() => {
    const reset = () => { dragId.current = null; setDragActive(false); setDropDay(null); };
    window.addEventListener('dragend', reset);
    window.addEventListener('drop', reset);
    return () => { window.removeEventListener('dragend', reset); window.removeEventListener('drop', reset); };
  }, []);
  const reschedule = async (id, day) => {
    dragId.current = null; setDropDay(null);
    if (!id || readOnly) return;
    if (!canEdit()) { toast('สิทธิ์ "ดูอย่างเดียว" — ย้ายงานไม่ได้', 'warn'); return; }
    const iso = mkIso(day);
    const task = filtered.find(t => t.id === id);
    const oldS = task ? (task.dateISO || parseTaskDate(task.date)) : '';
    if (task && oldS === iso) return;
    try {
      // งานช่วงวัน: ลากแล้วเลื่อนทั้งช่วง — วันสิ้นสุดขยับตามจำนวนวันที่เลื่อน
      const patch = { date: iso };
      if (task?.dateEnd && oldS && task.dateEnd > oldS) {
        const delta = Math.round((_isoToDate(iso) - _isoToDate(oldS)) / 86400000);
        const ne = _isoToDate(task.dateEnd); ne.setDate(ne.getDate() + delta);
        patch.date_end = _dateToIso(ne);
      }
      // Phase 3.1 (OCC §9): guard ด้วย rowVersion — ถ้าคนอื่นแก้ก่อน = conflict (ไม่ทับเงียบ)
      let r = await versionedUpdate(supabase, 'tmk_tasks', id, patch, task?.rowVersion);
      if (r.conflict) {
        // Phase 3.4 (§9.1): ให้ user เลือก — โหลดล่าสุด (default) หรือเขียนทับ
        const choice = await promptConflictResolution({ entity: 'งาน', changedFields: Object.keys(patch) });
        if (choice !== 'overwrite') { refresh(['tmk_tasks']); return; }
        r = await versionedUpdate(supabase, 'tmk_tasks', id, patch);
      }
      if (!r.ok) throw r.error || new Error('เลื่อนวันไม่สำเร็จ');
      logAudit({ action: 'move', entityType: 'task', entityName: task?.title || id, summary: `เลื่อนวันงาน "${task?.title || ''}" → ${day} ${MONTHS_TH_SHORT[ym.m]}`, flowId: task?.flow ?? '' });
      refresh(['tmk_tasks']);
    } catch (err) { toast('เลื่อนวันไม่สำเร็จ: ' + pgErrorText(err), 'error'); }
  };

  // เรนเดอร์เป็น "ฟังก์ชัน" (ไม่ใช่ <Component/>) — JSX inline reconcile ตาม key แทนที่จะ unmount/remount ทุกครั้งที่ตั้ง dropDay (กัน flicker + drag event หลุดตอนลาก)
  const renderCell = (d, i) => {
    if (!d) return <div key={i} style={{ background: 'var(--surface-2)', opacity: .55 }}></div>;
    const ts = byDay[d] || [];       // งานที่ "เริ่ม" วันนี้ → ชิป [{ t, multi, contPrev, s, e }]
    const all = dayAll[d] || [];     // รวมงานที่คาบเกี่ยววันนี้ → ไอคอน/จุด/แผงข้าง
    const isSel = d === sel, isToday = d === todayDay, isDrop = dragActive && dropDay === d;
    const show = ts.slice(0, 4);
    const more = ts.length - 4;
    // ไอคอนแพลตฟอร์มของวันนี้ — แตกครบทุกช่องทางจากทุกงาน + dedup
    const seen = new Set(); const dayInfos = [];
    all.forEach(t => matchedChannelsFor(t.channel).forEach(({ info, label }) => {
      const key = info.logoUrl || info.bg || label;
      if (seen.has(key)) return; seen.add(key); dayInfos.push(info);
    }));
    return (
      <button key={i} onClick={() => pickDay(d)} aria-pressed={isSel} aria-label={`วันที่ ${d} · ${all.length} งาน`}
        onDragOver={readOnly ? undefined : (e) => { e.preventDefault(); if (dropDay !== d) setDropDay(d); }}
        onDragLeave={readOnly ? undefined : () => setDropDay(dd => dd === d ? null : dd)}
        onDrop={readOnly ? undefined : () => { setDragActive(false); reschedule(dragId.current, d); }}
        style={{
        // กริดชิดกัน: ไม่มี border ต่อช่อง (เส้นตาราง = gap ของ week-row) · เลือก = แค่พื้น accent-soft ไม่มีกรอบ
        border: 'none', borderRadius: 0,
        background: isDrop || isSel ? 'var(--accent-soft)' : 'var(--surface)',
        outline: isDrop ? '2px dashed var(--accent)' : 'none', outlineOffset: -2,
        padding: '5px 6px', display: 'flex', flexDirection: 'column',
        gap: 2, textAlign: 'left', alignItems: 'stretch', height: '100%',
        transition: 'background 0.15s var(--ease)', overflow: 'hidden',
      }}>
        <div className="row between" style={{ gap: 4, marginBottom: 1, flexShrink: 0 }}>
          {isToday
            ? <span className="num sm" style={{ display: 'inline-grid', placeItems: 'center', minWidth: 20, height: 20, padding: '0 4px', borderRadius: 6, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm)' }}>{d}</span>
            : <span className="num sm" style={{ fontWeight: isSel ? 700 : 500, color: isSel ? 'var(--accent-2)' : 'var(--ink)', fontSize: 'var(--fs-sm)', lineHeight: '20px' }}>{d}</span>}
          {dayInfos.length > 0 && (
            <div className="cal-day-icons" style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              {dayInfos.slice(0, 4).map((info, i) => <ChIcon key={i} info={info} size={16} />)}
              {dayInfos.length > 4 && <span style={{ fontSize: 8, color: 'var(--ink-3)', fontWeight: 700, display: 'grid', placeItems: 'center' }}>+{dayInfos.length - 4}</span>}
            </div>
          )}
        </div>
        <div className="cal-cell-titles" style={{ display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden', flex: 1, minHeight: 0 }}>
          {show.map(({ t, multi, contPrev, s, e }) => {
            const c = DD.campaigns.find(x => x.id === t.camp);
            const col = colorForTask(t, colorSrc, '#888');
            // ชิปงานเดียว วันเริ่ม (ไม่พาดยาว) · หลายวัน = ลูกศร › ท้าย · ต่อจากเดือนก่อน = ‹ หน้า · กดเปิดงาน
            return <span key={t.id} role="button" tabIndex={0}
              onClick={readOnly ? undefined : (ev) => { ev.stopPropagation(); openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] }); }}
              title={t.title + (c ? ` · ${c.name}` : '') + (multi ? ` · ${thaiDate(s)} → ${thaiDate(e)}` : '')}
              style={{ fontSize: 'var(--fs-micro)', fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: col, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.7, flexShrink: 0, cursor: readOnly ? 'default' : 'pointer',
                opacity: doneIds.has(t.status) ? .45 : 1, textDecoration: doneIds.has(t.status) ? 'line-through' : 'none' }}>{contPrev ? '‹ ' : ''}{t.title}{multi ? ' ›' : ''}</span>;
          })}
        </div>
        {/* มือถือ: โชว์เป็นจุดสีแทน title (แตะดูรายละเอียดข้างล่าง) — รวมงานช่วงวันด้วย */}
        <div className="cal-cell-dots">
          {all.slice(0, 8).map(t => <span key={t.id} style={{ width: 6, height: 6, borderRadius: '50%', background: colorForTask(t, colorSrc), flexShrink: 0 }} />)}
        </div>
        {more > 0 && <span className="cal-more-desktop" style={{ fontSize: 'var(--fs-micro)', fontWeight: 'var(--fw-sem)', color: 'var(--accent-2)', textAlign: 'center', flexShrink: 0 }}>+{more} งาน</span>}
      </button>
    );
  };

  return (
    <div className="content-inner rise">
      <PlannerFilters {...fProps} />
      {/* การ์ดเดียว: ปฏิทิน (ซ้าย) + งานวันที่เลือก (ขวา) รวมในกล่องเดียว */}
      <Card className="p-0 overflow-hidden">
        <div className="grid cal-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px', alignItems: 'stretch' }}>
          {/* ฝั่งปฏิทิน */}
          <div className="p-[22px]">
            <CardHeader className="flex-row items-center justify-between space-y-0 p-0 pb-4 flex-wrap gap-[10px]">
              <div className="row" style={{ gap: 8 }}>
                <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)} title="เดือนก่อน"><span style={{ transform: 'rotate(180deg)', display: 'grid' }}><Icon name="chevR" /></span></Button>
                <h3 style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>{MONTHS_TH[ym.m]} {ym.y}</h3>
                <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)} title="เดือนถัดไป"><Icon name="chevR" /></Button>
                <Button variant="outline" size="sm" onClick={goToday}>วันนี้</Button>
              </div>
            </CardHeader>

            <div className="cal-month-grid">
              <div className="cal-head-row">
                {DAY_LABELS.map(dl => <div key={dl} className="cap" style={{ textAlign: 'center', padding: '6px 0', fontWeight: 'var(--fw-sem)' }}>{dl}</div>)}
              </div>
              {weeks.map((week, w) => (
                <div key={w} className="cal-week-row">
                  {week.map((d, i) => renderCell(d, w * 7 + i))}
                </div>
              ))}
            </div>
          </div>

          {/* ฝั่งงานวันที่เลือก — เส้นแบ่งในการ์ดเดียวกัน */}
          <div ref={dayRef} className="cal-day-panel p-[22px]" style={{ borderLeft: '1px solid var(--line)', background: 'var(--surface-2, transparent)' }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>{sel} {MONTHS_TH_SHORT[ym.m]} {ym.y}</div>
            <div className="row between" style={{ marginBottom: 14 }}>
              <h3 className="flex items-center gap-2">{selTasks.length} งาน
                {selOverdue > 0 && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--bad) 14%, transparent)', color: 'var(--bad)' }}>เลยกำหนด {selOverdue}</span>}
              </h3>
              {!readOnly && <Button size="sm" onClick={() => openModal('task', { ...newTaskBase, date: `${greg}-${String(ym.m + 1).padStart(2, '0')}-${String(sel).padStart(2, '0')}` })}><Icon name="plus" /> เพิ่ม</Button>}
            </div>
            {selTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--ink-4)' }}>
                <span style={{ display: 'inline-block', width: 36, height: 36 }}><Icon name="calendarDays" /></span>
                <div className="cap" style={{ marginTop: 8 }}>ไม่มีงานในวันที่เลือก</div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {selTasks.map(t => (
                  <TaskCard key={t.id} task={t} showFlow={!flow} readOnly={readOnly}
                    draggable={!readOnly} onDragStart={() => { dragId.current = t.id; setDragActive(true); }} onDragEnd={() => { dragId.current = null; setDragActive(false); setDropDay(null); }}
                    onClick={() => openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })} />
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
