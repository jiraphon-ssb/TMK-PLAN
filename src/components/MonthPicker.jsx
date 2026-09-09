/* ============================================================
   MonthPicker — ตัวเลือก "เดือน" (YYYY-MM) แบบปฏิทินป๊อปอัพ
   ------------------------------------------------------------
   สไตล์เดียวกับตัวเลือกช่วงหน้ารายงานขาย (DateRangePicker) แต่ล็อคเป็น "รายเดือน"
   ใช้ร่วมกันได้ทุกหน้าที่ทำงานรายเดือน (ประสิทธิภาพเซลล์ / ตั้งเป้า ฯลฯ)
   props: { value:'YYYY-MM', onChange:(ym)=>void, max?:'YYYY-MM', min?:'YYYY-MM', size?, className? }
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../components.jsx';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const curYm = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };  // เวลาเครื่อง ไม่ใช่ UTC

export function MonthPicker({ value, onChange, max, min, size = 'sm', className }) {
  const [open, setOpen] = useState(false);
  const [vy, vm] = (value || curYm()).split('-').map(Number);
  const [viewYear, setViewYear] = useState(vy);
  const [maxY, maxM] = (max || '9999-12').split('-').map(Number);
  const [minY, minM] = (min || '0000-01').split('-').map(Number);

  const label = `${TH_MON[vm - 1] || vm} ${vy + 543}`;
  const onOpen = (o) => { setOpen(o); if (o) setViewYear((value || curYm()).split('-').map(Number)[0]); };
  const pick = (m) => { onChange(`${viewYear}-${String(m).padStart(2, '0')}`); setOpen(false); };
  const isDisabled = (m) => (viewYear > maxY || (viewYear === maxY && m > maxM)) || (viewYear < minY || (viewYear === minY && m < minM));

  return (
    <Popover open={open} onOpenChange={onOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size={size} className={'gap-2 font-normal ' + (className || '')}>
          <Icon name="calendarDays" /><span className="font-semibold text-[var(--ink)]">{label}</span><Icon name="chevD" className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[264px] p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <Button variant="ghost" size="icon" className="size-7 shrink-0" disabled={viewYear <= minY} onClick={() => setViewYear(y => y - 1)} aria-label="ปีก่อน"><Icon name="chevL" className="size-4" /></Button>
          <span className="text-sm font-semibold">{viewYear + 543}</span>
          <Button variant="ghost" size="icon" className="size-7 shrink-0" disabled={viewYear >= maxY} onClick={() => setViewYear(y => y + 1)} aria-label="ปีถัดไป"><Icon name="chevR" className="size-4" /></Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {TH_MON.map((mn, i) => {
            const m = i + 1;
            const isSel = viewYear === vy && m === vm;
            const dis = isDisabled(m);
            return (
              <button key={m} type="button" disabled={dis} onClick={() => pick(m)}
                className={'rounded-md py-1.5 text-[13px] transition-colors ' +
                  (isSel ? 'bg-[var(--accent)] font-semibold text-white'
                    : dis ? 'text-[var(--ink-4)] opacity-40 cursor-not-allowed'
                      : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)]')}>{mn}</button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
