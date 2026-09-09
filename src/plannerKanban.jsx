/* ============================================================
   plannerKanban.jsx — วิว "บอร์ด" (Kanban) ของโครงการ — PART 104 (รื้อใหม่)
   ============================================================
   เดิม: หัวคอลัมน์มีแค่ชื่อ+จำนวน · ย้ายงานได้ทาง "ลาก" อย่างเดียวบนเดสก์ท็อป
         (มือถือมี select เล็กๆ) → ผิด WCAG 2.2 "dragging movements" (ต้องมีทางเลือกที่ไม่ใช่ลาก)
         · reorder เขียน DB ทีละแถวเป็นลูป await · การ์ดเรียงตาม sortOrder ที่เป็น 0 หมด = ลำดับไม่นิ่ง
   ใหม่: หัวคอลัมน์บอกจำนวน+เลยกำหนด · พับคอลัมน์ได้ (จำไว้ต่อโครงการ) · เส้นบอกตำแหน่งวาง
         · ทุกการ์ดมีเมนู "ย้าย" (คีย์บอร์ดใช้ได้) · เขียน DB ขนาน · เรียงนิ่งด้วย sortTasks
   ============================================================ */
import React from 'react';
import { pgErrorText } from './lib/pgError.js';
import { Icon } from './components.jsx';
import { supabase } from './lib/supabaseClient.js';
import { versionedUpdate, promptConflictResolution } from './lib/optimisticUpdate.js';
import { logAudit } from './lib/audit.js';
import { TaskCard } from './taskCard.jsx';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast, openModal, refresh, canEdit } from './lib/appBus.js';
import { flowColumns, doneIdsOf } from './plannerColumns.js';
import { PlannerFilters } from './plannerFilters.jsx';
import { sortTasks, dueInfo, isoToday } from './lib/taskFilters.js';

const COL_TONE = { todo: 'var(--ink-3)', inprogress: 'var(--info)', review: 'var(--warn)', done: 'var(--good)' };

