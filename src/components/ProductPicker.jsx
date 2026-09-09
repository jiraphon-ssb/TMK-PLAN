/* ============================================================
   ProductPicker — atoms เลือก "ลาย / สี / ไซซ์" จากแคตตาล็อกสินค้า (GOLDEN_DESIGNS)
   ============================================================
   ใช้ร่วมทั้ง "เพิ่มออเดอร์" (ManualSaleSheet) และ "แก้ออเดอร์" (views-2 OrderDrawer)
   - ไฟล์อิสระ: import แค่ shirtCatalog.js + ui primitives → กัน circular import
   - GOLDEN_DESIGNS = static ครบ {code,name,type,price,colors[],sizes[]} → ไม่ต้อง fetch DB
   - buildLineSku คืนรหัสรูปแบบ GOLDEN_CATALOG_GRID (CODE-COLORCODE-SIZE) → deriveColorSize
     ฝั่ง confirmReceipts อ่านคืนสี/ไซซ์ได้เอง (ไม่ต้องคอลัมน์ใหม่)
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../components.jsx';
import { GOLDEN_DESIGNS, COLOR_TH2CODE } from '../lib/shirtCatalog.js';
import { PROVINCES, REGIONS, normalizeProvince } from '../lib/provinces.js';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// สีไทย → hex (โชว์จุดสี) · STD จาก COLOR_TH2CODE (ชื่อไทยหลัก)
export const COLOR_HEX = { 'ขาว': '#ffffff', 'ดำ': '#1a1a1a', 'กรม': '#1f2d50', 'กรมท่า': '#1f2d50', 'ฟ้า': '#4a8be0', 'น้ำเงิน': '#1f3aa0', 'เขียว': '#2f9e6e', 'เหลือง': '#e8c23b', 'แดง': '#c0392b', 'ชมพู': '#e06aa0', 'ม่วง': '#6b5ce0', 'ส้ม': '#e0772f', 'โอรส': '#e0772f', 'ครีม': '#efe7d2' };
export const STD_COLORS = Object.keys(COLOR_TH2CODE);
export const STD_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'];
const sizeRank = (s) => { const i = STD_SIZES.indexOf(s); return i < 0 ? 99 : i; };

// รหัส SKU เต็ม = base + โค้ดสี + ไซซ์ (ตรง GOLDEN_CATALOG_GRID: JSK01-WH-XL) → deriveColorSize resolve คืนได้
export function buildLineSku(baseCode, color, size) {
  const base = String(baseCode || '').trim();
  if (!base) return '';
  const cc = COLOR_TH2CODE[String(color || '').trim()];
  return [base, cc || null, String(size || '').trim() || null].filter(Boolean).join('-');
}
// ชื่อรายการที่ส่งเข้า pipeline: "ลาย (สี-ไซซ์)" — รูปแบบเดียวกับใบเสร็จ → parser/rematch อ่านสี/ไซซ์ได้
export function lineDisplayName(design, color, size) {
  const d = String(design || '').trim();
  const cs = [color, size].map(x => String(x || '').trim()).filter(Boolean).join('-');
  return cs ? `${d} (${cs})` : d;
}
// หา design object จากชื่อลาย (ใช้ populate ตัวเลือกสี/ไซซ์ + ราคา)
export const findDesign = (name) => GOLDEN_DESIGNS.find(d => d.name === name) || null;

/* ---------- เลือกจังหวัด (Command + Popover · 77 จังหวัดจริง จัดกลุ่มตามภาค · ค้นหาได้) ----------
   ใช้ร่วม: ตรวจ/แก้/สร้าง ใบเสร็จ + แก้ออเดอร์ · value/onChange = ชื่อจังหวัดไทย (string)
   - normalize ค่าดิบจาก parser (อังกฤษ/มี prefix) → ชื่อไทยมาตรฐาน ตอนโชว์
   - ค่าที่ไม่อยู่ในลิสต์ (พิมพ์เอง/ปกปิด) ยังโชว์ในปุ่มได้ + เลือกทับได้ · มีปุ่มล้าง */
