/* ============================================================
   saleWidgets.jsx — shared widgets/helpers ของ views-2 split (PART 79)
   DateRangePicker/MultiSelect/DrawerField/DrawerGroup + date/csv/guard helpers
   (เดิมกระจายแทรกใน views-2 · planner ใช้ date helper ที่นิยามในโซน orders → ต้องรวมที่นี่)
   ============================================================ */
import React from 'react';
import { TMK } from './data.js';
import { Icon, Skel, PersonAvatar } from './components.jsx';
import { Modal } from './modals-core.jsx';
import { CUSTOMER_TYPES } from './lib/saleFields.js';
import { csvEsc } from './lib/csv.js';
import { lazyRetry } from './lib/lazyRetry.js';
import { canEdit, isAdmin, toast } from './lib/appBus.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { th } from 'date-fns/locale';
export { MultiSelect } from './components/MultiSelect.jsx'; // แหล่งเดียวของทั้งแอป (เดิมมีสำเนา 6 ชุด)

export const DD = TMK;

// a11y: ให้ clickable div กดด้วยคีย์บอร์ดได้ (Enter/Space → trigger onClick)
export const onCardKey = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); e.currentTarget.click(); } }; // เฉพาะตอนโฟกัสที่การ์ดเอง ไม่ใช่ control ลูก (select/ปุ่ม) → กัน Space/Enter ของ select เด้งเปิด modal

// guard สิทธิ์ (ฝั่ง client) — กัน viewer แก้ผ่านหน้าตั้งค่า + จัดการผู้ใช้/สิทธิ์เฉพาะ admin
export const guardEdit = () => { if (!canEdit()) { toast('สิทธิ์ "ดูอย่างเดียว" — แก้ไขไม่ได้ (ติดต่อแอดมิน)', 'warn'); return false; } return true; };
export const guardAdmin = () => { if (!isAdmin()) { toast('เฉพาะแอดมินจัดการผู้ใช้และสิทธิ์ได้', 'warn'); return false; } return true; };

/* ---- FormSection — กล่องส่วนฟอร์ม (หัวไอคอน + กรอบอ่อน) — มาตรฐานเดียวทั้ง 3 ฟอร์มขาย (PART 81.5)
   เดิมอยู่ใน ManualSaleSheet ไฟล์เดียว → ยกมากลางให้ ตรวจก่อนบันทึก + แก้ออเดอร์ ใช้ร่วม ---- */
export function FormSection({ icon, title, sub, children, className = '' }) {
  return (
    <div className={'rounded-xl border p-3.5 shadow-sm ' + className} style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid place-items-center rounded-lg size-7" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', flex: 'none' }}><Icon name={icon} /></span>
        <span className="text-[13px] font-bold">{title}</span>
        {sub && <span className="cap" style={{ color: 'var(--ink-4)' }}>· {sub}</span>}
      </div>
      {children}
    </div>
  );
}

/* ---- FieldLabel / Field — label + field มาตรฐานเดียวทุกฟอร์มแก้/เพิ่ม (PART 83) ----
   แทน 3 ระบบเดิม (EL 11px/400 · .field 13px/600 · kv-grid) ให้ label ทั้งแอปหน้าตาเดียวกัน */
export function FieldLabel({ children, className = '' }) {
  return <span className={'text-[12px] font-semibold text-muted-foreground ' + className}>{children}</span>;
}
export function Field({ label, children, className = '' }) {
  return <div className={'flex flex-col gap-1.5 ' + className}><FieldLabel>{label}</FieldLabel>{children}</div>;
}

/* ---- PriceBreakdown — แยก "ราคาเสื้อ / ส่วนลด / ค่าส่ง / VAT → ยอดขาย" (PART 81.6) ----
   ใช้ร่วมทุก popup: ใบเสร็จ + ออเดอร์ + ตรวจก่อนบันทึก · โชว์เฉพาะเมื่อมี break จริง (ไม่งั้นซ่อน) */
