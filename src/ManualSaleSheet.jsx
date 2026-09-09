/* ============================================================
   ManualSaleSheet — "เพิ่มออเดอร์เอง / คีย์มือ" (ขายไม่มีใบเสร็จ)
   ============================================================
   เขียนท่อเดียวกับใบเสร็จ (confirmReceipts) → กันเลขซ้ำ · เติมลูกค้า CRM · ขึ้นรายงานครบ
   ยอดขึ้นชื่อ "คนที่ล็อกอิน" (user ที่ส่งเข้ามา) เสมอ
   PART 88.3: ใช้ฟอร์มกลาง <OrderForm mode="add"/> ร่วมกับหน้าแก้ออเดอร์ (orderForm.jsx)
   — หน้าตา/ช่องเดียวกันเป๊ะ · save คงท่อ confirmReceipts เดิม (idempotency + CRM)
   (แยกเป็นไฟล์อิสระ — กัน circular import ระหว่าง views-2 ↔ views-sale-submit) */
import { useState, useRef } from 'react';
import { Icon } from './components.jsx';
import { SideSheet } from './modals-core.jsx';
import { logAudit } from './lib/audit.js';
import { confirmReceipts } from './lib/receiptSubmit.js';
import { RECEIPT_PAYMENTS } from './lib/saleFields.js';
import { buildLineSku, lineDisplayName } from './components/ProductPicker.jsx';
import { Button } from '@/components/ui/button';
import { OrderForm, blankLine, lineAmount, sumLines } from './orderForm.jsx';
import { toast } from './lib/appBus.js';

const fmtB = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const N = (n) => Number(n) || 0;

export function ManualSaleSheet({ user, onClose, onSaved }) {
  const blank = () => ({
    order_date: todayISO(), order_no: '', channel: '', job_type: 'ปลีก', payment: 'โอน', note: '',
    total: '', qty: '1', subtotal: '', discount: '', shipping: '', vat: '',
    lines: [blankLine()],
    customer_type: 'ลูกค้าใหม่', customer_name: '', customer_phone: '', customer_social: '', customer_address: '', province: '', salesperson: user?.name || user?.email || '',
  });
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);

  const lineSum = sumLines(f.lines);
  const effectiveTotal = N(f.total) > 0 ? N(f.total) : lineSum;
  const hasValidLine = f.lines.some(l => N(l.qty) >= 1 && lineAmount(l) > 0);
  const valid = f.channel && hasValidLine && effectiveTotal > 0;

  // idempotency: order_no ที่สร้างเองต้อง "คงที่ต่อการกรอก 1 ใบ" — retry ใช้เลขเดิม → confirmReceipts กันซ้ำด้วย unique order_no
  const genOnoRef = useRef(null);
  const save = async () => {
    if (!valid) { toast('เลือกช่องทาง + ใส่รายการ (ลาย/จำนวน/ราคา) ให้ครบก่อน', 'warn'); return; }
    setBusy(true);
    try {
      const typed = f.order_no.trim().toUpperCase().replace(/\s+/g, '');
      const ono = typed || (genOnoRef.current ||= 'MN' + (Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).toUpperCase());
      const lines = f.lines
        .filter(l => N(l.qty) >= 1 && lineAmount(l) > 0)
        .map(l => ({
          code: l.mode === 'pick' ? buildLineSku(l.code, l.color, l.size) : '',
          name: lineDisplayName(l.design, l.color, l.size) || 'ไม่ระบุลาย',
          color: l.color.trim(), size: l.size.trim(),
          qty: N(l.qty), amount: lineAmount(l),
        }));
      const item = {
        order_no: ono, order_date: f.order_date,
        customer_name: f.customer_name.trim(), customer_phone: f.customer_phone.trim(), customer_social: f.customer_social.trim(), customer_address: f.customer_address.trim(),
        province: f.province.trim(),
        lines,
        subtotal: N(f.subtotal) || lineSum, discount: N(f.discount), shipping: N(f.shipping), vat: N(f.vat), total: effectiveTotal,
        payment_method: f.payment === 'COD' ? 'cod' : f.payment === 'ไม่ระบุ' ? '' : 'โอน', carrier: '', note: f.note.trim(),
        channel: f.channel, job_type: f.job_type, customer_type: f.customer_type,
        source_tool: 'manual', warnings: [],
      };
      const res = await confirmReceipts([item], { email: user?.email || '', name: user?.name || '' });
      if (res.skipped.length) { toast(`บันทึกไม่ได้: ${res.skipped[0].reason}`, 'error'); return; }
      logAudit({
        action: 'create', entityType: 'order', entityName: `ออเดอร์ ${ono}`, entityId: ono,
        summary: `เพิ่มออเดอร์ ${ono} · ${lines.length} รายการ · ${fmtB(item.total)} (${user?.name || user?.email})`,
        fields: [
          { label: 'เลขที่', value: ono },
          { label: 'ยอดขาย', value: fmtB(item.total) },
          { label: 'จำนวน', value: `${lines.reduce((a, l) => a + N(l.qty), 0)} ตัว` },
          { label: 'รายการ', value: `${lines.length} รายการ` },
          { label: 'ช่องทาง', value: f.channel || '—' },
          { label: 'ประเภทงาน', value: f.job_type || '—' },
          { label: 'การชำระ', value: f.payment || '—' },
          { label: 'ลูกค้า', value: f.customer_name.trim() || '—' },
          { label: 'จังหวัด', value: f.province.trim() || '—' },
          { label: 'วันที่', value: f.order_date || '—' },
          { label: 'เซลล์', value: user?.name || user?.email || '—' },
        ],
        data: { order_no: ono, lines, total: item.total, channel: f.channel },
      });
      toast(`บันทึกแล้ว ${ono} ✓ — คีย์ต่อได้เลย`, 'success');
      genOnoRef.current = null;
      onSaved?.();
      // เคลียร์เฉพาะรายการ/ยอด/ลูกค้า — คงวันที่/ช่องทาง/งาน/ชำระ ไว้คีย์ต่อเร็ว
      setF(p => ({ ...blank(), order_date: p.order_date, channel: p.channel, job_type: p.job_type, payment: p.payment }));
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <SideSheet size="lg" icon="pencil" title="เพิ่มออเดอร์" sub={`เซลล์ ${user?.name || user?.email || '—'} · บันทึกแล้วคีย์ใบต่อไปได้เลย`} onClose={onClose}
      footer={<>
        <span className="mr-auto text-sm"><span style={{ color: 'var(--ink-4)' }}>รวม </span><b style={{ color: 'var(--accent)' }}>{fmtB(effectiveTotal)}</b></span>
        <Button variant="outline" onClick={onClose}>ปิด</Button>
        <Button disabled={busy} title={!valid ? 'ต้องมี ช่องทาง + รายการ (ลาย/จำนวน/ราคา) อย่างน้อย 1' : undefined} onClick={save}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกออเดอร์'}</Button>
      </>}>
      <OrderForm f={f} setF={setF} mode="add" paymentOptions={RECEIPT_PAYMENTS} lockedSeller={user?.name || user?.email || '—'} />
    </SideSheet>
  );
}
