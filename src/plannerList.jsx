/* ============================================================
   plannerList.jsx — วิว "รายการ" ของโครงการ — PART 104 (รื้อใหม่)
   ============================================================
   เดิม: ตารางแยกตามสถานะ · เรียงไม่ได้ · เปลี่ยนสถานะรายแถวไม่ได้ (ต้องเปิด popup)
         · กลุ่ม "เสร็จแล้ว" กางเต็มดันงานที่ต้องทำตกจอ · bulk ล้มเหลวเงียบ
   ใหม่: เลือกวิธีเรียงได้ · แต่ละแถวมีเมนูย้ายสถานะ + วันครบกำหนดมีสีเตือน
         · พับกลุ่มได้ (เสร็จแล้วพับเอง) · bulk รายงานจำนวนที่ล้มเหลว
   ============================================================ */
import { useState, useEffect } from 'react';
import { pgErrorText } from './lib/pgError.js';
import { Icon, Avatar } from './components.jsx';
import { CardTable } from './components/DataTableParts.jsx';
import { supabase } from './lib/supabaseClient.js';
import { versionedUpdate, promptConflictResolution } from './lib/optimisticUpdate.js';
import { logAudit } from './lib/audit.js';
import { thaiDate } from './lib/dateUtils.js';
import { colorForTask, colorSourceOf } from './lib/taskColor.js';
import { PriorityTag } from './taskCard.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox as ShadcnCheckbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { DD } from './saleWidgets.jsx';
import { toast, confirm, openModal, refresh, canEdit } from './lib/appBus.js';
import { flowColumns, doneIdsOf } from './plannerColumns.js';
import { PlannerFilters } from './plannerFilters.jsx';
import { sortTasks, dueInfo, isoToday } from './lib/taskFilters.js';
import { EmptyState } from './components/EmptyState.jsx';

const COL_TONE = { todo: 'var(--ink-3)', inprogress: 'var(--info)', review: 'var(--warn)', done: 'var(--good)' };
const DUE_TONE = { overdue: 'var(--bad)', today: 'var(--warn)' };

