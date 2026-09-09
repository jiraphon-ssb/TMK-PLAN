/* ============================================================
   taskCard.jsx — การ์ดงาน (TaskCard) + channel/priority helper (PART 84 REFACTOR-1)
   ============================================================
   reusable component ใช้ร่วม views-planner/views-flows/views-mytasks · leaf module (เลี่ยง cycle)
   ============================================================ */
import { Icon, Avatar } from './components.jsx';
import { todayISO, thaiDate } from './lib/dateUtils.js';
import { colorForTask, colorSourceOf } from './lib/taskColor.js';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { DD, onCardKey, _isoToDate, _dateToIso } from './saleWidgets.jsx';

/* ---- Channel → platform icon (ใช้ร่วม Calendar / Kanban / Timeline) ---- */
const CHANNEL_ALIASES = {
  shopee: ['shopee'],
  tiktok: ['tiktok', 'tt'],
  lazada: ['lazada', 'laz'],
  facebook: ['facebook', 'fb post', 'fb'],
  line: ['line broadcast', 'line oa', 'line/fb', 'line'],
  crm: ['crm'],
};
function chInfo(ch) {
  if (!ch) return null;
  const text = String(ch).toLowerCase();
  let matched = null;
  for (const c of (DD.channels || [])) {
    const cId = String(c.id || '').toLowerCase();
    const cName = String(c.name || '').toLowerCase();
    const aliases = CHANNEL_ALIASES[cId] || [cId, cName];
    if (aliases.some(a => a && text.includes(a))) { matched = c; break; }
  }
  if (matched && matched.logoUrl) {
    return { color: matched.hex || '#888', bg: matched.hex || '#888', logoUrl: matched.logoUrl,
      icon: (s) => <img src={matched.logoUrl} alt="" style={{ width: s, height: s, objectFit: 'contain' }} /> };
  }
  const l = text;
  if (l.includes('shopee')) return { color: '#ee4d2d', bg: '#ee4d2d', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path fill="#fff" d="M12 2C9.2 2 7.3 4.1 7.1 6.6c-.1.6.4 1 .9 1h8c.5 0 1-.4.9-1C16.7 4.1 14.8 2 12 2zm-6.9 7c-.5 0-1 .4-1 1l1.2 10c.1.8.7 1.4 1.5 1.4h10.4c.8 0 1.4-.6 1.5-1.4l1.2-10c0-.6-.4-1-1-1H5.1z"/></svg> };
  if (l.includes('tiktok')) return { color: '#000', bg: '#00f2ea', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path fill="#000" d="M16.6 5.8A4.3 4.3 0 0 1 13.4 2h-3v13.4a2.6 2.6 0 1 1-1.8-2.4V9.6a6 6 0 1 0 5.2 6V9.4a7.3 7.3 0 0 0 4.2 1.3V7.3a4.3 4.3 0 0 1-1.4-1.5z"/></svg> };
  if (l.includes('lazada')) return { color: '#0f1689', bg: '#0f1689', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path fill="#fff" d="M3 5h18v14H3V5zm2 2v10h14V7H5zm3 2h8v2H8V9zm0 4h5v2H8v-2z"/></svg> };
  if (l.includes('fb') || l.includes('facebook')) return { color: '#1877f2', bg: '#1877f2', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path fill="#fff" d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.1 8.4 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7C18.3 21.1 22 17 22 12z"/></svg> };
  if (l.includes('line')) return { color: '#06c755', bg: '#06c755', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path fill="#fff" d="M22 10.6c0-4.7-4.5-8.6-10-8.6S2 5.9 2 10.6c0 4.2 3.7 7.8 8.7 8.5.3.1.8.2.9.5.1.3.1.6 0 .9l-.1.8c0 .3-.2 1 .9.6 1-.5 5.6-3.3 7.6-5.6 1.4-1.5 2-3.1 2-4.7z"/></svg> };
  if (l.includes('crm')) return { color: '#c08a3e', bg: '#c08a3e', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path fill="#fff" d="M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5c0-2.3-4.7-3.5-7-3.5zm8 0c-.3 0-.6 0-1 .1 1.2.9 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z"/></svg> };
  if (l.includes('ทุก')) return { color: '#b07d33', bg: '#b07d33', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path fill="#fff" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> };
  // ไม่ตรงกับช่องทางจริงใน Supabase → ไม่มีไอคอน (แสดงเป็น "ไม่มี")
  return null;
}
export const tokenizeCh = (chVal) => (Array.isArray(chVal) ? chVal : String(chVal || '').split(',')).map(s => s.trim()).filter(Boolean);
export function matchedChannelsFor(chVal) {
  const seen = new Set(); const out = [];
  tokenizeCh(chVal).forEach(tok => {
    const info = chInfo(tok);
    if (!info) return;
    const key = info.logoUrl || info.bg || tok;
    if (seen.has(key)) return;
    seen.add(key); out.push({ info, label: tok });
  });
  return out;
}
export function ChIcon({ info, size = 16 }) {
  return info.logoUrl
    ? <img src={info.logoUrl} alt="" style={{ width: size, height: size, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }} />
    : <span style={{ width: size - 1, height: size - 1, borderRadius: 4, background: info.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{info.icon(Math.round(size * 0.6))}</span>;
}
// แสดงไอคอนช่องทางของงาน (fallback เป็นข้อความถ้า map ไม่ได้)
function TaskChannels({ channel, size = 16 }) {
  const m = matchedChannelsFor(channel);
  if (!m.length) return <span className="cap" style={{ color: 'var(--ink-4)' }}>ไม่มี</span>;
  return <span className="row" style={{ gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>{m.map((x, i) => <span key={i} title={x.label} style={{ display: 'inline-flex' }}><ChIcon info={x.info} size={size} /></span>)}</span>;
}

/* ---- TaskCard: การ์ดงานใช้ซ้ำ (shadcn Card) — Kanban / My Tasks / read-only share ----
   props: task · onClick · draggable+onDragStart/onDragEnd · statusColumns+onStatusChange (มือถือ) · readOnly · showFlow (ชิปโครงการ) */
export function TaskCard({ task: t, onClick, draggable, onDragStart, onDragEnd, statusColumns, onStatusChange, readOnly, showFlow, hideDate }) {
  const c = DD.campaigns.find(x => x.id === t.camp) || null;
  const taskFlow = (DD.flows || []).find(fl => (fl.scopeId ?? fl.id ?? '') === (t.flow || '')) || null;
  const flowChip = showFlow ? (taskFlow || (t.flow ? null : { name: 'งานทั่วไป', color: 'var(--ink-3)' })) : null;
  // แบรนด์ของ "งาน" เอง (เลือกในงาน · ไม่ใช่ของโครงการ) → งานไม่มีแบรนด์ = ไม่โชว์
  const taskBrands = ((t.brandIds) || []).map(bid => (DD.brands || []).find(b => b.id === bid)).filter(Boolean).slice(0, 2);
  const clickable = !readOnly && !!onClick;
  // เช็คลิสต์ (E1) + แจ้งเตือนครบกำหนด (E3) — คำนวณ client จาก dateEnd/reminderDays
  const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
  const subDone = subs.filter(s => s.done).length;
  const dueISO = t.dateEnd || t.dateISO || '';
  const dueState = (() => {
    if (!dueISO || t.status === 'done') return null;
    const today = todayISO();
    if (dueISO < today) return 'overdue';
    const days = Math.round((new Date(dueISO) - new Date(today)) / 86400000);
    return (days >= 0 && days <= (t.reminderDays || 1)) ? 'soon' : null;
  })();
  // หัวการ์ด = ชุดชิป: โครงการ(เมื่อ showFlow) + แคมเปญ + แบรนด์ของงาน · ไม่มีเลย & ไม่ showFlow → แท็กแรก
  // → งานของฉัน (showFlow): โครงการ + แคมเปญ/แบรนด์ที่มีในงานเท่านั้น
  const headerChips = [];
  if (flowChip) headerChips.push({ kind: 'flow', name: flowChip.name, color: flowChip.color || 'var(--ink-3)' });
  if (c) headerChips.push({ kind: 'camp', name: c.name, color: c.color || '#6b5ce0' });
  taskBrands.forEach(b => headerChips.push({ kind: 'brand', name: b.name, color: b.color || '#6b5ce0', logoUrl: b.logoUrl }));
  if (!headerChips.length && !showFlow && (t.tags || [])[0]) headerChips.push({ kind: 'tag', name: t.tags[0], color: '#6b5ce0' });
  const assignees = t.responsible || [];
  const dateLabel = t.date + (t.dateEnd && t.dateEnd !== t.dateISO ? ' → ' + thaiDate(t.dateEnd) : '');
  const hasChannel = Array.isArray(t.channel) ? t.channel.length > 0 : !!String(t.channel || '').trim();
  const avatarEl = assignees.length > 0 ? (
    <div className="flex items-center shrink-0">
      {assignees.slice(0, 3).map((r, i) => { const s = DD.staff.find(x => x.name === r) || { color: 'var(--ink-3)' }; return <span key={r} className="rounded-lg ring-2 ring-card" style={{ marginLeft: i ? -6 : 0 }}><Avatar name={r} color={s.color} size={22} /></span>; })}
      {assignees.length > 3 && <span className="text-[10px] text-muted-foreground pl-1">+{assignees.length - 3}</span>}
    </div>
  ) : null;
  return (
    <Card draggable={!!draggable && !readOnly} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined} onKeyDown={clickable ? onCardKey : undefined}
      onDragStart={draggable && !readOnly ? onDragStart : undefined}
      onDragEnd={draggable && !readOnly ? onDragEnd : undefined}
      onClick={clickable ? onClick : undefined}
      className="p-3" style={{ borderRadius: 'var(--r)', cursor: readOnly ? 'default' : (draggable ? 'grab' : (onClick ? 'pointer' : 'default')), boxShadow: 'var(--sh-sm)', padding: '12px 14px', borderLeft: `3px solid ${dueState === 'overdue' ? 'var(--bad)' : colorForTask(t, colorSourceOf(taskFlow), 'var(--line)')}` }}>
      {/* หัว: มีชิป → แถวชิป(โครงการ/แคมเปญ/แบรนด์)+avatar แล้วค่อยชื่อ · ไม่มีชิป → ชื่อ+avatar บรรทัดเดียว */}
      {headerChips.length ? (
        <>
          <div className="row between" style={{ gap: 6, alignItems: 'flex-start', marginBottom: 6 }}>
            <div className="flex items-center gap-1 min-w-0 flex-wrap">
              {headerChips.map((h, i) => h.kind === 'brand'
                ? <span key={'b' + i} title={`แบรนด์: ${h.name}`} className="text-[11px] font-semibold pl-1 pr-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0 border" style={{ borderColor: h.color + '66', background: h.color + '14', color: h.color }}>
                    {h.logoUrl
                      ? <img src={h.logoUrl} alt="" className="size-4 rounded-full object-contain bg-white shrink-0 ring-1" style={{ '--tw-ring-color': h.color + '40' }} />
                      : <span className="size-4 rounded-full shrink-0 inline-flex items-center justify-center text-white text-[9px] font-bold" style={{ background: h.color }}>{(h.name || '?').slice(0, 1).toUpperCase()}</span>}
                    <span className="truncate max-w-[92px]">{h.name}</span>
                  </span>
                : <span key={'c' + i} className="text-[11px] font-medium px-2 py-0.5 rounded-md inline-flex items-center gap-1.5 shrink-0" style={{ background: h.color + '1f', color: h.color, maxWidth: 168 }}><span className="size-1.5 rounded-full shrink-0" style={{ background: h.color }} /><span className="truncate">{h.name}</span></span>
              )}
            </div>
            {avatarEl}
          </div>
          <div className="sm" style={{ fontWeight: 600, lineHeight: 1.35 }}>{t.title}</div>
        </>
      ) : (
        <div className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
          <div className="sm" style={{ fontWeight: 600, lineHeight: 1.35, flex: 1, minWidth: 0 }}>{t.title}</div>
          {avatarEl}
        </div>
      )}
      {/* meta: วันที่ + เลยกำหนด/ใกล้ครบ + เช็คลิสต์ + ความสำคัญ */}
      <div className="row wrap" style={{ gap: 6, alignItems: 'center', marginTop: 7 }}>
        {!hideDate && <span className="cap inline-flex items-center gap-1"><Icon name="calendarDays" className="size-3.5" />{dateLabel}</span>}
        {dueState === 'overdue' && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-500/15 text-red-600 dark:text-red-400">เลยกำหนด</span>}
        {dueState === 'soon' && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">ใกล้ครบ</span>}
        {subs.length > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 ${subDone === subs.length ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}><Icon name="listChecks" className="size-3" />{subDone}/{subs.length}</span>}
        {t.priority && t.priority !== 'medium' && <PriorityTag value={t.priority} />}
      </div>
      {/* แท็ก */}
      {(t.tags || []).length > 0 && <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>{t.tags.slice(0, 4).map(tg => <span key={tg} className="text-[10px] px-1.5 rounded-full bg-muted text-muted-foreground">{tg}</span>)}</div>}
      {/* ล่าง: ช่องทาง (ซ้าย) + จำนวนคอมเมนต์ (ขวา) */}
      {(hasChannel || t.commentCount > 0) && (
        <div className="row" style={{ gap: 6, alignItems: 'center', marginTop: 8 }}>
          {hasChannel && <TaskChannels channel={t.channel} size={16} />}
          {t.commentCount > 0 && <span className="cap inline-flex items-center gap-1" style={{ marginLeft: 'auto' }} title={`${t.commentCount} ความคิดเห็น`}><Icon name="chat" className="size-3.5" />{t.commentCount}</span>}
        </div>
      )}
      {/* ทางเลือกแทนการลาก (WCAG 2.2 · dragging movements) — เมนู "ย้าย" ใช้ได้ทั้งเมาส์/คีย์บอร์ด/มือถือ
          เดิมเป็น <select> ที่โผล่เฉพาะจอเล็ก → เดสก์ท็อปย้ายได้ทางลากอย่างเดียว */}
      {statusColumns && onStatusChange && !readOnly && (
        <div className="mt-2 flex" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`ย้ายสถานะงาน ${t.title}`} title="ย้ายสถานะงาน"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                style={{ borderColor: 'var(--line)' }}>
                <Icon name="arrowR" className="size-3" /> ย้าย
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-40">
              {statusColumns.map(k => (
                <DropdownMenuItem key={k.id} disabled={k.id === t.status} onSelect={() => onStatusChange(t.id, k.id)} className="gap-2">
                  <span className="size-2 rounded-full shrink-0" style={{ background: k.color || 'var(--ink-3)' }} />
                  <span className="flex-1 truncate">{k.label}</span>
                  {k.id === t.status && <Icon name="check" className="size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </Card>
  );
}

const PRIORITY_META = { high: { label: 'สูง', color: '#cf4d5c', bg: 'rgba(207,77,92,0.12)' }, medium: { label: 'กลาง', color: '#c08a3e', bg: 'rgba(192,138,62,0.12)' }, low: { label: 'ต่ำ', color: '#64748b', bg: 'rgba(100,116,139,0.12)' } };
export function PriorityTag({ value }) {
  const m = PRIORITY_META[value] || PRIORITY_META.medium;
  return <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums" style={{ color: m.color, background: m.bg }}><span className="size-1.5 rounded-full" style={{ background: m.color }} />{m.label}</span>;
}