const _fmtB = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
// แถวเดียวใน PriceBreakdown — ประกาศระดับโมดูล (เดิมนิยามในตัว component → remount ทุก render)
function PbRow({ label, val, sign = '', strong }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className={strong ? 'font-semibold' : 'text-muted-foreground'}>{label}</span>
      <span className={'tabular-nums ' + (strong ? 'font-bold' : 'text-muted-foreground')}>{sign}{_fmtB(val)}</span>
    </div>
  );
}
export function PriceBreakdown({ subtotal, discount, shipping, vat, total, className = '' }) {
  const d = Number(discount) || 0, s = Number(shipping) || 0, v = Number(vat) || 0;
  const tot = Number(total) || 0;
  const sub = subtotal != null && subtotal !== '' ? Number(subtotal) : null;
  const hasBreak = d || s || v || (sub != null && Math.abs(sub - tot) > 0.01);
  if (!hasBreak) return null;
  return (
    <div className={'rounded-lg border p-2.5 flex flex-col gap-1 ' + className} style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
      {sub != null && <PbRow label="ราคาเสื้อ" val={sub} />}
      {d ? <PbRow label="ส่วนลด" val={d} sign="−" /> : null}
      {s ? <PbRow label="ค่าส่ง" val={s} sign="+" /> : null}
      {v ? <PbRow label="VAT" val={v} sign="+" /> : null}
      <div className="mt-0.5 border-t pt-1" style={{ borderColor: 'var(--line)' }}><PbRow label="ยอดขาย" val={tot} strong /></div>
    </div>
  );
}

/* ---- MoneyCard — ยอดเด่น + COD badge + แยกราคา (รวมการ์ดบน+breakdown เป็นใบเดียว · PART 83) ----
   เลิกโชว์ยอดซ้ำ 2 ที่ · extras = เซลล์เสริม (ค่าธรรมเนียม/ยอด COD) · breakdown props = ราคาเสื้อ/ส่วนลด/ค่าส่ง/VAT */