export function TaskListView({ filtered, fProps, flow, readOnly }) {
  const cols = flowColumns(flow);
  const doneIds = doneIdsOf(flow);
  const today = isoToday();
  const newTaskBase = flow ? { flow_id: (flow.scopeId ?? flow.id) } : {};
  const [sel, setSel] = useState(() => new Set());
  const [sortBy, setSortBy] = useState('manual');
  const [folded, setFolded] = useState(() => new Set(cols.filter(c => c.done).map(c => c.id))); // เสร็จแล้ว = พับไว้
  // สลับโครงการแล้วคอลัมน์ "เสร็จแล้ว" ของโครงการใหม่ต้องพับเอง (id คอลัมน์ต่างกันได้)
  const colKey = cols.map(c => c.id).join(',');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- รีเซ็ตกลุ่มที่พับเมื่อ "ชุดคอลัมน์" เปลี่ยน (สลับโครงการ) · deps = colKey ล้วน
    setFolded(new Set(cols.filter(c => c.done).map(c => c.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตั้งใจผูกกับ colKey (string) แทน cols (อาร์เรย์ identity ใหม่ทุก render)
  }, [colKey]);
  const selArr = [...sel];
  const mayEdit = !readOnly && canEdit();
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (list) => setSel(s => { const n = new Set(s); const ids = list.map(t => t.id); const allOn = ids.every(id => n.has(id)); ids.forEach(id => allOn ? n.delete(id) : n.add(id)); return n; });
  const toggleFold = (id) => setFolded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSel = () => setSel(new Set());
  const members = ((flow?.members?.length ? flow.members : (DD.staff || []).map(s => s.name)) || []).filter(Boolean);
  const openTask = (t) => openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] });

  // ย้ายสถานะรายแถว (ทางเลือกแทนเปิด popup)
  const setStatus = async (t, status) => {
    if (!mayEdit || t.status === status) return;
    const stCol = cols.find(k => k.id === status) || {};
    // ใช้ OCC เหมือนบอร์ด Kanban — เดิมเขียนทับตรง ๆ ทำให้ทับงานที่คนอื่นเพิ่งย้ายโดยไม่มีใครรู้
    let r = await versionedUpdate(supabase, 'tmk_tasks', t.id, { status }, t.rowVersion);
    if (r.conflict) {
      const choice = await promptConflictResolution({ entity: 'งาน', changedFields: ['status'] });
      if (choice !== 'overwrite') { refresh(['tmk_tasks']); return; }
      r = await versionedUpdate(supabase, 'tmk_tasks', t.id, { status });
    }
    if (!r.ok) { toast('ย้ายไม่สำเร็จ: ' + pgErrorText(r.error), 'error'); return; }
    logAudit({ action: 'move', entityType: 'task', entityName: t.title, summary: `ย้ายงาน "${t.title}" → ${stCol.label || status}`, flowId: t.flow ?? '' });
    refresh(['tmk_tasks']);
    toast(`ย้าย "${t.title}" → ${stCol.label || status}`, 'success');
  };

  const runBulk = async (ids, fn, okMsg) => {
    const res = await Promise.all(ids.map(id => fn(id).then(r => r?.error || null).catch(e => e)));
    const bad = res.filter(Boolean).length;
    refresh(['tmk_tasks']); clearSel();
    if (bad) toast(`สำเร็จ ${ids.length - bad} · ล้มเหลว ${bad}`, bad === ids.length ? 'error' : 'warn');
    else toast(okMsg, 'success');
  };
  const bulkStatus = async (status) => {
    const ids = selArr; if (!ids.length || !mayEdit) return;
    const stCol = cols.find(k => k.id === status) || {};
    await runBulk(ids, (id) => {
      const t = filtered.find(x => x.id === id);
      return supabase.from('tmk_tasks').update({ status }).eq('id', id).then(r => {
        if (!r.error) logAudit({ action: 'move', entityType: 'task', entityName: t?.title || id, summary: `ย้ายงาน "${t?.title || ''}" → ${stCol.label || status}`, flowId: t?.flow ?? '' });
        return r;
      });
    }, `เปลี่ยนสถานะ ${ids.length} งาน`);
  };
  const bulkAssign = async (name) => {
    const ids = selArr; if (!ids.length || !mayEdit) return;
    await runBulk(ids, (id) => {
      const t = filtered.find(x => x.id === id); const cur = t?.responsible || [];
      if (cur.includes(name)) return Promise.resolve({ error: null });
      return supabase.from('tmk_tasks').update({ responsible: [...cur, name].join(', ') }).eq('id', id);
    }, `มอบหมาย "${name}" ให้ ${ids.length} งาน`);
  };
  const bulkDelete = async () => {
    const ids = selArr; if (!ids.length || !mayEdit) return;
    if (!await confirm({ title: `ลบ ${ids.length} งาน`, body: 'ย้ายงานที่เลือกไปถังขยะ (กู้คืนได้)?', danger: true, confirmText: 'ลบ' })) return;
    await runBulk(ids, (id) => supabase.from('tmk_tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id), `ลบ ${ids.length} งานแล้ว`);
  };

  return (
    <div className="content-inner rise">
      <PlannerFilters {...fProps} />
      {/* แถบเรียงลำดับ — เดิมเรียงตาม sort_order อย่างเดียว หาว่าอะไรใกล้ครบกำหนดไม่ได้ */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">เรียงตาม</span>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-8 w-auto gap-1 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">ลำดับบนบอร์ด</SelectItem>
            <SelectItem value="due">ครบกำหนด</SelectItem>
            <SelectItem value="priority">ความสำคัญ</SelectItem>
            <SelectItem value="title">ชื่องาน</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {filtered.length === 0 && <EmptyState icon="search" title="ไม่พบงานตามเงื่อนไข" hint="ลองล้างตัวกรอง หรือเปลี่ยนคำค้นหา" />}
      <div className="flex flex-col gap-5">
        {cols.map(col => {
          const list = sortTasks(filtered.filter(t => t.status === col.id), sortBy);
          if (!list.length && col.done) return null; // คอลัมน์เสร็จที่ว่าง = ไม่ต้องโชว์
          const tone = col.color || COL_TONE[col.id] || 'var(--ink-3)';
          const allOn = list.length > 0 && list.every(t => sel.has(t.id));
          const nOver = col.done ? 0 : list.filter(t => dueInfo(t, today, doneIds).state === 'overdue').length;
          const isFolded = folded.has(col.id);
          return (
            <div key={col.id} className="rounded-lg border overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b">
                <button type="button" onClick={() => toggleFold(col.id)} className="flex items-center gap-2 min-w-0 font-bold text-sm hover:opacity-80" aria-expanded={!isFolded}>
                  <Icon name={isFolded ? 'chevR' : 'chevD'} className="size-3.5 opacity-60 shrink-0" />
                  <span className="size-2.5 rounded-full shrink-0" style={{ background: tone }} />
                  <span className="truncate">{col.label}</span>
                </button>
                <Badge variant="secondary">{list.length}</Badge>
                {nOver > 0 && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--bad) 14%, transparent)', color: 'var(--bad)' }}>เลยกำหนด {nOver}</span>}
              </div>
              {isFolded ? null : list.length === 0 ? (
                <div className="px-4 py-3 text-xs text-muted-foreground">ไม่มีงานในสถานะนี้</div>
              ) : (
                <CardTable><Table>
                  <TableHeader>
                    <TableRow>
                      {mayEdit && <TableHead className="w-9"><ShadcnCheckbox checked={allOn} onCheckedChange={() => toggleGroup(list)} aria-label="เลือกทั้งหมด" /></TableHead>}
                      <TableHead className="w-[38%]">งาน</TableHead>
                      <TableHead className="hidden lg:table-cell">รายละเอียด</TableHead>
                      <TableHead className="w-28">ครบกำหนด</TableHead>
                      <TableHead className="w-20">สำคัญ</TableHead>
                      <TableHead className="w-24">ทีม</TableHead>
                      {mayEdit && <TableHead className="w-16 text-right">ย้าย</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map(t => {
                      const barCol = colorForTask(t, colorSourceOf(flow), '#888');
                      const d = dueInfo(t, today, doneIds);
                      const dueCol = DUE_TONE[d.state];
                      return (
                        <TableRow key={t.id} data-state={sel.has(t.id) ? 'selected' : undefined} className={readOnly ? '' : 'cursor-pointer'} onClick={readOnly ? undefined : () => openTask(t)}>
                          {mayEdit && <TableCell onClick={e => e.stopPropagation()}><ShadcnCheckbox checked={sel.has(t.id)} onCheckedChange={() => toggle(t.id)} aria-label={`เลือกงาน ${t.title}`} /></TableCell>}
                          <TableCell className="cell-title">
                            <div className="font-medium text-[13px] flex items-center gap-2" style={{ borderLeft: `3px solid ${d.state === 'overdue' ? 'var(--bad)' : barCol}`, paddingLeft: 8 }}>{t.title}</div>
                            {(t.tags || []).length > 0 && <div className="flex flex-wrap gap-1 mt-1 pl-2">{t.tags.slice(0, 4).map(tg => <span key={tg} className="text-[10px] px-1.5 rounded-full bg-muted text-muted-foreground">{tg}</span>)}</div>}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell"><span className="text-xs text-muted-foreground line-clamp-1 max-w-[260px]">{t.detail || '—'}</span></TableCell>
                          <TableCell className="text-xs tabular-nums whitespace-nowrap" style={dueCol ? { color: dueCol, fontWeight: 600 } : undefined}>
                            {d.iso ? thaiDate(d.iso) : '—'}
                            {d.state === 'overdue' && <span className="block text-[10px]">เลย {Math.abs(d.diff)} วัน</span>}
                            {d.state === 'today' && <span className="block text-[10px]">วันนี้</span>}
                          </TableCell>
                          <TableCell><PriorityTag value={t.priority} /></TableCell>
                          <TableCell><div className="flex items-center -space-x-1.5">{(t.responsible || []).slice(0, 3).map(r => { const s = DD.staff.find(x => x.name === r) || { color: '#888' }; return <Avatar key={r} name={r} color={s.color} size={20} />; })}</div></TableCell>
                          {mayEdit && (
                            <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-7" aria-label={`ย้ายสถานะงาน ${t.title}`} title="ย้ายสถานะ"><Icon name="arrowR" className="size-3.5" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {cols.map(k => (
                                    <DropdownMenuItem key={k.id} disabled={k.id === t.status} onSelect={() => setStatus(t, k.id)} className="gap-2">
                                      <span className="size-2 rounded-full" style={{ background: k.color || COL_TONE[k.id] || '#94a3b8' }} />{k.label}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table></CardTable>
              )}
              {!readOnly && !isFolded && <button onClick={() => openModal('task', { ...newTaskBase, status: col.id })} className="w-full px-4 py-2 text-xs text-muted-foreground hover:bg-muted/30 flex items-center gap-1.5 border-t"><Icon name="plus" className="size-3.5" /> เพิ่มงานใน "{col.label}"</button>}
            </div>
          );
        })}
      </div>
      {/* แถบจัดการกลุ่ม — ลอยล่างจอเมื่อเลือก ≥1 งาน */}
      {sel.size > 0 && mayEdit && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-40 flex items-center gap-1.5 rounded-xl border bg-popover shadow-lg px-3 py-2">
          <span className="text-sm font-semibold px-1">เลือก {sel.size}</span>
          <span className="w-px h-5 bg-border mx-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-8"><Icon name="circle" className="size-4 mr-1" /> สถานะ</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top">{cols.map(k => <DropdownMenuItem key={k.id} onClick={() => bulkStatus(k.id)}><span className="size-2 rounded-full mr-2" style={{ background: k.color || '#94a3b8' }} />{k.label}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-8"><Icon name="users" className="size-4 mr-1" /> มอบหมาย</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top" className="max-h-64 overflow-auto">{members.length === 0 ? <DropdownMenuItem disabled>ไม่มีสมาชิก</DropdownMenuItem> : members.map(n => <DropdownMenuItem key={n} onClick={() => bulkAssign(n)}>{n}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" className="h-8 text-destructive hover:bg-destructive/10" onClick={bulkDelete}><Icon name="trash" className="size-4 mr-1" /> ลบ</Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={clearSel} title="ยกเลิกเลือก" aria-label="ยกเลิกเลือก"><Icon name="x" className="size-4" /></Button>
        </div>
      )}
    </div>
  );
}
