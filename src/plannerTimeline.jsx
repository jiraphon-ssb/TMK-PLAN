/* ============================================================
   plannerTimeline.jsx — วิว "ไทม์ไลน์" ของโครงการ — PART 104 (รื้อใหม่)
   ============================================================
   เดิม: การ์ดความคืบหน้าแคมเปญกองบนสุด (นับจาก DD.tasks ทั้งระบบ ไม่สนตัวกรอง = เลขไม่ตรงกับที่เห็น)
         + ไล่วันเรียงจากอดีต→อนาคตทั้งก้อน · จุดวันอดีตเป็นสีเขียวเหมือน "เสร็จ" ทั้งที่อาจเลยกำหนด
   ใหม่: จัดเป็นช่วงตามความเร่งด่วน (เลยกำหนด → วันนี้ → พรุ่งนี้ → ใน 7 วัน → ภายหลัง → ไม่มีกำหนด → เสร็จแล้ว)
         · ยึด "วันครบกำหนด" (dateEnd||date) เหมือนทุกวิว · เสร็จแล้วพับไว้ · แถบสรุปกดกระโดดได้
   ============================================================ */
import { useState } from 'react';
import { Icon } from './components.jsx';
import { thaiDate } from './lib/dateUtils.js';
import { TaskCard } from './taskCard.jsx';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { openModal } from './lib/appBus.js';
import { doneIdsOf } from './plannerColumns.js';
import { PlannerFilters } from './plannerFilters.jsx';
import { dueInfo, sortTasks, isoToday } from './lib/taskFilters.js';
import { EmptyState } from './components/EmptyState.jsx';

// ช่วงเวลา (เรียงตามความเร่งด่วน) — key ต้องตรงกับ bucketOf()
const BUCKETS = [
  { id: 'overdue', label: 'เลยกำหนด', color: 'var(--bad)', hint: 'ต้องจัดการก่อน' },
  { id: 'today', label: 'วันนี้', color: 'var(--accent)', hint: '' },
  { id: 'tomorrow', label: 'พรุ่งนี้', color: 'var(--warn)', hint: '' },
  { id: 'week', label: 'ใน 7 วัน', color: 'var(--info)', hint: '' },
  { id: 'later', label: 'ภายหลัง', color: 'var(--ink-3)', hint: '' },
  { id: 'none', label: 'ไม่มีกำหนด', color: 'var(--ink-4)', hint: 'ยังไม่ได้ตั้งวัน' },
  { id: 'done', label: 'เสร็จแล้ว', color: 'var(--good)', hint: '' },
];
export function bucketOf(state, diff) {
  if (state === 'done') return 'done';
  if (state === 'none') return 'none';
  if (state === 'overdue') return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 7) return 'week';
  return 'later';
}

export function TimelineView({ filtered, fProps, flow, readOnly }) {
  const doneIds = doneIdsOf(flow);
  const today = isoToday();
  const newTaskBase = flow ? { flow_id: (flow.scopeId ?? flow.id) } : {};
  const [foldDone, setFoldDone] = useState(true); // งานที่เสร็จแล้วพับไว้ (เดิมกางเต็ม ดันงานค้างตกจอ)

  // แบ่งงานเข้าช่วง + เรียงตามวันครบกำหนดในแต่ละช่วง
  const groups = {};
  (filtered || []).forEach(t => {
    const d = dueInfo(t, today, doneIds);
    const b = bucketOf(d.state, d.diff);
    (groups[b] = groups[b] || []).push({ t, d });
  });
  const shown = BUCKETS.map(b => ({ ...b, items: sortTasks((groups[b.id] || []).map(x => x.t), b.id === 'done' ? 'updated' : 'due') }))
    .filter(b => b.items.length > 0);
  const open = shown.filter(b => b.id !== 'done').reduce((n, b) => n + b.items.length, 0);

  const openTask = (t) => openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] });

  return (
    <div className="content-inner rise">
      <PlannerFilters {...fProps} />

      {/* แถบสรุป — กดเพื่อกระโดดไปช่วงนั้น (แทนการ์ดแคมเปญเดิมที่เลขไม่ตรงตัวกรอง) */}
      {shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[13px] font-semibold">ค้างอยู่ <span className="num">{open}</span> งาน</span>
          <span className="h-5 w-px bg-[var(--line)] mx-1" />
          {shown.map(b => (
            <a key={b.id} href={`#tl-${b.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium hover:bg-muted/40 transition-colors"
              style={{ borderColor: 'var(--line)', color: 'var(--ink-3)' }}>
              <span className="size-2 rounded-full" style={{ background: b.color }} />{b.label} <b className="num">{b.items.length}</b>
            </a>
          ))}
          {!readOnly && <Button size="sm" className="ml-auto h-8" onClick={() => openModal('task', { ...newTaskBase })}><Icon name="plus" className="size-4 mr-1" /> เพิ่มงาน</Button>}
        </div>
      )}

      {shown.length === 0 && (
        <Card className="p-6"><EmptyState icon="search" title="ไม่พบงานตามเงื่อนไข" hint="ลองล้างตัวกรอง หรือเพิ่มงานใหม่ในโครงการนี้" /></Card>
      )}

      <div className="flex flex-col gap-4">
        {shown.map(b => {
          const isDoneGroup = b.id === 'done';
          const folded = isDoneGroup && foldDone;
          return (
            <Card key={b.id} id={`tl-${b.id}`} className="p-0 overflow-hidden" style={{ scrollMarginTop: 80 }}>
              <button type="button" disabled={!isDoneGroup} onClick={() => setFoldDone(v => !v)} aria-expanded={!folded}
                className={'w-full flex items-center gap-2 px-4 py-2.5 border-b text-left' + (isDoneGroup ? ' hover:bg-muted/30' : ' cursor-default')}
                style={{ background: `color-mix(in srgb, ${b.color} 7%, transparent)` }}>
                {isDoneGroup && <Icon name={folded ? 'chevR' : 'chevD'} className="size-3.5 opacity-60 shrink-0" />}
                <span className="size-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                <span className="font-bold text-sm" style={{ color: b.color }}>{b.label}</span>
                <Badge variant="secondary">{b.items.length}</Badge>
                {b.hint && <span className="text-[11px] text-muted-foreground hidden sm:inline">{b.hint}</span>}
              </button>
              {!folded && (
                <div className="p-3 flex flex-col gap-2">
                  {b.items.map(t => {
                    const d = dueInfo(t, today, doneIds);
                    return (
                      <div key={t.id} className="flex items-start gap-3">
                        {/* รางวัน — วันครบกำหนดจริงของงาน (ไม่มี = ขีด) */}
                        <div className="shrink-0 w-[86px] pt-2 text-right">
                          <div className="text-[12px] font-semibold tabular-nums" style={{ color: d.state === 'overdue' ? 'var(--bad)' : 'var(--ink-2)' }}>{d.iso ? thaiDate(d.iso) : '—'}</div>
                          {d.state === 'overdue' && <div className="text-[10px]" style={{ color: 'var(--bad)' }}>เลย {Math.abs(d.diff)} วัน</div>}
                          {d.state === 'today' && <div className="text-[10px]" style={{ color: 'var(--accent-2)' }}>วันนี้</div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <TaskCard task={t} showFlow={!flow} readOnly={readOnly} hideDate={!t.dateEnd} onClick={() => openTask(t)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
