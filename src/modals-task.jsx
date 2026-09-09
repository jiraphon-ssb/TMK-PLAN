import { useState, useEffect, useMemo, useRef } from 'react';
import { Icon, FlowIcon } from './components.jsx';
import { DatePicker } from '@/components/ui/date-picker';
import { supabase } from './lib/supabaseClient.js';
import { rtDiag } from './realtime/diagnostics.js';
import { reduceCommentList } from './lib/commentThread.js';
import { renderCommentHtml } from './lib/commentHtml.js';
import { parseTaskDate, todayISO, thaiDate } from './lib/dateUtils.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import { Checkbox } from '@/components/ui/checkbox';
import { logAudit } from './lib/audit.js';
import { Modal, guardClose, uid, MD } from './modals-core.jsx';
import { toast, confirm, setFlow as appSetFlow, goSection, userEmail } from './lib/appBus.js';

// การ์ดส่วนฟอร์ม (หัวไอคอน + กรอบขาว + shadow) — ให้ลุคเหมือน popup ออเดอร์ (FormSection) · PART 81.7
function Section({ icon, title, children, className = '' }) {
  return (
    <div className={'rounded-xl border shadow-sm p-3.5 ' + className} style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid place-items-center rounded-lg size-7" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', flex: 'none' }}><Icon name={icon} className="size-4" /></span>
        <span className="text-[13px] font-bold">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ปุ่มแถบเครื่องมือของ composer คอมเมนต์ — ประกาศระดับโมดูล (เดิมนิยามในตัว TaskComments → remount ทุก render)
function TBtn({ onClick, title, children }) {
  return <button type="button" onMouseDown={e => e.preventDefault()} onClick={onClick} title={title} className="size-7 grid place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground text-sm">{children}</button>;
}

function TaskField({ icon, label, children, wide = false }) {
  return (
    <div className={`grid grid-cols-[104px_1fr] items-start gap-3 py-2.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground pt-2"><Icon name={icon} className="size-4 shrink-0" />{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TaskModal({ data, onClose, onSubmit, onDelete }) {
  const edit = !!data?.id; // มี id = แก้ไขจริง; ส่งแค่ {date} = งานใหม่ที่เลือกวันไว้
  // แตกค่าที่อาจเป็น string คั่น comma (หรือ array ที่มีสมาชิกเป็น comma-string) → array สะอาด
  const splitToArr = v => (Array.isArray(v) ? v : [v])
    .flatMap(x => String(x || '').split(','))
    .map(s => s.trim())
    .filter(Boolean);
  const [f, setF] = useState(() => {
    // วันที่เก็บเป็น ISO (YYYY-MM-DD) เพื่อใช้กับปฏิทิน <input type="date">
    // ใช้ dateISO เต็ม (กันปีหายตอนแก้งานข้ามปี); fallback parse จากไทย/ค่าที่ส่งมา
    const isoDate = data?.dateISO || (data?.date ? (parseTaskDate(data.date) || data.date) : todayISO());
    const flow_id = data?.flow_id ?? data?.flow ?? '';
    // งานใหม่: รับค่า prefill ให้ครบ (ปุ่ม "สร้างงานติดตาม" ของ CRM ส่ง แท็กผูกลูกค้า/ความสำคัญ/ช่องทาง/ผู้รับผิดชอบ มาด้วย)
    // เดิมรับแค่ title/detail/date แล้วทิ้งที่เหลือ → งานที่สร้างไม่รู้ว่าเป็นของลูกค้าคนไหน (PART 111)
    if (!data?.id) return {
      title: data?.title || '', detail: data?.detail || '', date: isoDate, dateEnd: data?.dateEnd || '',
      responsible: splitToArr(data?.responsible), channel: splitToArr(data?.channel),
      camp: data?.camp || '', brandIds: Array.isArray(data?.brandIds) ? data.brandIds : [],
      status: data?.status || 'todo', flow_id, priority: data?.priority || 'medium',
      tags: Array.isArray(data?.tags) ? data.tags : [], subtasks: [],
    };
    const validNames = new Set((MD.channels || []).map(c => c.name));
    const chanPieces = splitToArr(data.channel);
    // เก็บเฉพาะช่องทางที่มีจริงในระบบ — ตัดข้อความอิสระเก่า (เช่น "FB Post") ที่ map ไม่ได้ทิ้ง
    const channel = chanPieces.filter(c => validNames.has(c));
    return { ...data, date: isoDate, dateEnd: data.dateEnd || data.date_end || '', responsible: splitToArr(data.responsible), channel, flow_id, priority: data.priority || 'medium', tags: Array.isArray(data.tags) ? data.tags : [], subtasks: Array.isArray(data.subtasks) ? data.subtasks : [], brandIds: Array.isArray(data.brandIds) ? data.brandIds : (Array.isArray(data.brand_ids) ? data.brand_ids : []) };
  });
  const [tagInput, setTagInput] = useState('');
  const [subInput, setSubInput] = useState(''); // ช่องเพิ่มงานย่อย (เช็คลิสต์)
  const [commentsOk, setCommentsOk] = useState(true); // คอมเมนต์ใช้ได้ไหม (false=ตารางยังไม่ migrate → ยุบเป็นคอลัมน์เดียว ไม่โชว์แผงว่าง)
  const twoCol = !!data?.id && commentsOk; // edit + คอมเมนต์พร้อม → เลย์เอาต์ 2 คอลัมน์ (รายละเอียดซ้าย · คอมเมนต์ขวา)
  // โครงการที่งานสังกัด — จำกัดแคมเปญ/สถานะตามที่โครงการนั้นตั้งไว้ ("งานทั่วไป" = config row __general__)
  const flowOptions = (MD.flows || []).filter(fl => fl.id !== '__general__');
  const genCfg = (MD.flows || []).find(fl => fl.id === '__general__');
  const curFlow = f.flow_id ? flowOptions.find(fl => fl.id === f.flow_id) : genCfg;
  // strict "project-members": ฟอร์มงานโชว์เฉพาะ "สมาชิก/แคมเปญที่ติ๊กในโครงการ" เท่านั้น
  // (+ ค่าที่งานนี้เลือกไว้แล้วแต่ไม่อยู่ในรายการ = โชว์ไว้ถอดได้ กัน assignee/แคมเปญเดิมหายเงียบ)
  const colorOfMember = (name) => (MD.duties || []).find(d => d.name === name)?.color || (MD.staff || []).find(s => s.name === name)?.color || 'var(--ink-3)';
  const memberNames = Array.isArray(curFlow?.members) ? curFlow.members : [];
  const respExtras = (f.responsible || []).filter(n => n && !memberNames.includes(n));
  const respOptions = [...memberNames, ...respExtras].map(n => ({ name: n, color: colorOfMember(n), extra: !memberNames.includes(n) }));
  const flowCampIds = Array.isArray(curFlow?.campaignIds) ? curFlow.campaignIds : [];
  const campIdList = [...flowCampIds, ...((f.camp && !flowCampIds.includes(f.camp)) ? [f.camp] : [])];
  const campChoices = campIdList.map(id => (MD.campaigns || []).find(c => c.id === id)).filter(Boolean);
  // แบรนด์ของงาน — เลือกหลายอันจากแบรนด์ของโครงการ (+ คงค่าเดิมที่ไม่อยู่ในโครงการแล้ว) · chips toggle
  const flowBrandIds = Array.isArray(curFlow?.brandIds) ? curFlow.brandIds : [];
  const brandIdList = [...flowBrandIds, ...((f.brandIds || []).filter(b => !flowBrandIds.includes(b)))];
  const brandChoices = brandIdList.map(id => (MD.brands || []).find(b => b.id === id)).filter(Boolean);
  const toggleBrand = (id) => set('brandIds', (f.brandIds || []).includes(id) ? f.brandIds.filter(x => x !== id) : [...(f.brandIds || []), id]);
  const statusChoices = (curFlow?.statuses?.length) ? curFlow.statuses : (MD.kanbanMeta || []);
  const goFlowSettings = () => { if (curFlow?.id && curFlow.id !== '__general__') { try { localStorage.setItem('tmk-flow', curFlow.id); } catch { /* ignore */ } appSetFlow(curFlow.id); } goSection('flows', 'settings'); };
  const [touched, setTouched] = useState(false);
  const set = (k, v) => { setTouched(true); setF(p => ({ ...p, [k]: v })); };
  const toggle = (k, v) => { setTouched(true); setF(p => {
    const arr = Array.isArray(p[k]) ? p[k] : splitToArr(p[k]);
    return { ...p, [k]: arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v] };
  }); };
  const valid = f.title.trim();
  const [tryEmpty, setTryEmpty] = useState(false); // กดบันทึกทั้งที่ยังไม่ใส่ชื่อ → ขึ้นข้อความใต้ช่อง (เดิมปุ่มจางเฉยๆ ไม่บอกว่าทำไม)
  const [submitting, setSubmitting] = useState(false); // กันกดบันทึกซ้ำ → งานซ้ำ
  const taskId = useMemo(() => data?.id || uid('tn'), [data?.id]); // id เดียวต่อการเปิดฟอร์ม (กดซ้ำไม่ได้ id ใหม่)
  const close = () => guardClose(touched, onClose);
  const submit = () => { if (!valid) { setTryEmpty(true); return; } if (submitting) return; setSubmitting(true); onSubmit({ ...f, id: taskId }); };
  // คีย์ลัด: Cmd/Ctrl + Enter = บันทึก (พิมพ์เสร็จไม่ต้องลากเมาส์ไปปุ่ม)
  /* Cmd/Ctrl+Enter = บันทึกงาน — แต่ต้องไม่ยิงเมื่อคีย์ลัดนั้นถูกใช้ในช่องย่อยอยู่แล้ว
     (กล่องคอมเมนต์/ช่องแท็ก/ช่องงานย่อย ใช้ Enter เป็น "ส่ง/เพิ่ม" และไม่ได้ stopPropagation)
     เดิม: พิมพ์คอมเมนต์แล้วกด Cmd+Enter → คอมเมนต์ถูกส่ง "และ" งานถูกบันทึก+ปิด popup ไปเลย */
  const inSubField = (el) => !!(el && typeof el.closest === 'function' && el.closest('[data-no-form-submit]'));
  const onKeyDownForm = (e) => {
    if (!((e.metaKey || e.ctrlKey) && e.key === 'Enter')) return;
    if (inSubField(e.target)) return;
    e.preventDefault(); submit();
  };
  // ปุ่มวันด่วน — งานส่วนใหญ่กำหนดเป็นวันนี้/พรุ่งนี้/สัปดาห์หน้า
  const shiftDays = (n) => { const d = new Date(todayISO() + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const doDelete = async () => { if (!(edit && onDelete)) return; if (await confirm({ title: 'ลบงาน', body: `ลบงาน "${data.title}"?\nงานจะถูกย้ายไปถังขยะ (กู้คืนได้)`, danger: true, confirmText: 'ลบ' })) onDelete(data); };
  const flowObj = f.flow_id ? flowOptions.find(fl => fl.id === f.flow_id) : genCfg;
  const setFlow = (v) => {
    const nv = v === '__general' ? '' : v;
    setTouched(true);
    setF(p => {
      const nf = nv ? flowOptions.find(fl => fl.id === nv) : genCfg;
      const camps = nf?.campaignIds?.length ? nf.campaignIds : null;
      const sts = nf?.statuses?.length ? nf.statuses.map(s => s.id) : null;
      const brs = nf?.brandIds?.length ? nf.brandIds : null; // โครงการใหม่กำหนดแบรนด์ → คงเฉพาะที่อยู่ในโครงการใหม่ (กันแบรนด์โครงการเก่าติดไป)
      return { ...p, flow_id: nv, camp: (camps && !camps.includes(p.camp)) ? '' : p.camp, status: (sts && !sts.includes(p.status)) ? sts[0] : p.status, brandIds: (brs && Array.isArray(p.brandIds)) ? p.brandIds.filter(b => brs.includes(b)) : p.brandIds };
    });
  };
  // popup (Relay-style field grid · เปิดจากทุกวิว) — ปุ่มอยู่ฝั่งซ้าย (รายละเอียด) ปักล่าง
  return (
    <Modal hideHeader xl={twoCol} wide={!twoCol} onClose={onClose} confirmOnClose={touched}
      title={edit ? 'แก้ไขงาน' : 'งานใหม่'}
      footer={<>
        {edit && onDelete
          ? <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 mr-auto" onClick={doDelete}><Icon name="trash" className="size-4 mr-1" /> ลบงาน</Button>
          : <span className="mr-auto" />}
        <Button variant="outline" size="sm" onClick={close}>ยกเลิก</Button>
        <Button size="sm" disabled={submitting} onClick={submit} title="Cmd/Ctrl + Enter"><Icon name="check" className="size-4 mr-1" /> {submitting ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
      </>}>
      <div onKeyDown={onKeyDownForm} className={twoCol ? 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_372px] gap-5 lg:gap-0 items-start' : 'flex flex-col gap-4'}>
        <div className="flex flex-col min-w-0">
          <div className={'flex flex-col gap-4' + (twoCol ? ' lg:pr-6' : '')}>
        {/* ชื่องาน + โครงการที่สังกัด (breadcrumb เล็ก) */}
        <div className="flex flex-col gap-1 pr-8">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FlowIcon icon={flowObj?.icon} className="size-3.5" /><span className="truncate">{flowObj?.name || 'งานทั่วไป'}</span>
            <Icon name="chevR" className="size-3 opacity-50" /><span>{edit ? 'แก้ไขงาน' : 'งานใหม่'}</span>
          </div>
          <Input value={f.title} onChange={e => { set('title', e.target.value); if (tryEmpty) setTryEmpty(false); }} placeholder="ตั้งชื่องาน…" autoFocus={!edit}
            aria-invalid={tryEmpty && !valid} aria-describedby={tryEmpty && !valid ? 'task-title-err' : undefined}
            className="border-0 px-0 shadow-none text-xl sm:text-2xl font-bold h-auto py-1 focus-visible:ring-0 placeholder:text-muted-foreground/40" />
          {tryEmpty && !valid && <div id="task-title-err" role="alert" className="text-xs" style={{ color: 'var(--bad)' }}>ใส่ชื่องานก่อนถึงจะบันทึกได้</div>}
        </div>

        {/* การ์ดฟิลด์ทรง FormSection เหมือน popup ออเดอร์ — กลุ่ม "รายละเอียดงาน" + "กำหนดการ & ทีม" */}
        <Section icon="listChecks" title="รายละเอียดงาน">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          <TaskField icon="circle" label="สถานะ">
            <Select value={f.status} onValueChange={v => set('status', v)}>
              <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{statusChoices.map(k => <SelectItem key={k.id} value={k.id}><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: k.color || '#94a3b8' }} />{k.label}</span></SelectItem>)}</SelectContent>
            </Select>
          </TaskField>
          <TaskField icon="target" label="ความสำคัญ">
            <Select value={f.priority || 'medium'} onValueChange={v => set('priority', v)}>
              <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="high"><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: '#cf4d5c' }} />สูง</span></SelectItem>
                <SelectItem value="medium"><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: '#c08a3e' }} />กลาง</span></SelectItem>
                <SelectItem value="low"><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: '#64748b' }} />ต่ำ</span></SelectItem>
              </SelectContent>
            </Select>
          </TaskField>
          <TaskField icon="grid" label="โครงการ">
            <Select value={f.flow_id || '__general'} onValueChange={setFlow}>
              <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__general"><span className="inline-flex items-center gap-2"><FlowIcon icon={genCfg?.icon || 'Inbox'} className="size-4" />{genCfg?.name || 'งานทั่วไป'}</span></SelectItem>
                {flowOptions.map(fl => <SelectItem key={fl.id} value={fl.id}><span className="inline-flex items-center gap-2"><FlowIcon icon={fl.icon} className="size-4" />{fl.name}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </TaskField>
          <TaskField icon="megaphone" label="แคมเปญ">
            {campChoices.length === 0 ? (
              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground h-9">
                โครงการนี้ยังไม่มีแคมเปญ
                <button type="button" className="text-primary underline" onClick={goFlowSettings}>+ เพิ่มแคมเปญ</button>
              </div>
            ) : (
              <Select value={f.camp || undefined} onValueChange={v => set('camp', v)}>
                <SelectTrigger className="h-9 w-full"><SelectValue placeholder="— ยังไม่ได้เลือก —" /></SelectTrigger>
                <SelectContent>{campChoices.map(c => <SelectItem key={c.id} value={c.id}><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: c.color }} />{c.name}</span></SelectItem>)}</SelectContent>
              </Select>
            )}
          </TaskField>
          <TaskField icon="tag" label="แบรนด์" wide>
            {brandChoices.length === 0 ? (
              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground min-h-9 items-center">
                โครงการนี้ยังไม่มีแบรนด์
                <button type="button" className="text-primary underline" onClick={goFlowSettings}>+ จัดการแบรนด์</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {brandChoices.map(b => {
                  const on = (f.brandIds || []).includes(b.id);
                  return (
                    <button type="button" key={b.id} onClick={() => toggleBrand(b.id)}
                      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-medium transition-colors"
                      style={on ? { background: (b.color || '#6b5ce0') + '1f', borderColor: (b.color || '#6b5ce0') + '88', color: b.color || 'var(--ink)' } : { borderColor: 'var(--line)', color: 'var(--ink-3)' }}>
                      <span className="size-2 rounded-full shrink-0" style={{ background: b.color || '#6b5ce0' }} />{b.name}
                    </button>
                  );
                })}
              </div>
            )}
          </TaskField>
        </div>
        </Section>
        <Section icon="calendarDays" title="กำหนดการ & ทีม">
        <div className="grid grid-cols-1 gap-y-1">
          <TaskField icon="calendarDays" label="วันที่" wide>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <DatePicker value={f.date} onChange={(v) => set('date', v)} clearable={false} className="w-40" />
                <Icon name="arrowR" className="size-4 text-muted-foreground shrink-0" />
                <DatePicker value={f.dateEnd || ''} min={f.date} placeholder="วันสิ้นสุด" onChange={(v) => set('dateEnd', v)} className="w-40" />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[['วันนี้', 0], ['พรุ่งนี้', 1], ['+7 วัน', 7]].map(([l, n]) => (
                  <button type="button" key={l} onClick={() => set('date', shiftDays(n))}
                    className="rounded-full border px-2.5 py-0.5 text-[11.5px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    style={{ borderColor: 'var(--line)' }}>{l}</button>
                ))}
                {f.dateEnd && <button type="button" onClick={() => set('dateEnd', '')} className="text-[11.5px] text-muted-foreground underline">ล้างวันสิ้นสุด</button>}
              </div>
            </div>
          </TaskField>
          <TaskField icon="users" label="ผู้รับผิดชอบ" wide>
            {respOptions.length === 0 ? (
              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground py-1">
                ยังไม่มีสมาชิกในโครงการนี้
                <button type="button" className="text-primary underline" onClick={goFlowSettings}>+ เพิ่มสมาชิก</button>
              </div>
            ) : (
              <div className="chips-pick">
                {respOptions.map(st => (
                  <Toggle key={st.name} variant="pill" size="sm" pressed={f.responsible.includes(st.name)} onPressedChange={() => toggle('responsible', st.name)}
                    title={st.extra ? 'ไม่อยู่ในสมาชิกโครงการ — คลิกเพื่อเอาออก' : undefined}>
                    <span className="dot-c" style={{ background: st.color }}></span>{st.name}{st.extra && <span style={{ marginLeft: 3, opacity: 0.45 }}>·</span>}
                  </Toggle>
                ))}
              </div>
            )}
          </TaskField>
          <TaskField icon="star" label="แท็ก" wide>
            <div className="chips-pick" style={{ alignItems: 'center' }}>
              {(f.tags || []).map(tg => (
                <Toggle key={tg} variant="pill" size="sm" pressed onPressedChange={() => set('tags', (f.tags || []).filter(x => x !== tg))} title="คลิกเพื่อลบ">{tg} <span style={{ marginLeft: 4, opacity: 0.6 }}>✕</span></Toggle>
              ))}
              <Input data-no-form-submit value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="เพิ่มแท็ก + Enter"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = tagInput.trim(); if (v && !(f.tags || []).includes(v)) set('tags', [...(f.tags || []), v]); setTagInput(''); } }}
                className="w-40 h-8" />
            </div>
          </TaskField>
          <TaskField icon="layers" label="ช่องทาง" wide>
            <div className="chips-pick">
              <Toggle variant="pill" size="sm" pressed={f.channel.length === 0} onPressedChange={() => set('channel', [])}><span className="dot-c" style={{ background: 'var(--ink-4)' }}></span>ไม่มี</Toggle>
              {(MD.channels || []).map(ch => (
                <Toggle key={ch.id} variant="pill" size="sm" pressed={f.channel.includes(ch.name)} onPressedChange={() => toggle('channel', ch.name)}>
                  {ch.logoUrl ? <img src={ch.logoUrl} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'contain', marginRight: 4 }} /> : <span className="dot-c" style={{ background: ch.hex }}></span>}{ch.name}
                </Toggle>
              ))}
            </div>
          </TaskField>
        </div>
        </Section>

        {/* รายละเอียด */}
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-medium text-muted-foreground flex items-center gap-2"><Icon name="pencil" className="size-4" /> รายละเอียด / Context</div>
          <Textarea value={f.detail} onChange={e => set('detail', e.target.value)} rows={6} placeholder="ระบุขั้นตอน / สิ่งที่ต้องส่ง / ที่มาของงาน…" className="resize-y" />
        </div>

        {/* เช็คลิสต์ / งานย่อย (E1) */}
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-medium text-muted-foreground flex items-center gap-2">
            <Icon name="listChecks" className="size-4" /> เช็คลิสต์
            {(f.subtasks || []).length > 0 && <span className="text-xs tabular-nums text-muted-foreground/80">({(f.subtasks || []).filter(s => s.done).length}/{(f.subtasks || []).length})</span>}
          </div>
          {(f.subtasks || []).length > 0 && (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((f.subtasks.filter(s => s.done).length / f.subtasks.length) * 100)}%` }} />
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {(f.subtasks || []).map(st => (
              <div key={st.id} className="flex items-center gap-2 group rounded-md px-1 py-0.5 hover:bg-muted/50">
                <Checkbox checked={!!st.done} onCheckedChange={() => set('subtasks', f.subtasks.map(x => x.id === st.id ? { ...x, done: !x.done } : x))} />
                <span className={`flex-1 text-sm ${st.done ? 'line-through text-muted-foreground' : ''}`}>{st.text}</span>
                <button type="button" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity" title="ลบงานย่อย" onClick={() => set('subtasks', f.subtasks.filter(x => x.id !== st.id))}><Icon name="trash" className="size-3.5" /></button>
              </div>
            ))}
          </div>
          <Input data-no-form-submit value={subInput} onChange={e => setSubInput(e.target.value)} placeholder="เพิ่มงานย่อย + Enter" className="h-8"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = subInput.trim(); if (v) set('subtasks', [...(f.subtasks || []), { id: uid('st'), text: v, done: false }]); setSubInput(''); } }} />
        </div>

        {/* คอมเมนต์ยังไม่พร้อม (ตารางยังไม่ถูกสร้าง) — บอกวิธีเปิดใช้ */}
        {edit && !commentsOk && (
          <div className="text-xs text-muted-foreground rounded-lg border border-dashed px-3 py-2 flex items-start gap-2">
            <Icon name="chat" className="size-4 shrink-0 mt-0.5" />
            <span>เปิดใช้ความคิดเห็น: รัน <code className="px-1 rounded bg-muted font-mono">20260731-task-comments.sql</code> ใน Supabase แล้วเปิดงานนี้ใหม่</span>
          </div>
        )}
        </div>{/* end scroll area */}
        </div>{/* end LEFT column */}

        {/* การพูดคุย — แผงด้านขวา (ฟีล ClickUp) · ฝั่งซ้ายแสดงเต็ม · composer ติดล่างตอนเลื่อน */}
        {edit && (
          <div className={twoCol ? 'flex flex-col border-t pt-4 lg:border-t-0 lg:pt-0 lg:border-l lg:pl-6' : 'hidden'}>
            <TaskComments taskId={taskId} flow={curFlow} onUnavailable={() => setCommentsOk(false)} />
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------- คอมเมนต์ในงาน (E2 · ฟีล ClickUp) — แผงขวา · realtime · markdown · @mention · แก้/ลบของตัวเอง ---------- */
// renderCommentHtml ย้ายไป ./lib/commentHtml.js (pure + testable + escape " ' กัน XSS)
function TaskComments({ taskId, flow, onUnavailable }) {
  const meEmail = userEmail();
  const [list, setList] = useState([]);
  const [body, setBody] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const [replyTo, setReplyTo] = useState(null);   // { id, author } กำลังตอบกลับ (เธรด)
  const [reactFor, setReactFor] = useState(null);  // id คอมเมนต์ที่เปิด popover อิโมจิ
  const [mentionActive, setMentionActive] = useState(false); // กำลังพิมพ์ @ → โชว์ dropdown
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const taRef = useRef(null);
  const scrollRef = useRef(null);
  const stickRef = useRef(true); // เลื่อนตามล่างสุดเฉพาะตอนผู้ใช้อยู่ใกล้ล่างอยู่แล้ว (กันคอมเมนต์คนอื่นเด้งกระชากจอ)
  const mentionedRef = useRef(new Set()); // ชื่อที่ถูก @ ในข้อความปัจจุบัน → ใช้ส่งแจ้งเตือนตอนโพสต์

  const loadComments = async () => {
    if (!supabase) return;
    // ลองดึงคอลัมน์ใหม่ (parent_id/reactions) ก่อน → ถ้ายังไม่ migrate (42703) fallback base (เธรด/รีแอกชันซ่อนเงียบ)
    let { data, error } = await supabase.from('tmk_task_comments').select('id,task_id,text,author,created_at,updated_at,parent_id,reactions').eq('task_id', taskId).order('created_at', { ascending: true });
    if (error && /(parent_id|reactions)/.test(error.message || '')) {
      ({ data, error } = await supabase.from('tmk_task_comments').select('id,task_id,text,author,created_at,updated_at').eq('task_id', taskId).order('created_at', { ascending: true }));
    }
    if (error) { setUnavailable(true); onUnavailable?.(); return; } // ตารางไม่พร้อม → ยุบเป็นคอลัมน์เดียว
    setList(Array.isArray(data) ? data : []);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดคอมเมนต์แบบ async (setState เกิดหลัง await) = pattern ปกติ
    loadComments();
    if (!supabase) return;
    let ch = null;
    try {
      let didSub = false;
      ch = supabase.channel('cmts-' + taskId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tmk_task_comments', filter: `task_id=eq.${taskId}` }, (payload) => {
          rtDiag.event('tmk_task_comments');
          setList(prev => reduceCommentList(prev, payload)); // Phase 1: patch comment เดียว ไม่ reload ทั้ง thread
        })
        .subscribe((status) => { if (status === 'SUBSCRIBED') { if (didSub) loadComments(); didSub = true; } }); // reconnect scoped resync
      rtDiag.channelOpen('cmts:' + taskId); // Phase 0 baseline (dev-only)
    } catch { /* ignore */ }
    return () => { if (ch) { rtDiag.channelClose('cmts:' + taskId); try { supabase.removeChannel(ch); } catch { /* ignore */ } } };
    // eslint-disable-next-line
  }, [taskId]);
  // ติดตามว่าผู้ใช้อยู่ใกล้ล่างสุดไหม (chat-style sticky scroll)
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const onScroll = () => { stickRef.current = (el.scrollHeight - el.scrollTop - el.clientHeight) < 80; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [unavailable]);
  useEffect(() => { const el = scrollRef.current; if (el && stickRef.current) el.scrollTop = el.scrollHeight; }, [list.length]);

  const staff = MD.staff || [];
  const nameOf = (email) => staff.find(s => s.email === email)?.name || (email || '').replace(/@.*/, '') || 'ไม่ระบุ';
  const colorOf = (email) => staff.find(s => s.email === email)?.color || 'var(--ink-3)';
  const initials = (email) => (nameOf(email) || '?').slice(0, 2).toUpperCase();
  const timeAgo = (iso) => {
    if (!iso) return '';
    // eslint-disable-next-line react-hooks/purity -- ป้าย "x นาทีที่แล้ว" ต้องอิงเวลาปัจจุบันตอน render (ย้ายไป effect = เวลาค้าง/เพี้ยน)
    const sec = (Date.now() - new Date(iso).getTime()) / 1000;
    if (sec < 60) return 'เมื่อสักครู่';
    if (sec < 3600) return Math.floor(sec / 60) + ' นาทีที่แล้ว';
    if (sec < 86400) return Math.floor(sec / 3600) + ' ชม.ที่แล้ว';
    return thaiDate(String(iso).slice(0, 10));
  };
  // คนที่แท็กได้ = "สมาชิกโครงการ" ที่ตั้งค่าไว้ (คน + บทบาท) เท่านั้น
  const duties = MD.duties || [];
  const memberList = ((flow?.members) || []).filter(Boolean).map(n => ({
    name: n,
    role: duties.some(d => d.name === n),
    color: duties.find(d => d.name === n)?.color || staff.find(s => s.name === n)?.color || 'var(--ink-3)',
  }));
  const filteredMentions = mentionActive
    ? memberList.filter(m => !mentionQuery || m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8)
    : [];

  const wrapSel = (pre, post = pre) => {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = body.slice(s, e) || 'ข้อความ';
    setBody(body.slice(0, s) + pre + sel + post + body.slice(e));
    setTimeout(() => { ta.focus(); ta.selectionStart = s + pre.length; ta.selectionEnd = s + pre.length + sel.length; }, 0);
  };
  const insertAtCursor = (text) => {
    const ta = taRef.current;
    const s = ta ? (ta.selectionStart ?? body.length) : body.length;
    setBody(body.slice(0, s) + text + body.slice(s));
    setTimeout(() => { if (ta) { ta.focus(); const p = s + text.length; ta.selectionStart = ta.selectionEnd = p; } }, 0);
  };
  // ตรวจ @ ระหว่างพิมพ์ → โชว์ dropdown รายชื่อสมาชิก
  const onBodyChange = (e) => {
    const val = e.target.value; setBody(val);
    const pos = e.target.selectionStart ?? val.length;
    const m = val.slice(0, pos).match(/@([^\s@]*)$/);
    if (m && memberList.length) { setMentionActive(true); setMentionQuery(m[1]); setMentionIndex(0); }
    else if (mentionActive) setMentionActive(false);
  };
  const pickMention = (name) => {
    mentionedRef.current.add(name); // จดไว้ส่งแจ้งเตือนตอนโพสต์
    const ta = taRef.current; const pos = ta ? (ta.selectionStart ?? body.length) : body.length;
    const before = body.slice(0, pos).replace(/@([^\s@]*)$/, '@' + name + ' ');
    const nb = before + body.slice(pos);
    setBody(nb); setMentionActive(false);
    setTimeout(() => { if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = before.length; } }, 0);
  };

  const post = async () => {
    const text = body.trim();
    if (!text || busy || !supabase) return;
    setBusy(true);
    const row = { id: uid('cm'), task_id: taskId, text, author: meEmail, parent_id: replyTo?.id || null };
    let { error } = await supabase.from('tmk_task_comments').insert(row);
    if (error && /parent_id/.test(error.message || '')) { delete row.parent_id; ({ error } = await supabase.from('tmk_task_comments').insert(row)); } // graceful: ยังไม่ migrate เธรด
    setBusy(false);
    if (error) { setUnavailable(true); onUnavailable?.(); toast('ส่งคอมเมนต์ไม่สำเร็จ', 'warn'); return; }
    setBody(''); setMentionActive(false); setReplyTo(null);
    setList(p => [...p, { ...row, created_at: new Date().toISOString() }]);
    const _t = (MD.tasks || []).find(t => t.id === taskId);
    logAudit({ action: 'create', entityType: 'comment', entityName: _t?.title || 'งาน', summary: `${row.parent_id ? 'ตอบกลับ' : 'คอมเมนต์'}: "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`, flowId: flow?.scopeId ?? flow?.id ?? '' });
    mentionedRef.current = new Set();
  };
  // รีแอกชัน emoji (toggle ของเรา) — เก็บใน reactions jsonb [{emoji,users[]}]
  const toggleReaction = async (c, emoji) => {
    setReactFor(null);
    if (!supabase) return;
    // อ่านค่า reactions ล่าสุดก่อนเขียน (กัน 2 แท็บ/2 คน กดพร้อมกันแล้วเขียนทับกัน — read-modify-write)
    let cur = Array.isArray(c.reactions) ? c.reactions : [];
    try { const { data } = await supabase.from('tmk_task_comments').select('reactions').eq('id', c.id).maybeSingle(); if (data && Array.isArray(data.reactions)) cur = data.reactions; } catch { /* คอลัมน์ยังไม่ migrate → ใช้ค่าใน memory */ }
    const idx = cur.findIndex(r => r.emoji === emoji);
    let next;
    if (idx < 0) next = [...cur, { emoji, users: [meEmail] }];
    else {
      const has = (cur[idx].users || []).includes(meEmail);
      const users = has ? cur[idx].users.filter(u => u !== meEmail) : [...(cur[idx].users || []), meEmail];
      next = cur.map((r, i) => i === idx ? { ...r, users } : r).filter(r => (r.users || []).length);
    }
    setList(p => p.map(x => x.id === c.id ? { ...x, reactions: next } : x)); // optimistic
    const { error } = await supabase.from('tmk_task_comments').update({ reactions: next }).eq('id', c.id);
    if (error) { toast('รีแอกชันไม่ได้ — ยังไม่ได้รัน migration 20260801', 'warn'); loadComments(); }
  };
  const saveEdit = async (id) => {
    const text = editText.trim(); if (!text) return;
    const { error } = await supabase.from('tmk_task_comments').update({ text, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast('แก้ไขไม่สำเร็จ', 'error'); return; }
    setList(p => p.map(c => c.id === id ? { ...c, text, updated_at: new Date().toISOString() } : c)); // อัปเดต updated_at ด้วย → ป้าย "แก้ไขแล้ว" ขึ้นทันที
    setEditId(null); setEditText('');
  };
  const del = async (id) => {
    if (!await confirm({ title: 'ลบคอมเมนต์', body: 'ลบคอมเมนต์นี้?', danger: true, confirmText: 'ลบ' })) return;
    const { error } = await supabase.from('tmk_task_comments').delete().eq('id', id);
    if (error) { toast('ลบไม่สำเร็จ', 'error'); return; }
    setList(p => p.filter(c => c.id !== id));
    const _t = (MD.tasks || []).find(t => t.id === taskId);
    logAudit({ action: 'delete', entityType: 'comment', entityName: _t?.title || 'งาน', summary: 'ลบคอมเมนต์', flowId: flow?.scopeId ?? flow?.id ?? '' });
  };

  if (unavailable) return null;

  // เธรด: top-level + ตอบกลับต่อ parent · ป้าย "แก้ไขแล้ว" · รีแอกชัน
  const EMOJIS = ['👍', '❤️', '😄', '🎉', '👀', '✅'];
  const isEdited = (c) => c.updated_at && (new Date(c.updated_at) - new Date(c.created_at) > 5000);
  const roots = list.filter(c => !c.parent_id);
  const repliesByParent = {};
  list.forEach(c => { if (c.parent_id) (repliesByParent[c.parent_id] = repliesByParent[c.parent_id] || []).push(c); });
  const renderComment = (c, isReply = false) => {
    const reacts = Array.isArray(c.reactions) ? c.reactions : [];
    return (
      <div key={c.id} className="flex items-start gap-2 group">
        <span className="shrink-0 rounded-full grid place-items-center font-semibold text-white" style={{ background: colorOf(c.author), width: isReply ? 22 : 28, height: isReply ? 22 : 28, fontSize: isReply ? 9 : 10 }}>{initials(c.author)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-semibold text-foreground truncate">{nameOf(c.author)}</span>
            <span className="text-muted-foreground">{timeAgo(c.created_at)}</span>
            {isEdited(c) && <span className="text-muted-foreground/70">· แก้ไขแล้ว</span>}
            <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button type="button" className="size-6 grid place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" title="แสดงความรู้สึก" onClick={() => setReactFor(f => f === c.id ? null : c.id)}><Icon name="smile" className="size-3.5" /></button>
              {!isReply && <button type="button" className="size-6 grid place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" title="ตอบกลับ" onClick={() => { setReplyTo({ id: c.id, author: c.author }); setTimeout(() => taRef.current?.focus(), 0); }}><Icon name="reply" className="size-3.5" /></button>}
              {c.author === meEmail && editId !== c.id && <>
                <button type="button" className="size-6 grid place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" title="แก้ไข" onClick={() => { setEditId(c.id); setEditText(c.text); }}><Icon name="pencil" className="size-3.5" /></button>
                <button type="button" className="size-6 grid place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="ลบ" onClick={() => del(c.id)}><Icon name="trash" className="size-3.5" /></button>
              </>}
            </span>
          </div>
          {editId === c.id ? (
            <div className="mt-1 flex flex-col gap-1.5">
              <Textarea data-no-form-submit value={editText} onChange={e => setEditText(e.target.value)} rows={2} className="resize-y text-sm" />
              <div className="flex gap-2"><Button size="sm" className="h-7" onClick={() => saveEdit(c.id)}>บันทึก</Button><Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditId(null); setEditText(''); }}>ยกเลิก</Button></div>
            </div>
          ) : (
            <div className="mt-0.5 rounded-lg bg-muted/60 px-3 py-2 text-sm break-words leading-relaxed" dangerouslySetInnerHTML={{ __html: renderCommentHtml(c.text) }} />
          )}
          {(reacts.length > 0 || reactFor === c.id) && (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {reacts.map(r => { const mine = (r.users || []).includes(meEmail); return (
                <button type="button" key={r.emoji} onClick={() => toggleReaction(c, r.emoji)} className={'inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full border ' + (mine ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-muted border-transparent text-muted-foreground hover:bg-muted/70')}>{r.emoji} {(r.users || []).length}</button>
              ); })}
              {reactFor === c.id && (
                <span className="inline-flex items-center gap-0.5 rounded-full border bg-popover shadow-sm px-1 py-0.5">
                  {EMOJIS.map(e => <button type="button" key={e} className="size-6 grid place-items-center rounded hover:bg-muted text-base leading-none" onClick={() => toggleReaction(c, e)}>{e}</button>)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[13px] font-semibold text-foreground flex items-center gap-2 shrink-0">
        <Icon name="chat" className="size-4 text-muted-foreground" /> ความคิดเห็น {list.length > 0 && <span className="text-xs tabular-nums text-muted-foreground">({list.length})</span>}
      </div>

      {/* รายการคอมเมนต์ — เธรด (top-level + ตอบกลับ) */}
      <div ref={scrollRef} className="flex flex-col gap-3 pr-1">
        {roots.length === 0 && <div className="text-xs text-muted-foreground py-6 text-center">ยังไม่มีความคิดเห็น — เริ่มพูดคุยเกี่ยวกับงานนี้</div>}
        {roots.map(c => (
          <div key={c.id} className="flex flex-col gap-2">
            {renderComment(c, false)}
            {(repliesByParent[c.id] || []).length > 0 && (
              <div className="ml-9 flex flex-col gap-2 border-l pl-3">
                {repliesByParent[c.id].map(r => renderComment(r, true))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* คอมโพสเซอร์ — ปักล่าง (ฟีล ClickUp) */}
      <div className="lg:sticky lg:bottom-0 bg-background pt-2">
       <div className="rounded-xl border bg-card relative">
        {/* dropdown @mention — โผล่ตอนพิมพ์ @ (รายชื่อจากสมาชิกโครงการ) */}
        {mentionActive && filteredMentions.length > 0 && (
          <div className="absolute bottom-full left-1 right-1 mb-1 z-20 max-h-52 overflow-y-auto rounded-lg border bg-popover shadow-lg p-1">
            <div className="px-2 py-1 text-[10px] text-muted-foreground">แท็กสมาชิกโครงการ</div>
            {filteredMentions.map((m, i) => (
              <button type="button" key={m.name} onMouseDown={e => { e.preventDefault(); pickMention(m.name); }} onMouseEnter={() => setMentionIndex(i)}
                className={'w-full flex items-center gap-2 text-left px-2 py-1.5 text-sm rounded ' + (i === mentionIndex ? 'bg-muted' : 'hover:bg-muted')}>
                <span className="size-5 shrink-0 rounded-full grid place-items-center text-[9px] font-semibold text-white" style={{ background: m.color }}>{m.name.slice(0, 2).toUpperCase()}</span>
                <span className="flex-1 truncate">{m.name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{m.role ? 'บทบาท' : 'คน'}</span>
              </button>
            ))}
          </div>
        )}
        {replyTo && (
          <div className="flex items-center justify-between text-[11px] px-3 pt-2 text-muted-foreground">
            <span className="inline-flex items-center gap-1 truncate"><Icon name="reply" className="size-3.5 shrink-0" /> กำลังตอบ <b className="text-foreground truncate">{nameOf(replyTo.author)}</b></span>
            <button type="button" className="hover:text-foreground shrink-0" onClick={() => setReplyTo(null)} title="ยกเลิกการตอบกลับ">✕</button>
          </div>
        )}
        <div className="flex items-center gap-0.5 px-1.5 pt-1.5 pb-1 border-b">
          <TBtn title="ตัวหนา" onClick={() => wrapSel('**')}><b>B</b></TBtn>
          <TBtn title="ตัวเอียง" onClick={() => wrapSel('_')}><i>I</i></TBtn>
          <TBtn title="ขีดฆ่า" onClick={() => wrapSel('~~')}><span className="line-through">S</span></TBtn>
          <TBtn title="โค้ด" onClick={() => wrapSel('`')}><span className="font-mono text-xs">{'</>'}</span></TBtn>
          <TBtn title="รายการ" onClick={() => insertAtCursor('\n- ')}><Icon name="listChecks" className="size-4" /></TBtn>
          <TBtn title="กล่าวถึง (@)" onClick={() => insertAtCursor('@')}>@</TBtn>
        </div>
        <Textarea data-no-form-submit ref={taRef} value={body} onChange={onBodyChange} rows={2} placeholder="เขียนความคิดเห็น…"
          className="border-0 shadow-none focus-visible:ring-0 resize-none min-h-[44px] text-sm"
          onKeyDown={e => {
            if (mentionActive && filteredMentions.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % filteredMentions.length); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + filteredMentions.length) % filteredMentions.length); return; }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(filteredMentions[mentionIndex].name); return; }
              if (e.key === 'Escape') { e.preventDefault(); setMentionActive(false); return; }
            }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); post(); }
          }} />
        <div className="flex items-center justify-end px-2 pb-1.5">
          <Button size="sm" className="h-7" disabled={!body.trim() || busy} onClick={post}><Icon name="send" className="size-4 mr-1" /> ส่ง</Button>
        </div>
       </div>
      </div>
    </div>
  );
}

/* ---------- Product modal ---------- */
// ล็อต = ตาราง ไซส์ × สี (เสื้อพิมพ์ลาย): { id, lotNo, date, cost, note, sizes[], colors[{id,name,hex}], grid{colorId:{size:qty}} }