export function KanbanBoard({ tasks, setTasks, filtered, fProps, flow, readOnly }) {
  const [over, setOver] = React.useState(null);      // คอลัมน์ที่ลากค้างอยู่
  const [overCard, setOverCard] = React.useState(null); // การ์ดที่จะแทรกด้านบน (เส้นบอกตำแหน่ง)
  const dragId = React.useRef(null);
  const [dragging, setDragging] = React.useState(false); // ใช้ใน render แทนการอ่าน ref (React Compiler)
  const columns = flowColumns(flow);
  const doneIds = doneIdsOf(flow);
  const today = isoToday();
  const newTaskBase = flow ? { flow_id: (flow.scopeId ?? flow.id) } : {};
  const lsKey = 'tmk-kb-collapsed-' + (flow?.id || 'all');
  const [collapsed, setCollapsed] = React.useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(lsKey) || '[]')); } catch { return new Set(); }
  });
  /* สลับโครงการ = component ตัวเดิม (ไม่ remount) → ต้องอ่านค่าที่พับไว้ของโครงการใหม่เอง
     เดิม state ตั้งครั้งเดียวตอน mount → คอลัมน์ที่พับของโครงการ A ติดไปโครงการ B
     แล้วการกดครั้งถัดไปเขียนทับค่าที่บันทึกไว้ของ B ด้วย */
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่านค่าจาก external store (localStorage) ตอนสลับโครงการ · deps = lsKey ล้วน ไม่เกิดลูกโซ่
    try { setCollapsed(new Set(JSON.parse(localStorage.getItem(lsKey) || '[]'))); }
    catch { setCollapsed(new Set()); }
  }, [lsKey]);
  const toggleCol = (id) => setCollapsed(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id);
    try { localStorage.setItem(lsKey, JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });
  // กันไฮไลต์ค้างเมื่อปล่อยลากนอกบอร์ด
  React.useEffect(() => {
    const reset = () => { dragId.current = null; setDragging(false); setOver(null); setOverCard(null); };
    window.addEventListener('dragend', reset); window.addEventListener('drop', reset);
    return () => { window.removeEventListener('dragend', reset); window.removeEventListener('drop', reset); };
  }, []);

  // ย้ายสถานะงาน — ใช้ทั้งลาก (เดสก์ท็อป) และเมนู "ย้าย" บนการ์ด (ทางเลือกที่ไม่ต้องลาก)
  const moveTask = async (id, status) => {
    if (!id) return;
    if (!canEdit()) { toast('สิทธิ์ "ดูอย่างเดียว" — ย้ายงานไม่ได้', 'warn'); return; }
    const task = tasks.find(t => t.id === id);
    const prev = task?.status;
    if (prev === status) return;
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status } : t));
    try {
      let r = await versionedUpdate(supabase, 'tmk_tasks', id, { status }, task?.rowVersion);
      if (r.conflict) {
        const choice = await promptConflictResolution({ entity: 'งาน', changedFields: ['status'] });
        if (choice !== 'overwrite') { setTasks(ts => ts.map(t => t.id === id ? { ...t, status: prev } : t)); refresh(['tmk_tasks']); return; }
        r = await versionedUpdate(supabase, 'tmk_tasks', id, { status });
      }
      if (!r.ok) throw r.error || new Error('ย้ายไม่สำเร็จ');
      const stLabel = (columns.find(k => k.id === status) || {}).label || status;
      logAudit({ action: 'move', entityType: 'task', entityName: task?.title || id, summary: `ย้ายงาน "${task?.title || ''}" → ${stLabel}`, flowId: task?.flow ?? '' });
      toast(`ย้าย "${task?.title || 'งาน'}" → ${stLabel}`, 'success');
      refresh(['tmk_tasks']);
    } catch (err) {
      setTasks(ts => ts.map(t => t.id === id ? { ...t, status: prev } : t));
      toast('ย้ายไม่สำเร็จ: ' + err.message, 'error');
    }
  };

  // ลากจัดลำดับ + ย้ายข้ามคอลัมน์ — reindex sort_order · เขียนขนาน (เดิมลูป await ทีละแถว)
  const reorder = async (id, targetId, status) => {
    setOver(null); setOverCard(null); setDragging(false);
    if (!id || id === targetId) return;
    if (!canEdit()) { toast('สิทธิ์ "ดูอย่างเดียว" — ย้ายงานไม่ได้', 'warn'); return; }
    const dragged = tasks.find(t => t.id === id); if (!dragged) return;
    const col = sortTasks(tasks.filter(t => t.status === status && t.id !== id), 'manual');
    let at = targetId ? col.findIndex(t => t.id === targetId) : col.length;
    if (at < 0) at = col.length;
    col.splice(at, 0, dragged);
    const updates = col.map((t, i) => ({ id: t.id, sort_order: (i + 1) * 10 }));
    const before = tasks;   // สแนปช็อตก่อนแก้ — ใช้ย้อนกลับเมื่อผู้ใช้เลือกไม่ทับ conflict
    setTasks(ts => ts.map(t => { const u = updates.find(x => x.id === t.id); return (u || t.id === id) ? { ...t, sortOrder: u ? u.sort_order : t.sortOrder, status: t.id === id ? status : t.status } : t; }));
    const changed = updates.filter(u => { const o = tasks.find(t => t.id === u.id); return o && (o.sortOrder !== u.sort_order || (u.id === id && o.status !== status)); });
    try {
      /* ⚠️ ใบที่ "เปลี่ยนสถานะ" ต้อง guard ด้วย row_version เหมือน moveTask
         เดิมเขียนตรง ๆ → A เปิดบอร์ดค้าง · B ย้ายงานไป "เสร็จ" · A ลากการ์ดเดิม
         → ทับสถานะของ B เงียบ ๆ ขณะที่เมนู "ย้าย" บนการ์ดเดียวกันเตือน conflict ปกติ
         (แถวที่เปลี่ยนแค่ลำดับ ไม่ต้อง guard — ชนกันแล้วไม่เสียหาย แค่ลำดับสลับ) */
      const results = await Promise.all(changed.map(async (u) => {
        if (u.id !== id) {
          const r = await supabase.from('tmk_tasks').update({ sort_order: u.sort_order }).eq('id', u.id);
          return { u, error: r.error };
        }
        const cur = tasks.find(t => t.id === u.id);
        const r = await versionedUpdate(supabase, 'tmk_tasks', u.id, { sort_order: u.sort_order, status }, cur?.rowVersion);
        if (r.conflict) return { u, conflict: true };
        return { u, error: r.ok ? null : r.error };
      }));
      const clash = results.find(r => r.conflict);
      if (clash) {
        const choice = await promptConflictResolution({ entity: 'งาน', changedFields: ['status'] });
        if (choice !== 'overwrite') { setTasks(before); refresh(['tmk_tasks']); return; }
        const u = clash.u;
        const r2 = await versionedUpdate(supabase, 'tmk_tasks', u.id, { sort_order: u.sort_order, status });
        if (!r2.ok) throw r2.error || new Error('ย้ายไม่สำเร็จ');
      }
      // graceful: ยังไม่ migrate sort_order → อย่างน้อยต้องย้ายสถานะให้สำเร็จ
      const missingCol = results.find(r => r.error && /sort_order/.test(r.error.message || ''));
      if (missingCol) {
        const { error } = await supabase.from('tmk_tasks').update({ status }).eq('id', id);
        if (error) throw error;
      } else {
        const bad = results.find(r => r.error);
        if (bad) throw bad.error;
      }
      if (dragged.status !== status) {
        const stLabel = (columns.find(k => k.id === status) || {}).label || status;
        logAudit({ action: 'move', entityType: 'task', entityName: dragged.title, summary: `ย้ายงาน "${dragged.title}" → ${stLabel}`, flowId: dragged.flow ?? '' });
      }
      refresh(['tmk_tasks']);
    } catch (err) { refresh(['tmk_tasks']); toast('จัดลำดับไม่สำเร็จ: ' + pgErrorText(err), 'error'); }
  };
  const onDrop = (status) => { const id = dragId.current; dragId.current = null; reorder(id, null, status); };

  const openTask = (t) => openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] });

  return (
    <div className="content-inner rise">
      <PlannerFilters {...fProps} />
      <div className="planner-kanban" style={{ gap: 14, alignItems: 'start' }}>
        {columns.map(col => {
          const list = sortTasks(filtered.filter(t => t.status === col.id), 'manual');
          const tone = col.color || COL_TONE[col.id] || 'var(--ink-3)';
          const isDoneCol = !!col.done;
          const nOver = isDoneCol ? 0 : list.filter(t => dueInfo(t, today, doneIds).state === 'overdue').length;
          const isCollapsed = collapsed.has(col.id);
          if (isCollapsed) {
            return (
              <button key={col.id} type="button" onClick={() => toggleCol(col.id)} title={`กางคอลัมน์ ${col.label}`}
                className="kb-col-collapsed" style={{ borderColor: 'var(--line)' }}>
                <Icon name="chevD" className="size-3.5 opacity-60" />
                <span className="size-2 rounded-full" style={{ background: tone }} />
                <span className="kb-col-vert">{col.label}</span>
                <Badge variant="secondary">{list.length}</Badge>
              </button>
            );
          }
          return (
            <section key={col.id} aria-label={col.label}
              onDragOver={readOnly ? undefined : e => { e.preventDefault(); if (over !== col.id) setOver(col.id); }}
              onDragLeave={readOnly ? undefined : () => setOver(o => o === col.id ? null : o)}
              onDrop={readOnly ? undefined : () => onDrop(col.id)}
              style={{ background: over === col.id ? 'var(--accent-soft)' : 'var(--surface-2)', borderRadius: 'var(--r-lg)', padding: 12, minHeight: 200, transition: 'background 0.15s',
                border: over === col.id ? '1.5px dashed var(--accent)' : '1.5px dashed transparent', opacity: isDoneCol && !list.length ? .75 : 1 }}>
              {/* หัวคอลัมน์ — ชื่อ · จำนวน · เลยกำหนด · พับ · เพิ่มงาน */}
              <div className="flex items-center gap-1.5 pb-3" style={{ padding: '2px 2px 12px' }}>
                <span className="size-2 rounded-full shrink-0" style={{ background: tone }} />
                <span className="font-bold truncate" style={{ fontSize: 'var(--fs-sm)' }}>{col.label}</span>
                <Badge variant="secondary" className="shrink-0">{list.length}</Badge>
                {nOver > 0 && <span className="shrink-0 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--bad) 14%, transparent)', color: 'var(--bad)' }}>เลย {nOver}</span>}
                <span className="ml-auto flex items-center gap-0.5 shrink-0">
                  {!readOnly && <Button variant="ghost" size="icon" className="size-7" title={`เพิ่มงานใน ${col.label}`} aria-label={`เพิ่มงานใน ${col.label}`} onClick={() => openModal('task', { ...newTaskBase, status: col.id })}><Icon name="plus" className="size-4" /></Button>}
                  <Button variant="ghost" size="icon" className="size-7" title={`พับคอลัมน์ ${col.label}`} aria-label={`พับคอลัมน์ ${col.label}`} onClick={() => toggleCol(col.id)}><Icon name="chevD" className="size-3.5" style={{ transform: 'rotate(180deg)' }} /></Button>
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {list.map(t => (
                  <div key={t.id}
                    onDragOver={readOnly ? undefined : e => { e.preventDefault(); if (over !== col.id) setOver(col.id); if (overCard !== t.id) setOverCard(t.id); }}
                    onDrop={readOnly ? undefined : e => { e.stopPropagation(); const id = dragId.current; dragId.current = null; reorder(id, t.id, col.id); }}
                    style={{ borderTop: overCard === t.id && over === col.id && dragging ? '2px solid var(--accent)' : '2px solid transparent', paddingTop: 2 }}>
                    <TaskCard task={t} draggable={!readOnly} readOnly={readOnly}
                      onClick={() => openTask(t)}
                      onDragStart={() => { dragId.current = t.id; setDragging(true); }}
                      onDragEnd={() => { dragId.current = null; setDragging(false); setOver(null); setOverCard(null); }}
                      statusColumns={columns} onStatusChange={moveTask} />
                  </div>
                ))}
                {list.length === 0 && <div className="cap" style={{ textAlign: 'center', padding: '16px 0', opacity: 0.6 }}>{readOnly ? 'ไม่มีงาน' : 'ลากการ์ดมาที่นี่'}</div>}
                {!readOnly && <button onClick={() => openModal('task', { ...newTaskBase, status: col.id })} style={{
                  width: '100%', padding: '10px', border: '1.5px dashed var(--line)', borderRadius: 'var(--r-sm)',
                  background: 'transparent', cursor: 'pointer', color: 'var(--ink-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)', marginTop: 4,
                }}>
                  <Icon name="plus" /> เพิ่มงาน
                </button>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
