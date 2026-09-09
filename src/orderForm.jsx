/* ============================================================
   orderForm.jsx — ฟอร์มออเดอร์กลาง (PART 88.3) · controlled presentational
   ============================================================
   ใช้ร่วม 2 หน้า หน้าตา/ช่องเดียวกันเป๊ะ — แต่ละหน้าต่อ "ท่อบันทึก" ของตัวเอง (รื้อ UI 22 ส.ค.: เงินแถวเดียว+กางเพิ่ม · กระทบยอด reconcileLines · บรรทัดสินค้ากระชับ):
   - เพิ่มออเดอร์ (ManualSaleSheet) → confirmReceipts (กันเลขซ้ำ/idempotency/เติม CRM)
   - แก้ออเดอร์ (OrderDrawer)      → versionedUpdate + override + attrs + sku
   line model รวมเป็น "ราคา/ตัว × จำนวน" (unit price) ทั้งสองฝั่ง · ยอดบรรทัด = qty×price
   ============================================================ */
import { useState } from 'react';
import { Icon } from './components.jsx';
import { fmtBaht } from './lib/money.js';
import { isDftNote } from './lib/saleData.js';
import { CHANNELS, JOB_TYPES } from './lib/saleFields.js';
import { DesignCombobox, ColorSelect, SizeSelect, findDesign, ProvinceCombobox } from './components/ProductPicker.jsx';
import { FormSection, Field, CustomerTypeChips, SellerCombobox } from './saleWidgets.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const N = (v) => Number(v) || 0;
const B = (n) => fmtBaht(N(n));
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// line model + คำนวณ ย้ายไป lib/orderFormModel.js (pure · เทสต์ได้ · กัน round-trip drift) — re-export ให้ import ที่เดียว
export { blankLine, lineAmount, sumLines, sumQty, skuToLine, effectiveTotal, reconcileLines } from './lib/orderFormModel.js';
import { blankLine, lineAmount, sumLines, sumQty, reconcileLines } from './lib/orderFormModel.js';

/* ---- ฟอร์มออเดอร์กลาง (controlled) ----
   f = state · setF(updater) · mode 'add'|'edit' · paymentOptions · sellerOptions
   add-only: ช่อง "เลขออเดอร์ (ว่าง=สร้างให้)" · ทั้งคู่มีโหมด pick/manual ต่อบรรทัด */