const PROV_BY_REGION = Object.keys(REGIONS).map(rc => ({ rc, label: REGIONS[rc], items: PROVINCES.filter(p => p.region === rc) }));
export function ProvinceCombobox({ value, onChange, placeholder = 'เลือกจังหวัด', className }) {
  const [open, setOpen] = useState(false);
  const shown = value ? (normalizeProvince(value) || value) : '';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}
          className={'w-full justify-between font-normal ' + (className || '')} style={{ color: shown ? 'var(--ink-1)' : 'var(--ink-4)' }}>
          <span className="truncate">{shown || placeholder}</span>
          <Icon name="chevD" className="opacity-60 flex-none" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-[var(--radix-popover-trigger-width)]" style={{ minWidth: 240 }}>
        <Command>
          <CommandInput placeholder="ค้นหาจังหวัด…" />
          <CommandList>
            <CommandEmpty>ไม่พบจังหวัด</CommandEmpty>
            {shown && (
              <CommandGroup>
                <CommandItem value="__clear__" onSelect={() => { onChange(''); setOpen(false); }}>
                  <span style={{ width: 16, flex: 'none' }} /><span style={{ color: 'var(--ink-4)' }}>ล้างจังหวัด</span>
                </CommandItem>
              </CommandGroup>
            )}
            {PROV_BY_REGION.map(g => (
              <CommandGroup key={g.rc} heading={g.label}>
                {g.items.map(p => {
                  const sel = p.th === shown;
                  return (
                    <CommandItem key={p.th} value={`${p.th} ${p.en}`}
                      onSelect={() => { onChange(p.th); setOpen(false); }}>
                      <span style={{ width: 16, color: 'var(--accent)', flex: 'none' }}>{sel && <Icon name="check" />}</span>
                      <span className="truncate" style={{ fontWeight: sel ? 600 : 400 }}>{p.th}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ---------- เลือกลาย (Command + Popover จาก GOLDEN_DESIGNS) ---------- */
/* items = ลิสต์ลายที่จะให้เลือก [{code,name,type,colors,sizes}] — ไม่ส่งมา = GOLDEN_DESIGNS (ออเดอร์/ใบเสร็จใช้แบบเดิม)
   หน้าสต็อก/ใบสั่งผลิตส่งแคตตาล็อกสด (tmk_shirt_catalog merge GOLDEN) เข้ามา → เลือกได้ทุกลายที่มีในหน้า "สินค้า" */
export function DesignCombobox({ value, code, onPick, items = GOLDEN_DESIGNS, placeholder = 'พิมพ์/เลือกชื่อลาย เช่น ราษฎร์ภักดี' }) {
  const [open, setOpen] = useState(false);
  const list = items && items.length ? items : GOLDEN_DESIGNS;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}
          className="w-full justify-between font-normal" style={{ color: value ? 'var(--ink-1)' : 'var(--ink-4)' }}>
          <span className="truncate">{value ? <>{value}{code ? <span className="dim"> · {code}</span> : null}</> : placeholder}</span>
          <Icon name="chevD" className="opacity-60 flex-none" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-[var(--radix-popover-trigger-width)]" style={{ minWidth: 280 }}>
        <Command>
          <CommandInput placeholder="ค้นหาชื่อลาย / รหัส / ประเภท…" />
          <CommandList>
            <CommandEmpty>ไม่พบลายที่ตรงกัน</CommandEmpty>
            <CommandGroup>
              {list.map(d => {
                const sel = d.name === value;
                return (
                  <CommandItem key={(d.code || "") + d.name} value={`${d.name} ${d.code} ${d.type}`}
                    onSelect={() => { onPick({ name: d.name, code: d.code, design: d }); setOpen(false); }}>
                    <span className="row between w-full" style={{ gap: 8, minWidth: 0 }}>
                      <span className="row" style={{ gap: 8, minWidth: 0, alignItems: 'center' }}>
                        <span style={{ width: 16, color: 'var(--accent)', flex: 'none' }}>{sel && <Icon name="check" />}</span>
                        <span className="truncate" style={{ fontWeight: sel ? 600 : 400 }}>{d.name}</span>
                      </span>
                      <span className="cap flex-none" style={{ color: 'var(--ink-4)' }}>{[d.code, d.type].filter(Boolean).join(' · ')}</span>
                    </span>
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

/* ---------- เลือกสี (จากสีที่ลายนั้นมี · fallback STD) ---------- */
export function ColorSelect({ design, value, onChange, placeholder = 'สี' }) {
  const opts = (design?.colors?.length ? design.colors : STD_COLORS);
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {opts.map(c => (
          <SelectItem key={c} value={c}>
            <span className="row" style={{ gap: 8, alignItems: 'center' }}>
              <span style={{ width: 13, height: 13, borderRadius: 999, background: COLOR_HEX[c] || '#bbb', border: '1px solid var(--line)', display: 'inline-block', flex: 'none' }} />
              {c}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ---------- เลือกไซซ์ (จากไซซ์ที่ลายนั้นมี · fallback STD · เรียงมาตรฐาน) ---------- */
export function SizeSelect({ design, value, onChange, placeholder = 'ไซซ์' }) {
  const opts = (design?.sizes?.length ? [...design.sizes] : [...STD_SIZES]).sort((a, b) => sizeRank(a) - sizeRank(b));
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {opts.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
