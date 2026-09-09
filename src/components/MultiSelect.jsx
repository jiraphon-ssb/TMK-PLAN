/* ============================================================
   MultiSelect.jsx — ชิปตัวกรองแบบเลือกหลายค่า (แหล่งเดียวของทั้งแอป)
   ============================================================
   เดิมมีสำเนา 6 ชุดกระจายอยู่ที่ saleWidgets / saleCrmPanels / saleCatalog /
   saleDashboardChrome / salePerf / views-log — ตัวกรองหน้าตาเดียวกันแต่โค้ดคนละก้อน
   ผลคือค่าสไตล์ไม่ตรงกันจริง (สูง h-8 บ้าง/ไม่กำหนดบ้าง · font-normal vs font-medium ·
   ดรอปดาวน์ w-52/w-56 · ไอคอนคนละขนาด) = ผู้ใช้รู้สึกว่า "แต่ละหน้าหน้าตาไม่เหมือนกัน"

   รวมเป็นตัวเดียว โดยรับ API ครอบทั้ง 6 แบบเดิม:
   - options เป็น string[]  →  ['Facebook', 'TikTok']
   - options เป็น object[]  →  [{ value, label }]   (แบบที่ views-log ใช้)
   - icon   = ไอคอนหน้า label (แบบที่ saleDashboardChrome ใช้)
   - render = custom render ต่อรายการ (แบบที่ views-log ใช้) — รับ option ตัวเต็ม
   ============================================================ */
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Icon } from '../components.jsx';

// รองรับทั้ง string และ { value, label } → รูปแบบเดียว
const normOpt = (o) => (o !== null && typeof o === 'object') ? o : { value: o, label: o };

export function MultiSelect({ label, icon, options = [], value = [], onChange, render }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  const n = value.length;
  const active = n > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={'h-8 rounded-full font-medium gap-1' + (active ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')}
        >
          {icon && <Icon name={icon} className="size-3.5" />}
          {label}
          {active && <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[11px]">{n}</Badge>}
          <Icon name="chevD" className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="max-h-72 w-56 overflow-auto">
        <DropdownMenuLabel className="flex items-center justify-between gap-2 py-1">
          {/* บอกจำนวนที่เลือก/ทั้งหมด — เดิมไม่รู้ว่ามีตัวเลือกกี่ตัว ต้องเลื่อนดูเอง */}
          <span className="min-w-0 truncate">
            {label}
            <span className="ml-1.5 font-normal text-[var(--ink-4)]">{active ? `${n}/${options.length}` : options.length}</span>
          </span>
          {active && (
            <button
              className="shrink-0 text-[12px] font-medium text-[var(--bad)] hover:underline"
              onClick={(e) => { e.preventDefault(); onChange([]); }}
            >ล้าง</button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 && <div className="px-2 py-2 text-[13px] text-[var(--ink-4)]">ไม่มีข้อมูล</div>}
        {options.map((raw) => {
          const o = normOpt(raw);
          return (
            <DropdownMenuCheckboxItem
              key={o.value}
              checked={value.includes(o.value)}
              onSelect={(e) => { e.preventDefault(); toggle(o.value); }}
            >
              {render ? render(raw) : <span className="min-w-0 flex-1 truncate">{o.label || '(ไม่ระบุ)'}</span>}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