export function OrderForm({ f, setF, mode = 'add', paymentOptions = [], sellerOptions = [], lockedSeller = null }) {
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  // sync จำนวนรวมจากบรรทัด เฉพาะเมื่อ qty กำลัง "track" ผลรวมบรรทัดอยู่ (กันทับ qty ยกโหลที่ตั้งเอง — B3.1)
  const syncQty = (p, lines) => (String(p.qty) === String(sumQty(p.lines)) || p.qty === '' || p.qty == null) ? String(sumQty(lines)) : p.qty;
  const setLine = (i, patch) => setF(p => {
    const lines = p.lines.map((l, j) => j === i ? { ...l, ...patch } : l);
    return { ...p, lines, qty: syncQty(p, lines) };
  });
  const addLine = () => setF(p => { const lines = [...p.lines, blankLine()]; return { ...p, lines, qty: syncQty(p, lines) }; });
  const removeLine = (i) => setF(p => {
    if (p.lines.length <= 1 && mode === 'add') return { ...p, lines: [blankLine()], qty: '' };
    const removed = p.lines[i];
    const lines = p.lines.filter((_, j) => j !== i);
    return { ...p, lines, qty: syncQty(p, lines), _delIds: [...(p._delIds || []), removed?.id].filter(Boolean) };
  });
  // ลายจากสินค้า → เติมโค้ด(+ราคาถ้าว่าง) · เคลียร์สี/ไซซ์ที่ลายใหม่ไม่มี
  const pickDesign = (i, { name, code, design: d }) => setLine(i, {
    design: name, code: code || f.lines[i].code,
    ...(d?.price && !f.lines[i].price ? { price: String(d.price) } : {}),
    color: (f.lines[i].color && d?.colors?.length && !d.colors.includes(f.lines[i].color)) ? '' : f.lines[i].color,
    size: (f.lines[i].size && d?.sizes?.length && !d.sizes.includes(f.lines[i].size)) ? '' : f.lines[i].size,
  });
  const lineSum = sumLines(f.lines);
  const rec = reconcileLines(f);   // กระทบยอด: รายการ vs ราคาเสื้อ (ยอด − ส่ง − VAT + ลด) · null = ฟอร์มเปล่า
  // ช่องเงินรอง (ส่วนลด/VAT/ราคาเสื้อ) พับไว้ — กางอัตโนมัติถ้ามีค่าอยู่แล้ว (แก้ออเดอร์เก่า) · ค่าส่ง/จำนวน อยู่แถวหลักเพราะใช้บ่อย
  const [moreOpen, setMoreOpen] = useState(() => N(f.discount) > 0 || N(f.vat) > 0 || N(f.subtotal) > 0);
  const showMore = moreOpen || N(f.discount) > 0 || N(f.vat) > 0 || N(f.subtotal) > 0;
  // ประเภทงาน couple กับ note (buildRows ยึดหมายเหตุตัดสิน ปลีก/DFT)
  const effJob = f.job_type === 'OEM' ? 'OEM' : (isDftNote(f.note) ? 'DFT' : 'ปลีก');
  const pickJob = (v) => {
    if (!v || v === effJob) return;
    if (v === 'OEM') { set('job_type', 'OEM'); return; }
    let n = String(f.note || '').replace(/\bdft\b/ig, '').replace(/\s{2,}/g, ' ').trim();
    if (v === 'DFT') n = (n ? n + ' ' : '') + 'DFT';
    setF(p => ({ ...p, job_type: v, note: n }));
  };
  const numIn = 'bg-background text-right tabular-nums';

  return (
    <div className="flex flex-col gap-3">
      {/* เงิน — แถวเดียว: ยอดขาย (เด่น) · ค่าส่ง · จำนวนรวม + กาง ส่วนลด/VAT/ราคาเสื้อ เมื่อต้องใช้ */}
      <div className="rounded-xl border p-3.5" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
        <div className="of-money">
          <Field label={<>ยอดขาย (฿){mode === 'add' && <span style={{ fontWeight: 400 }}> · ว่าง = ใช้ยอดรายการ</span>}</>}>
            <div className="relative">
              <span aria-hidden className="num" style={{ position: 'absolute', left: 12, top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--ink-4)', fontWeight: 700, fontSize: 16, pointerEvents: 'none' }}>฿</span>
              <Input aria-label="ยอดขาย (บาท)" className="h-11 bg-background pl-7 text-[20px] font-bold tabular-nums" type="number" inputMode="decimal" min="0" step="0.01" value={f.total} onChange={e => set('total', e.target.value)} placeholder={String(lineSum || 0)} />
            </div>
          </Field>
          <Field label="ค่าส่ง (฿)"><Input aria-label="ค่าส่ง" className={numIn + ' h-11'} type="number" inputMode="decimal" min="0" step="0.01" value={f.shipping} onChange={e => set('shipping', e.target.value)} placeholder="0" /></Field>
          <Field label="จำนวนรวม (ตัว)"><Input aria-label="จำนวนรวม (ตัว)" className={numIn + ' h-11'} type="number" inputMode="numeric" min="0" value={f.qty} onChange={e => set('qty', e.target.value)} /></Field>
        </div>
        {showMore ? (
          <div className="of-money-more mt-3">
            <Field label="ส่วนลด (฿)"><Input aria-label="ส่วนลด" className={numIn} type="number" inputMode="decimal" min="0" step="0.01" value={f.discount} onChange={e => set('discount', e.target.value)} placeholder="0" /></Field>
            <Field label="VAT (฿)"><Input aria-label="VAT" className={numIn} type="number" inputMode="decimal" min="0" step="0.01" value={f.vat} onChange={e => set('vat', e.target.value)} placeholder="0" /></Field>
            <Field label="ราคาเสื้อ (฿)"><Input aria-label="ราคาเสื้อ" className={numIn} type="number" inputMode="decimal" min="0" step="0.01" value={f.subtotal} onChange={e => set('subtotal', e.target.value)} placeholder={rec ? String(Math.round(rec.expected * 100) / 100) : '—'} title="ว่าง = คิดจาก ยอดขาย − ค่าส่ง − VAT + ส่วนลด" /></Field>
          </div>
        ) : (
          <button type="button" className="cap mt-2 text-[var(--accent)] hover:underline" style={{ fontWeight: 600 }} onClick={() => setMoreOpen(true)}>+ ส่วนลด / VAT / ราคาเสื้อ</button>
        )}
      </div>

      {/* รายการสินค้า — บรรทัดกระชับ: ลาย (เต็มแถว) → สี · ไซซ์ · จำนวน · ราคา/ตัว · ยอด · ลบ · สลับ "พิมพ์เอง" เป็นลิงก์เล็ก */}
      <div className="overflow-hidden rounded-xl border shadow-sm" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-2 border-b px-3.5 py-2.5" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}>
          <span className="grid size-7 place-items-center rounded-lg" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', flex: 'none' }}><Icon name="bag" /></span>
          <span className="text-[13px] font-bold">รายการสินค้า</span>
          <span className="cap truncate" style={{ color: 'var(--ink-4)' }}>· {f.lines.length} รายการ · {sumQty(f.lines)} ตัว</span>
          <Button variant="outline" size="sm" className="ml-auto h-7 shrink-0 gap-1" onClick={addLine}><Icon name="plus" /> <span className="hidden sm:inline">เพิ่มรายการ</span><span className="sm:hidden">เพิ่ม</span></Button>
        </div>
        <div className="flex flex-col gap-2 p-3">
          {f.lines.map((l, i) => {
            const design = findDesign(l.design);
            const amt = lineAmount(l);
            return (
              <div key={(l.id || 'new') + '#' + i} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
                <div className="grid items-center gap-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                  {l.mode === 'pick'
                    ? <DesignCombobox value={l.design} code={l.code} onPick={d => pickDesign(i, d)} />
                    : <Input aria-label={`ลาย รายการ ${i + 1}`} value={l.design} onChange={e => setLine(i, { design: e.target.value })} placeholder="พิมพ์ชื่อลาย เช่น สิริกานต์" />}
                  <div className="flex items-center gap-1">
                    <span className="num cap" style={{ minWidth: 64, textAlign: 'right', fontWeight: 700, color: amt > 0 ? 'var(--accent)' : 'var(--ink-4)' }}>{B(amt)}</span>
                    {(f.lines.length > 1 || mode === 'edit') && <Button variant="ghost" size="sm" className="h-7 w-7 p-0" style={{ color: 'var(--bad)' }} onClick={() => removeLine(i)} title="ลบรายการ" aria-label={`ลบรายการ ${i + 1}`}><Icon name="trash" className="size-3.5" /></Button>}
                  </div>
                </div>
                <div className="of-line-grid mt-2">
                  {l.mode === 'pick'
                    ? <><ColorSelect design={design} value={l.color} onChange={v => setLine(i, { color: v })} /><SizeSelect design={design} value={l.size} onChange={v => setLine(i, { size: v })} /></>
                    : <><Input aria-label="สี" value={l.color} onChange={e => setLine(i, { color: e.target.value })} placeholder="สี" /><Input aria-label="ไซซ์" value={l.size} onChange={e => setLine(i, { size: e.target.value })} placeholder="ไซซ์" /></>}
                  <Input aria-label="จำนวน" className="text-right" type="number" inputMode="numeric" min="0" value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} placeholder="จำนวน" title="จำนวน" />
                  <Input aria-label="ราคาต่อตัว" className="text-right" type="number" inputMode="decimal" min="0" step="0.01" value={l.price} onChange={e => setLine(i, { price: e.target.value })} placeholder="ราคา/ตัว" title="ราคา/ตัว" />
                </div>
                <button type="button" className="cap mt-1.5 hover:underline" style={{ color: 'var(--ink-4)' }} onClick={() => setLine(i, { mode: l.mode === 'pick' ? 'manual' : 'pick' })}>
                  {l.mode === 'pick' ? 'ไม่พบลาย? พิมพ์เอง' : 'กลับไปเลือกจากสินค้า'}
                </button>
              </div>
            );
          })}
          {rec && (
            <div className="cap mt-1 text-right" role="status" style={{ color: rec.match ? 'var(--good)' : 'var(--warn)', fontWeight: 600 }}>
              {rec.match
                ? <>รายการ {B(rec.lineSum)}{rec.parts.map(p => ` ${p.val < 0 ? '−' : '+'} ${p.label} ${B(Math.abs(p.val))}`).join('')} = ยอดขาย {B(rec.total)} ✓</>
                : <>รายการรวม {B(rec.lineSum)} ≠ ราคาเสื้อ {B(rec.expected)}{rec.basis === 'total' ? ' (ยอดขาย − ค่าส่ง − VAT + ส่วนลด)' : ''} — เช็คจำนวน/ราคาต่อตัว</>}
            </div>
          )}
        </div>
      </div>

      {/* ข้อมูลออเดอร์ | ลูกค้า */}
      <div className="grid items-start gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <FormSection icon="listChecks" title="ข้อมูลออเดอร์">
          <div className="flex flex-col gap-3">
            <Field label="วันที่"><DatePicker value={f.order_date} max={mode === 'add' ? todayISO() : undefined} clearable={false} onChange={v => set('order_date', v || '')} /></Field>
            {mode === 'add' && <Field label="เลขออเดอร์ (ว่าง = สร้างให้)"><Input value={f.order_no} onChange={e => set('order_no', e.target.value)} placeholder="เช่น SK1234" /></Field>}
            <Field label="ช่องทาง *">
              <Select value={f.channel || undefined} onValueChange={v => set('channel', v)}>
                <SelectTrigger className="bg-background" aria-label="ช่องทาง" aria-invalid={!f.channel} style={!f.channel ? { borderColor: 'var(--warn)' } : undefined}><SelectValue placeholder="เลือกช่องทาง" /></SelectTrigger>
                <SelectContent>{[...new Set([...CHANNELS, f.channel].filter(Boolean))].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="ประเภทงาน">
              <ToggleGroup type="single" value={effJob} onValueChange={pickJob} variant="outline" className="justify-start" title="ปลีก/DFT ตัดสินจากคำ “DFT” ในหมายเหตุ — เลือกแล้วระบบเติม/ถอดให้">
                {JOB_TYPES.map(j => <ToggleGroupItem key={j} value={j} className="h-9 whitespace-nowrap px-3 text-[13px]">{j}</ToggleGroupItem>)}
              </ToggleGroup>
            </Field>
            <Field label="การชำระ">
              <Select value={f.payment || undefined} onValueChange={v => set('payment', v)}>
                <SelectTrigger className="bg-background"><SelectValue placeholder="เลือก" /></SelectTrigger>
                <SelectContent>{[...new Set([...paymentOptions, f.payment].filter(Boolean))].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </FormSection>
        <FormSection icon="user" title="ลูกค้า" sub="ไว้ตามต่อ / เข้า CRM">
          <div className="flex flex-col gap-3">
            <Field label="ชื่อลูกค้า"><Input className="bg-background" value={f.customer_name} onChange={e => set('customer_name', e.target.value)} placeholder="ชื่อ/ชื่อเล่น" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="เบอร์โทร"><Input className="bg-background" inputMode="tel" value={f.customer_phone} onChange={e => set('customer_phone', e.target.value)} placeholder="เช่น 0812345678" /></Field>
              <Field label="โซเชียล (FB/LINE)"><Input className="bg-background" value={f.customer_social} onChange={e => set('customer_social', e.target.value)} placeholder="ชื่อเพจ/ไลน์" /></Field>
            </div>
            <Field label="สถานะลูกค้า"><CustomerTypeChips value={f.customer_type} onChange={v => set('customer_type', v)} showLabel={false} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="จังหวัด"><ProvinceCombobox className="bg-background" value={f.province} onChange={v => set('province', v)} /></Field>
              {lockedSeller
                ? <Field label="เซลล์ (ยอดขึ้นชื่อผู้ล็อกอิน)"><div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-[13px] font-medium" style={{ borderColor: 'var(--line)' }}>{lockedSeller}</div></Field>
                : <Field label="เซลล์"><SellerCombobox className="bg-background" value={f.salesperson} onChange={v => set('salesperson', v)} options={sellerOptions} /></Field>}
            </div>
            <Field label="ที่อยู่"><Input className="bg-background" value={f.customer_address} onChange={e => set('customer_address', e.target.value)} placeholder="ที่อยู่จัดส่ง (เข้าโปรไฟล์ลูกค้า CRM)" /></Field>
            <Field label="หมายเหตุ (พิมพ์ “DFT” = งาน DFT)"><Textarea className="bg-background" rows={2} value={f.note} onChange={e => set('note', e.target.value)} placeholder="เช่น DFT / ล็อตสินค้า / โน้ตภายใน" /></Field>
          </div>
        </FormSection>
      </div>
    </div>
  );
}