export function MoneyCard({ total, codBadge, extras = [], discount, className = '' }) {
  // PART 88: breakdown เต็มย้ายไปท้ายตารางรายการสินค้า (MoneySummaryRows · orderCard.jsx)
  // หัวโชว์ "ยอดสุทธิ + ส่วนลดเห็นทันที" ตามระบบการ์ดกลาง (Lemon)
  const d = Number(discount) || 0, tot = Number(total) || 0;
  return (
    <div className={'rounded-xl border p-4 ' + className} style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span className="text-[26px] font-extrabold leading-none tabular-nums" style={{ color: 'var(--accent)' }}>{_fmtB(tot)}</span>
          {codBadge && <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400">{codBadge}</Badge>}
        </div>
        <span className="text-[11px] text-muted-foreground">ยอดขาย{d > 0 && <span className="ml-1.5 font-semibold" style={{ color: 'var(--bad)' }}>· ส่วนลด −{_fmtB(d)}</span>}</span>
      </div>
      {extras.length > 0 && (
        <div className="mt-3 flex items-stretch justify-center gap-5">{extras.map(e => (
          <div key={e.label} className="text-center"><div className="text-[13px] font-bold tabular-nums">{e.val}</div><div className="text-[11px] text-muted-foreground">{e.label}</div></div>
        ))}</div>
      )}
    </div>
  );
}

/* ---- ReceiptPdfModal — เปิดไฟล์ใบเสร็จเป็น popup ฝัง PDF ในหน้า (Modal + pdf.js canvas · PART 83) ----
   file_url เป็น public URL (Storage) โหลดตอนเปิดเท่านั้น = egress น้อย
   ใช้ pdf.js render ลง canvas (ไม่พึ่งปลั๊กอิน PDF ของเบราว์เซอร์ที่บางตัวไม่มี → iframe ดำ)
   PdfViewer lazy-load → pdfjs โหลดเฉพาะตอนเปิด ไม่บวม bundle หลัก */
const PdfViewer = lazyRetry(() => import('./components/PdfViewer.jsx'), 'PdfViewer');
export function ReceiptPdfModal({ url, title = 'ไฟล์ใบเสร็จ', onClose }) {
  return (
    <Modal xl icon="external" title={title} sub="ดูไฟล์ใบเสร็จ (PDF)" onClose={onClose}
      footer={<><Button asChild variant="outline" size="sm"><a href={url} target="_blank" rel="noreferrer"><Icon name="external" /> เปิดแท็บใหม่</a></Button><Button size="sm" onClick={onClose}>ปิด</Button></>}>
      <div className="overflow-y-auto rounded-lg border p-2" style={{ maxHeight: '74vh', borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
        <React.Suspense fallback={<Skel w="100%" h={420} r={8} />}>
          <PdfViewer url={url} />
        </React.Suspense>
      </div>
    </Modal>
  );
}

/* ---- CustomerTypeChips — ลูกค้าใหม่/เก่า แบบ chips อันเดียวทุกฟอร์ม (เลิก Select บ้าง chips บ้าง) ---- */
/* ---- FilterChip / PersonChips — ชิปตัวกรองแบบเดียวกันทั้งแอป (PART 114) ----
   เดิม copy สไตล์ inline ซ้ำ 2 ที่ (popup รายวัน · ใบสั่งผลิต) → รวมมาไว้ที่เดียว
   ปุ่มจริง (button) มี aria-pressed → คีย์บอร์ด/สกรีนรีดเดอร์รู้ว่าเลือกอยู่ · สูง 26px ตามชิปเดิม */
export function FilterChip({ on = false, onClick, title, children, className = '' }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={on}
      className={'row cap ' + className}
      style={{ gap: 5, alignItems: 'center', padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontWeight: 600,
        border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
        background: on ? 'var(--accent-soft)' : 'var(--surface)',
        color: on ? 'var(--accent-2)' : 'var(--ink-3)' }}>
      {children}
    </button>
  );
}

/* ชิปเลือกคน (พร้อมอวาตาร์) + ปุ่ม "ทั้งหมด" — ใช้ทั้งใบสั่งผลิตและตัวกรองรายคนอื่น ๆ */
export function PersonChips({ people = [], value = '', onChange, label = 'ผู้รับผิดชอบ', allLabel = 'ทั้งหมด' }) {
  if (!people.length) return null;
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {label && <span className="cap" style={{ color: 'var(--ink-4)' }}>{label}</span>}
      <FilterChip on={!value} onClick={() => onChange('')}>{allLabel}</FilterChip>
      {people.map(p => (
        <FilterChip key={p} on={value === p} onClick={() => onChange(value === p ? '' : p)}>
          <PersonAvatar name={p} size={16} />{p}
        </FilterChip>
      ))}
    </div>
  );
}

export function CustomerTypeChips({ value, onChange, showLabel = true }) {
  return (
    <div className="flex items-center gap-1.5">
      {showLabel && <span className="text-[11px] text-muted-foreground">สถานะ</span>}
      {CUSTOMER_TYPES.map(t => (
        <button key={t} type="button" onClick={() => onChange(t)}
          className={`h-7 px-2.5 rounded-md border text-xs transition-colors ${value === t ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground'}`}>{t}</button>
      ))}
    </div>
  );
}

/* ---- SellerCombobox — เลือกเซลล์จากรายชื่อ (Command+Popover · พิมพ์เองได้เป็น fallback) ----
   ชื่อเซลล์ = ฟิลด์ Tier-1: ต้อง match เป๊ะ 3 ที่ (ออเดอร์ ↔ คนทัก funnel ↔ เป้า/คอม)
   พิมพ์เพี้ยน = เซลล์แตกเป็น 2 คนใน leaderboard → picker ลด drift · options เจ้าของหน้า derive (staff ∪ เซลล์จากข้อมูล) */
export function SellerCombobox({ value, onChange, options = [], placeholder = 'เลือกเซลล์', className }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const opts = React.useMemo(() => [...new Set((options || []).map(s => String(s || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')), [options]);
  const qt = q.trim();
  const pick = (v) => { onChange(v); setOpen(false); setQ(''); };
  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setQ(''); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}
          className={'w-full justify-between font-normal ' + (className || '')} style={{ color: value ? 'var(--ink-1)' : 'var(--ink-4)' }}>
          <span className="truncate">{value || placeholder}</span>
          <Icon name="chevD" className="opacity-60 flex-none" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-[var(--radix-popover-trigger-width)]" style={{ minWidth: 220 }}>
        <Command>
          <CommandInput placeholder="ค้นหา/พิมพ์ชื่อเซลล์…" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>พิมพ์ชื่อแล้วกด “ใช้ชื่อนี้”</CommandEmpty>
            {(value || (qt && !opts.some(s => s.toLowerCase() === qt.toLowerCase()))) && (
              <CommandGroup>
                {qt && !opts.some(s => s.toLowerCase() === qt.toLowerCase()) && (
                  <CommandItem value={qt} onSelect={() => pick(qt)}>
                    <span style={{ width: 16, flex: 'none' }} /><span>ใช้ชื่อนี้: <b>{qt}</b></span>
                  </CommandItem>
                )}
                {value && (
                  <CommandItem value="__clear__" onSelect={() => pick('')}>
                    <span style={{ width: 16, flex: 'none' }} /><span style={{ color: 'var(--ink-4)' }}>ล้างชื่อเซลล์</span>
                  </CommandItem>
                )}
              </CommandGroup>
            )}
            <CommandGroup heading="รายชื่อเซลล์">
              {opts.map(s => {
                const sel = s === value;
                return (
                  <CommandItem key={s} value={s} onSelect={() => pick(s)}>
                    <span style={{ width: 16, color: 'var(--accent)', flex: 'none' }}>{sel && <Icon name="check" />}</span>
                    <span className="truncate" style={{ fontWeight: sel ? 600 : 400 }}>{s}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ====================  PLANNER  ==================== */
export const stLabel = { done: 'เสร็จ', review: 'รอตรวจ', inprogress: 'กำลังทำ', todo: 'รอ' };
export const stCls = { done: 'chip-good', review: 'chip-warn', inprogress: 'chip-accent', todo: '' };
export const chipVar2 = (cls) => ({ 'chip-good': 'success', 'chip-warn': 'warning', 'chip-bad': 'danger', 'chip-accent': 'accent', '': 'secondary' }[cls || ''] || 'secondary');

/* ---- DateRangePicker — ปุ่มช่วงเวลาเดียว (preset + ปฏิทินคู่) แบบหน้ายอดขาย · ใช้ helper _TH_MON/_isoToDate/_dateToIso/_fmtTh ร่วม (นิยามด้านล่าง) ---- */
export const fmtRange = (from, to) => {
  if (!from || !to) return '';
  const [fy, fm, fd] = from.split('-').map(Number), [ty, tm, td] = to.split('-').map(Number);
  if (fy === ty && fm === tm) return `${fd}–${td} ${_TH_MON[fm - 1]} ${fy}`;
  if (fy === ty) return `${fd} ${_TH_MON[fm - 1]} – ${td} ${_TH_MON[tm - 1]} ${ty}`;
  return `${_fmtTh(from)} – ${_fmtTh(to)}`;
};
/* จอแคบ → ปฏิทินเดือนเดียว (2 เดือนล้นจอมือถือ) · เคารพการหมุนจอ */
function useNarrow(bp = 640) {
  const [narrow, setNarrow] = React.useState(() => typeof window !== 'undefined' && window.innerWidth < bp);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${bp - 1}px)`);
    const on = () => setNarrow(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [bp]);
  return narrow;
}

/* presetRangeOf(id) → {from,to} (ไม่บังคับ): ถ้าส่งมา จะโชว์ช่วงวันจริงใต้ชื่อ preset
   → ผู้ใช้เห็นเลยว่า "เดือนนี้" = 1–24 ส.ค. โดยไม่ต้องกดดูปฏิทินก่อน */
export function DateRangePicker({ from, to, min, max, onChange, presets = [], activePreset, onPickPreset, presetRangeOf }) {
  const [open, setOpen] = React.useState(false);
  const [sel, setSel] = React.useState({ from: _isoToDate(from), to: _isoToDate(to) });
  const narrow = useNarrow();
  // min/max = ขอบวันที่ข้อมูลจริง (ใช้โดยหน้าออเดอร์ — เดิม OrderDatePicker fork แยก · PART 81 รวมเป็นตัวเดียว)
  const disabled = []; if (_isoToDate(min)) disabled.push({ before: _isoToDate(min) }); if (_isoToDate(max)) disabled.push({ after: _isoToDate(max) });
  const presetLabel = (presets.find(([id]) => id === activePreset) || [])[1];
  const main = presetLabel || (from || to ? 'กำหนดเอง' : 'ทุกช่วงเวลา');
  const sub = activePreset === 'all' ? '' : fmtRange(from, to);
  // ใช้ช่วงที่เลือกค้างไว้ (รองรับ "วันเดียว": กดวันเดียวแล้วกดใช้ได้เลย — เดิมต้องกด 2 ครั้งให้ครบ from/to)
  const applySel = () => {
    if (!sel?.from) return;
    onChange(_dateToIso(sel.from), _dateToIso(sel.to || sel.from));
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setSel({ from: _isoToDate(from), to: _isoToDate(to) }); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 font-normal">
          <Icon name="calendarDays" /><span className="font-semibold text-[var(--ink)]">{main}</span>
          {sub && <span className="text-[var(--ink-4)]">· {sub}</span>}
          <Icon name="chevD" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex max-sm:flex-col">
          {/* คอลัมน์ preset — ชื่อ + ช่วงวันจริง (ถ้ามี presetRangeOf) · ที่เลือกอยู่มีเครื่องหมายถูก ไม่พึ่งสีอย่างเดียว */}
          <div className="flex shrink-0 flex-col gap-0.5 border-b p-2 sm:min-w-[168px] sm:border-b-0 sm:border-r">
            <span className="px-2 pb-1.5 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-4)]">ช่วงเวลา</span>
            {presets.map(([id, lb]) => {
              const on = id === activePreset;
              const r = presetRangeOf && id !== 'all' ? presetRangeOf(id) : null;
              const hint = r ? fmtRange(r.from, r.to) : '';
              return (
                <button key={id} type="button" aria-pressed={on} onClick={() => { onPickPreset(id); setOpen(false); }}
                  className={'flex min-h-[36px] items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ' + (on ? 'bg-[var(--accent-soft)] text-[var(--accent-2)]' : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)]')}>
                  <span className="flex w-3.5 shrink-0 justify-center">{on && <Icon name="check" className="size-3.5" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className={'block truncate text-[13px] ' + (on ? 'font-semibold' : '')}>{lb}</span>
                    {hint && <span className="block truncate text-[11px] leading-tight text-[var(--ink-4)]">{hint}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex min-w-0 flex-col">
            <Calendar mode="range" numberOfMonths={narrow ? 1 : 2} locale={th} defaultMonth={_isoToDate(from) || _isoToDate(max)} selected={sel}
              disabled={disabled.length ? disabled : undefined}
              onSelect={(r) => { setSel(r || { from: undefined, to: undefined }); if (r?.from && r?.to) { onChange(_dateToIso(r.from), _dateToIso(r.to)); setOpen(false); } }} />
            {/* แถบสรุประหว่างเลือก: วันเริ่ม → วันสิ้นสุด + ล้าง + ใช้ช่วงนี้ */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t px-3 py-2 text-[12.5px]">
              <span className="min-w-0">
                <span className={sel?.from ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-4)]'}>{sel?.from ? _fmtTh(_dateToIso(sel.from)) : 'เลือกวันเริ่ม'}</span>
                <span className="mx-1.5 text-[var(--ink-4)]">→</span>
                <span className={sel?.to ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-4)]'}>{sel?.to ? _fmtTh(_dateToIso(sel.to)) : (sel?.from ? 'วันเดียว' : 'เลือกวันสิ้นสุด')}</span>
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                {(sel?.from || sel?.to) && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] text-[var(--bad)]" onClick={() => setSel({ from: undefined, to: undefined })}>ล้าง</Button>
                )}
                <Button size="sm" className="h-7 px-3 text-[12px]" disabled={!sel?.from} onClick={applySel}>ใช้ช่วงนี้</Button>
              </span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// _csvEsc ย้ายไป lib/csv.js (pure · เทสต์ได้) — re-export ที่นี่กัน consumer เดิมพัง (back-compat)
export const _csvEsc = csvEsc;
export function downloadCSV(filename, blocks) {
  let csv = '';
  blocks.forEach(({ title, cols, rows }) => {
    if (title) csv += title + '\n';
    if (cols) csv += cols.map(_csvEsc).join(',') + '\n';
    (rows || []).forEach(r => { csv += r.map(_csvEsc).join(',') + '\n'; });
    csv += '\n';
  });
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}

/* ====================  ออเดอร์จากไฟล์นำเข้า (รายละเอียด)  ==================== */
/* Skeleton ตรง layout ออเดอร์: การ์ดหัว (ค้นหา + ชิปกรอง) + ตาราง 8 คอลัมน์ */
// รายการเลขหน้าแบบมี … (ย่อเมื่อหน้าเยอะ): 1 … 4 5 6 … 32
export function _pageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  const lo = Math.max(2, cur - 1), hi = Math.min(total - 1, cur + 1);
  if (lo > 2) out.push('…');
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < total - 1) out.push('…');
  out.push(total);
  return out;
}

// ---------- date range picker (preset sidebar + ปฏิทิน range 2 เดือน) — เหมือนหน้ารายงานขาย ----------
export const _TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const _isoToDate = (s) => { if (!s) return undefined; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const _dateToIso = (dt) => dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` : null;
export const _fmtTh = (s) => { if (!s) return '?'; const [y, m, d] = s.split('-').map(Number); return `${d} ${_TH_MON[m - 1]} ${y}`; };
export const _fmtRange = (from, to) => {
  if (!from || !to) return '';
  const [fy, fm, fd] = from.split('-').map(Number), [ty, tm, td] = to.split('-').map(Number);
  if (fy === ty && fm === tm) return `${fd}–${td} ${_TH_MON[fm - 1]} ${fy}`;
  if (fy === ty) return `${fd} ${_TH_MON[fm - 1]} – ${td} ${_TH_MON[tm - 1]} ${ty}`;
  return `${_fmtTh(from)} – ${_fmtTh(to)}`;
};


export function DrawerField({ label, children, full }) {
  return <div style={full ? { gridColumn: '1 / -1' } : undefined}><span className="cap">{label}</span><b>{children}</b></div>;
}
export function DrawerGroup({ icon, title, children }) {
  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: 'var(--line)', background: 'var(--surface-2, transparent)' }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid place-items-center rounded-lg size-7" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', flex: 'none' }}><Icon name={icon} /></span>
        <span className="text-[13px] font-bold" style={{ color: 'var(--ink)' }}>{title}</span>
      </div>
      <div className="kv-grid">{children}</div>
    </div>
  );
}


/* ============================================================
   เสียงลูกค้า (PART 94.1) — อ่านจาก tmk_sales_funnel.voice { ask, praise, complaint }
   ============================================================ */
// ดึงรายการเสียงลูกค้าจากแถว funnel → [{ date, seller, ask, praise, complaint }] ใหม่→เก่า (เฉพาะที่กรอก)
export function funnelVoices(rows) {
  return (rows || [])
    .map(r => ({ date: r.date || '', seller: String(r.salesperson || '').trim(), ...(r.voice && typeof r.voice === 'object' ? r.voice : {}) }))
    .filter(v => String(v.ask || '').trim() || String(v.praise || '').trim() || String(v.complaint || '').trim())
    .map(v => ({ date: v.date, seller: v.seller, ask: String(v.ask || '').trim(), praise: String(v.praise || '').trim(), complaint: String(v.complaint || '').trim() }))
    .sort((a, b) => (b.date.localeCompare(a.date)) || a.seller.localeCompare(b.seller));
}
const _fdate = (iso) => { const [y, m, d] = String(iso || '').split('-'); return y ? `${Number(d)}/${Number(m)}` : iso; };
// กล่องรวมข้อความหมวดเดียว (ถามหา / ติ)
function VoiceBox({ label, hint, tone, items }) {
  return (
    <div className="rounded-lg p-3" style={{ background: `color-mix(in srgb, ${tone} 8%, transparent)`, borderLeft: `3px solid ${tone}` }}>
      <div className="text-[12px] font-semibold mb-2" style={{ color: tone }}>{label} <span className="text-[10.5px] font-normal opacity-80">· {hint} · {items.length}</span></div>
      {items.length ? (
        <div className="flex flex-col gap-1.5" style={{ maxHeight: 180, overflowY: 'auto' }}>
          {items.map((v, i) => <div key={i} className="text-[13px]" style={{ color: 'var(--ink-2)' }}><span className="text-[10.5px] mr-1" style={{ color: 'var(--ink-4)' }}>{_fdate(v.date)} · {v.seller}</span>{v.text}</div>)}
        </div>
      ) : <div className="text-[12px]" style={{ color: 'var(--ink-4)' }}>—</div>}
    </div>
  );
}
// การ์ดฟีดรวม "เสียงลูกค้า" ทั้งเดือน — 2 กล่อง (ถามหา/ติ) + ฟีดรายวันครบทุกหมวด · null ถ้าไม่มี
export function VoiceFeed({ funnel, title = 'เสียงลูกค้า', className = '' }) {
  const list = funnelVoices(funnel);
  if (!list.length) return null;
  const asks = list.filter(v => v.ask).map(v => ({ date: v.date, seller: v.seller, text: v.ask }));
  const complaints = list.filter(v => v.complaint).map(v => ({ date: v.date, seller: v.seller, text: v.complaint }));
  return (
    <div className={`rounded-xl border p-4 ${className}`} style={{ borderColor: 'var(--line)' }}>
      <div className="text-sm font-semibold mb-3 flex items-center gap-2 [&_svg]:size-4" style={{ color: 'var(--ink)' }}><Icon name="chat" /> {title} <span className="text-[11px] font-normal text-muted-foreground">· {list.length} รายการ</span></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <VoiceBox label="ลูกค้าถามหา" hint="ดีมานด์สินค้า" tone="var(--accent)" items={asks} />
        <VoiceBox label="ลูกค้าติ" hint="ต้องแก้" tone="var(--bad)" items={complaints} />
      </div>
      <div className="text-[11px] font-medium text-muted-foreground mb-1.5">ทั้งหมด (ใหม่→เก่า)</div>
      <div className="flex flex-col gap-2" style={{ maxHeight: 300, overflowY: 'auto' }}>
        {list.map((v, i) => (
          <div key={i} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--line)' }}>
            <div className="text-[11px] mb-1" style={{ color: 'var(--ink-4)' }}>{_fdate(v.date)} · <b style={{ color: 'var(--ink-3)' }}>{v.seller}</b></div>
            <div className="flex flex-col gap-0.5 text-[13px]" style={{ color: 'var(--ink-2)' }}>
              {v.ask && <div><span className="text-[11px]" style={{ color: 'var(--accent)' }}>ถามหา: </span>{v.ask}</div>}
              {v.praise && <div><span className="text-[11px]" style={{ color: 'var(--good)' }}>ชม: </span>{v.praise}</div>}
              {v.complaint && <div><span className="text-[11px]" style={{ color: 'var(--bad)' }}>ติ: </span>{v.complaint}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


/* ---------- QuickFab — ปุ่มลอย CTA pill (PART 96.1 · ย้ายจาก salePerf มาเป็นของกลาง PART 103) ----------
   ใช้ใน: ประสิทธิภาพเซล (คนทัก/ส่งยอด) + รายงานขาย (กรอกค่าแอด) · dot = จุดแดงเตือน (เช่น วันนี้ยังไม่กรอก) */
export function QuickFab({ icon, label, onClick, tone, dot = false, dotTitle = 'มีงานค้าง' }) {
  const TONES = {
    submit: ['linear-gradient(135deg,#10b981,#0ea5e9)', 'rgba(14,165,233,.5)'],   // ส่งยอด: emerald → sky
    ads:    ['linear-gradient(135deg,#f59e0b,#f97316)', 'rgba(249,115,22,.5)'],   // ค่าแอด: amber → orange
    leads:  ['linear-gradient(135deg,#6366f1,#a855f7)', 'rgba(124,58,237,.5)'],   // คนทัก: indigo → violet (default)
  };
  const [grad, glow] = TONES[tone] || TONES.leads;
  return (
    // wrapper แยกชั้น: จุดแดงอยู่นอกปุ่ม (ปุ่มมี overflow-hidden เพื่อ sheen — เคยวางจุดข้างในแล้วโดน clip หาย)
    <span className="relative inline-flex" title={dot ? dotTitle : undefined}>
    <button type="button" onClick={onClick} aria-label={dot ? `${label} — ${dotTitle}` : label}
      className="group relative inline-flex min-w-[152px] items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-full py-3 pl-3.5 pr-5 text-[15px] font-semibold text-white ring-1 ring-white/25 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.06] active:translate-y-0 active:scale-[0.97]"
      style={{ background: grad, boxShadow: `0 14px 34px -10px ${glow}, 0 4px 10px -4px rgba(0,0,0,.32)` }}>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
      <span aria-hidden className="pointer-events-none absolute -inset-y-2 -left-1/3 w-1/3 skew-x-[-20deg] bg-white/20 blur-md transition-transform duration-500 group-hover:translate-x-[360%]" />
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-white/25 ring-1 ring-white/30 transition-transform duration-200 group-hover:scale-110 group-active:scale-95 [&_svg]:size-4"><Icon name={icon} /></span>
      <span className="relative">{label}</span>
    </button>
    {dot && <span className="absolute -top-0.5 -right-0.5 z-10 size-3 rounded-full ring-2 ring-white" style={{ background: 'var(--bad, #ef4444)' }} aria-hidden />}
    </span>
  );
}
