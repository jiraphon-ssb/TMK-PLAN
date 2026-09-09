/* ============================================================
   orderDrawer.jsx — ลิ้นชักดู/แก้/ยกเลิกออเดอร์ (PART 84 REFACTOR-1 · แยกจาก views-orders god-file)
   ============================================================
   MpOrdersView (views-orders.jsx) เรียก <OrderDrawer/> ตอนเปิดออเดอร์ · behavior-preserving
   ============================================================ */
import { useState, useEffect, useRef } from 'react';
import { B, N, Icon } from './components.jsx';
import { THAI_MONTHS } from './lib/dateUtils.js';
import { SideSheet } from './modals-core.jsx';
import { channelColor } from './charts.jsx';
import { skuOverrideKey } from './lib/designResolve.js';
import { qtyBand } from './lib/mpReport.js';
import { buildLineSku, lineDisplayName, findDesign } from './components/ProductPicker.jsx';
import { CardTable } from './components/DataTableParts.jsx';
import { supabase } from './lib/supabaseClient.js';
import { invalidateSaleCache } from './lib/saleData.js';
import { versionedUpdate, promptConflictResolution, mergeVersionedUpdate } from './lib/optimisticUpdate.js';
import { voidReceipt, restoreReceipt, uploadReceiptFile, canEditReceipt } from './lib/receiptSubmit.js';
import { PAYMENT_TYPES } from './lib/saleFields.js';
import { logAudit, diffFields } from './lib/audit.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast, confirm, userName, userEmail, isAdmin, canEdit as appCanEdit } from './lib/appBus.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DrawerField, DrawerGroup, MoneyCard, ReceiptPdfModal, _pageList } from './saleWidgets.jsx';
import { MoneySummaryRows, payLabel } from './orderCard.jsx';
import { OrderForm, skuToLine, sumLines, lineAmount } from './orderForm.jsx';

const custCodeShow = (code, name, phone) => { const c = String(code || '').replace(/^[PSN]/, '').trim(); return c && c !== String(name || '').trim() && c !== String(phone || '').trim() ? c : ''; };   // ซ่อนรหัสถ้าซ้ำชื่อ/เบอร์ (เดิมโชว์เบอร์ 2 ที่)
const fmtD = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${Number(m[3])} ${THAI_MONTHS[Number(m[2]) - 1]} ${String(Number(m[1]) + 543).slice(2)}` : (iso || '—'); };
// label ฟิลด์ในฟอร์มแก้ = จางเล็ก 11px (หัวข้อกลุ่ม FormSection เด่นกว่า — ลำดับชั้นถูกทาง · PART 81.5)
export function OrderDrawer({ order: o, sk, buildDesigns, sellerOptions = [], onClose, onSaved, onChanged }) {
  const designs = buildDesigns(sk);
  const jt = o.job_type || 'ปลีก';
  const jtCls = { DFT: 'chip-accent', OEM: 'chip-warn' }[jt] || '';
  const hasOv = !!o._ov;                                   // ออเดอร์นี้เคยแก้มือไหม
  const isReceipt = (o.source || '') === 'shipnity';       // มาจากใบเสร็จ — ยกเลิกผ่านระบบใบเสร็จ (ส่งใหม่ได้)
  const isCancelled = o.status === 'cancelled';            // ยกเลิกแล้ว → ปุ่มเป็น "นำกลับมา"
  const [edit, setEdit] = useState(null);                  // null | ฟอร์มแก้เต็มทุกช่อง
  const [busy, setBusy] = useState(false);
  // โหมดแก้ไขครบจบ (PART 88.2) — รายการสินค้า editable ทุกบรรทัด + ลบ/เพิ่ม (เขียนตอน "บันทึกทั้งหมด" ทีเดียว)
  // รายการสินค้า/บรรทัดที่ลบ อยู่ใน edit.lines / edit._delIds (ฟอร์มกลาง OrderForm จัดการ · PART 88.3)
  const [fin, setFin] = useState(null);                    // ราคาเสื้อ/ส่วนลด/ค่าส่ง/VAT จาก attrs (โหลด lazy ตอนเปิด — attrs ไม่อยู่ใน ORDERS_SEL กัน egress)
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await supabase.from('tmk_mp_orders').select('attrs').eq('order_no', o.order_no).eq('source', o.source || '').maybeSingle();
        if (cancel) return;
        const a = data?.attrs || {};
        setFin({ subtotal: a.subtotal, discount: a.discount, shipping: a.shipping, vat: a.vat, promo: a.promo_code });
      } catch { /* attrs optional */ }
    })();
    return () => { cancel = true; };
  }, [o.order_no, o.source]);
  // B2 กันส่วนลด/ค่าส่ง/VAT หาย: ถ้ากด "แก้ไข" ก่อน attrs โหลดเสร็จ (ช่องเงินยังว่าง) — พอ attrs มา เติมช่องที่ยังว่างให้
  useEffect(() => {
    if (fin == null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- เติมช่องเงินจาก attrs ที่โหลด async มาทีหลัง (เฉพาะช่องที่ยังว่าง · ไม่ทับที่ผู้ใช้พิมพ์) — รื้อเป็น derive ตอน render เสี่ยงส่วนลด/ค่าส่ง/VAT เพี้ยน
    setEdit(prev => {
      if (!prev) return prev;
      let changed = false; const next = { ...prev };
      for (const k of ['subtotal', 'discount', 'shipping', 'vat']) {
        if ((next[k] === '' || next[k] == null) && fin[k] != null) { next[k] = fin[k]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [fin]);
  // ไฟล์ใบเสร็จ (PDF) — ออเดอร์จากใบเสร็จ (source=shipnity) มีแถวใน tmk_sale_receipts · โหลด lazy ตอนเปิด
  const [rec, setRec] = useState(undefined);              // undefined=กำลังโหลด · null=ไม่มีใบเสร็จ · obj=แถวใบเสร็จ
  const [attaching, setAttaching] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);          // popup ฝัง PDF ใบเสร็จ
  const attachRef = useRef(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- รีเซ็ตสถานะโหลดใบเสร็จเมื่อสลับออเดอร์ (undefined=โหลด → null=ไม่มี) ก่อน fetch async ในบล็อกเดียวกัน
    if (!isReceipt) { setRec(null); return; }
    let cancel = false;
    (async () => {
      try {
        const { data } = await supabase.from('tmk_sale_receipts')
          .select('id,order_no,file_url,uploader_email,status,created_at').eq('order_no', o.order_no).maybeSingle();
        if (!cancel) setRec(data || null);
      } catch { if (!cancel) setRec(null); }
    })();
    return () => { cancel = true; };
  }, [o.order_no, isReceipt]);
  const ovId = `${o.source || ''}:${o.order_no}`;
  // แนบ/เปลี่ยนไฟล์ใบเสร็จจากหน้าออเดอร์ (เหมือนหน้าส่งยอด) — อัปเดต file_url ที่ tmk_sale_receipts
  const attachReceiptToOrder = async (file) => {
    if (!file || !rec) return;
    setAttaching(true);
    try {
      const url = await uploadReceiptFile(file, rec.order_no);
      if (!url) { toast('อัปโหลดไม่สำเร็จ — รัน migration 20260704 (bucket รับ PDF) แล้วหรือยัง?', 'error'); return; }
      const { error } = await supabase.from('tmk_sale_receipts').update({ file_url: url }).eq('order_no', rec.order_no);
      if (error) { toast('บันทึกลิงก์ไม่สำเร็จ: ' + error.message, 'error'); return; }
      toast('แนบไฟล์ใบเสร็จแล้ว', 'success');
      setRec(r => r ? { ...r, file_url: url } : r);
    } catch (e) { toast('แนบไฟล์ไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setAttaching(false); }
  };
  const startEdit = () => {
    setEdit({
      order_date: o.order_date || '', channel: o.channel || '', job_type: jt,
      payment: PAYMENT_TYPES.includes(o.payment_type) ? o.payment_type : (o.payment_type || 'ไม่ระบุ'),
      total: String(o.sales ?? ''), qty: String(o.qty ?? ''),
      customer_name: o.customer_name || '', customer_type: o.customer_type || 'ลูกค้าใหม่',
      customer_phone: o.customer_phone || '', customer_social: o.customer_social || '',
      customer_address: '',
      province: o.province || '', salesperson: o.salesperson || '', note: o.note || '',
      // เงินละเอียด (attrs) — ราคาเสื้อ/ส่วนลด/ค่าส่ง/VAT แก้ได้
      subtotal: fin?.subtotal ?? '', discount: fin?.discount ?? '', shipping: fin?.shipping ?? '', vat: fin?.vat ?? '',
      // รายการสินค้า (ฟอร์มกลาง unit-price) + คิว id ที่ลบ (OrderForm ดันเข้า _delIds)
      // B3: ลายที่ไม่อยู่ในแคตตาล็อก → เปิดโหมด "พิมพ์เอง" (กันสี/ไซซ์เดิมหายใน select มาตรฐาน)
      lines: sk.map(s => skuToLine(s, !!findDesign(s.design))), _delIds: [],
    });
    // ที่อยู่อยู่ที่โปรไฟล์ลูกค้า (ไม่มีคอลัมน์บนออเดอร์) — prefill best-effort ถ้ายังไม่พิมพ์ทับ
    if (o.customer_code) {
      supabase.from('tmk_mp_customers').select('address').eq('customer_code', o.customer_code).maybeSingle()
        .then(({ data }) => { if (data?.address) setEdit(prev => prev && prev.customer_address === '' ? { ...prev, customer_address: data.address } : prev); })
        .catch(() => { /* โปรไฟล์ optional */ });
    }
  };

  // บันทึก: อัปเดตตรงที่ tmk_mp_orders (มีผลทุกรายงานทันที) + override field ที่รองรับ (ประกันข้าม reimport)
  // + ใบเสร็จ: sync แถว tmk_sale_receipts ให้ feed ส่งยอดตรงกัน
  const saveOrder = async () => {
    if (Number(edit?.total) < 0) { toast('ยอดขายต้องไม่ติดลบ', 'error'); return; }
    if (!appCanEdit()) { toast('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว"', 'warn'); return; }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      // ยอดขาย = ที่กรอก (ว่าง → ผลรวมรายการ) · จำนวน = จาก edit.qty (ฟอร์มเติมจากบรรทัดให้อัตโนมัติ)
      const salesN = Number(edit.total) > 0 ? Number(edit.total) : sumLines(edit.lines);
      const qtyN = Number(edit.qty) || 0;
      const patch = {
        order_date: edit.order_date || null,
        order_month: (edit.order_date || o.order_month || '').slice(0, 7),
        channel: edit.channel, job_type: edit.job_type,
        payment_type: edit.payment,
        cod_amount: edit.payment === 'COD' ? salesN : 0,
        sales: salesN, qty: qtyN, qty_band: qtyBand(qtyN),
        customer_name: edit.customer_name.trim(), customer_type: edit.customer_type,
        customer_phone: edit.customer_phone.trim(), customer_social: edit.customer_social.trim(),
        province: edit.province.trim(), salesperson: edit.salesperson.trim(), note: edit.note.trim(),
        updated_at: now,
      };
      {
        // Phase 3.5 (§9.1): guard ด้วย row_version → conflict = three-way merge (auto-merge ช่องไม่ชน · critical ถาม user รายช่อง)
        // abort ก่อนเขียน override/profile/sku ถ้า user เลือกโหลดล่าสุด (กัน partial write)
        const match = { order_no: o.order_no, source: o.source || '' };
        // apply แบบ schema-tolerant (customer_phone อาจยังไม่รัน migration 20260715)
        const apply = async (p, ev) => {
          let rr = await versionedUpdate(supabase, 'tmk_mp_orders', match, p, ev);
          if (!rr.ok && !rr.conflict && /customer_phone/i.test(rr.error?.message || '')) {
            const { customer_phone: _p, ...slim } = p;
            rr = await versionedUpdate(supabase, 'tmk_mp_orders', match, slim, ev);
          }
          return rr;
        };
        const r = await mergeVersionedUpdate({ supabase, table: 'tmk_mp_orders', match, base: o, patch, expectedVersion: o.row_version, entity: 'ออเดอร์', apply });
        if (r.reloaded) { onClose(); onChanged?.(); return; }                               // user เลือกโหลดล่าสุด
        if (r.raced) { toast('มีคนแก้ซ้อนอีกครั้ง — รีเฟรชแล้วลองใหม่', 'warn'); onClose(); onChanged?.(); return; }
        if (!r.ok) throw r.error || new Error('บันทึกไม่สำเร็จ');
        if (r.merged) toast(r.auto ? 'มีคนแก้พร้อมกัน — รวมให้อัตโนมัติแล้ว' : 'บันทึกตามที่เลือกแล้ว', 'success');
        // 3.3: ถ้า merge/แก้ชนกันแล้วออเดอร์จริงได้ค่าอื่น (r.data) → override ต้องตามแถวจริง ไม่งั้น override ยัด patch กลับทับผล merge
        if (r.data) for (const k of ['sales', 'qty', 'channel', 'payment_type', 'job_type', 'customer_name', 'customer_type', 'salesperson', 'note', 'province', 'cod_amount', 'customer_phone', 'customer_social', 'order_date']) { if (r.data[k] !== undefined) patch[k] = r.data[k]; }
      }
      let skuOk = true;   // 1.1: บรรทัดสินค้าเซฟพลาด → เตือน ไม่โชว์ "สำเร็จ" ลอยๆ
      try {
        // mirror ทุกช่องที่แก้ลง override (ประกันข้าม reimport มาร์เก็ตเพลส) — graceful ตัดคอลัมน์ใหม่ถ้ายังไม่ migrate
        const ovRow = { order_id: ovId, job_type: patch.job_type, customer_name: patch.customer_name, customer_type: patch.customer_type, salesperson: patch.salesperson, note: patch.note, channel: patch.channel, payment_type: patch.payment_type, sales: patch.sales, qty: patch.qty, province: patch.province, order_date: patch.order_date, cod_amount: patch.cod_amount, customer_phone: patch.customer_phone, customer_social: patch.customer_social, updated_at: now };
        let { error: ovErr } = await supabase.from('tmk_order_overrides').upsert(ovRow, { onConflict: 'order_id' });
        if (ovErr && /channel|payment_type|sales|qty|province|order_date|cod_amount|customer_phone|customer_social|column/i.test(ovErr.message || '')) {
          const base = { order_id: ovId, job_type: patch.job_type, customer_name: patch.customer_name, customer_type: patch.customer_type, salesperson: patch.salesperson, note: patch.note, updated_at: now };
          await supabase.from('tmk_order_overrides').upsert(base, { onConflict: 'order_id' });
        }
      } catch { /* ตาราง override ยังไม่มี — ค่าตรงบันทึกแล้ว */ }
      // เบอร์/โซเชียล/ที่อยู่ → อัปเดตโปรไฟล์ลูกค้า (best-effort · เฉพาะช่องที่มีค่า กันทับของเดิมด้วยค่าว่าง)
      try {
        const code = o.customer_code || '';
        const addr = (edit.customer_address || '').trim();
        if (code && (patch.customer_phone || patch.customer_social || addr)) {
          const prof = { customer_code: code, updated_at: now };
          if (patch.customer_name) prof.name = patch.customer_name;
          if (patch.customer_phone) prof.phone = patch.customer_phone;
          if (patch.customer_social) prof.social_name = patch.customer_social;
          if (patch.province) prof.province = patch.province;
          if (addr) prof.address = addr;
          await supabase.from('tmk_mp_customers').upsert(prof, { onConflict: 'customer_code' });
        }
      } catch { /* โปรไฟล์ optional */ }
      if (isReceipt) {
        try { await supabase.from('tmk_sale_receipts').update({ channel: patch.channel, order_date: patch.order_date, order_month: patch.order_month, sales: patch.sales, qty: patch.qty, salesperson: patch.salesperson, updated_at: now }).eq('order_no', o.order_no); } catch { /* เงียบ */ }
      }
      // รายการสินค้า — เขียนตามที่แก้จริงในฟอร์มกลาง (PART 88.3 · line_sales = qty×price)
      const editLines = edit.lines || [];
      const delIds = edit._delIds || [];
      try {
        // ลบบรรทัดที่กด 🗑 (+ ล้าง override ของบรรทัดนั้น กัน orphan — pattern PART 72)
        for (const id of delIds) {
          await supabase.from('tmk_mp_skus').delete().eq('id', id);
        }
        const delRaws = sk.filter(s => delIds.includes(s.id)).map(s => s.raw_sku_or_name).filter(Boolean);
        for (const raw of delRaws) {
          try { await supabase.from('tmk_sku_overrides').delete().eq('key', skuOverrideKey(o.order_no, raw)); } catch { /* optional */ }
        }
        for (let i = 0; i < editLines.length; i++) {
          const l = editLines[i];
          if (!String(l.design || '').trim() && !(Number(l.qty) > 0)) continue;  // บรรทัดว่าง — ข้าม
          const baseCode = (l.code || '').trim();
          const fullCode = l.mode === 'manual' ? baseCode : (buildLineSku(baseCode, l.color, l.size) || baseCode);
          // B1: บรรทัดที่ไม่ถูกแตะจำนวน/ราคา → line_sales เดิมเป๊ะ (ไม่ให้ปัดเศษทำยอดขยับ) · B4: raw ใช้ชื่อเต็ม ลาย(สี-ไซซ์)
          const row = { design: (l.design || '').trim(), product_code: fullCode, color: l.color || '', size: l.size || '', qty: Number(l.qty) || 0, line_sales: lineAmount(l) };
          /* ⚠️ ต้องอัปเดต order_date/order_month ของบรรทัดขายด้วย
             เดิมอัปเดตแค่ลาย/สี/ไซซ์/จำนวน/ยอด → แก้วันที่ออเดอร์แล้วบรรทัดขายยังค้างวันเดิม
             ผลคือ (ก) สต็อกไม่หักในเดือนใหม่ (balanceFromMoves ดูจาก sku.order_date)
                   (ข) ออเดอร์ใบเดียวแตกเป็น 2 วัน (บรรทัดเก่าวันเดิม + บรรทัดใหม่วันใหม่)
             บรรทัด INSERT ด้านล่างใส่ครบอยู่แล้ว — ขาดเฉพาะทาง UPDATE */
          if (l.id) await supabase.from('tmk_mp_skus').update({ ...row, order_date: patch.order_date, order_month: patch.order_month }).eq('id', l.id);
          else await supabase.from('tmk_mp_skus').insert({ id: `${o.source || 'manual'}:${o.order_no}:edit:${Date.now()}:${i}`, order_no: o.order_no, source: o.source || '', channel: patch.channel, order_month: patch.order_month, order_date: patch.order_date, raw_sku_or_name: lineDisplayName(row.design, row.color, row.size) || row.design, match_how: 'manual', ...row });
          // เปลี่ยนลาย/รหัส → override กันหายตอน reimport (เฉพาะบรรทัดเดิมที่มี raw)
          if (l.id && l.raw && (row.design !== l._design0 || fullCode !== l._code0)) {
            try { await supabase.from('tmk_sku_overrides').upsert({ key: skuOverrideKey(o.order_no, l.raw), order_no: o.order_no, design: row.design, product_code: fullCode, updated_at: now }, { onConflict: 'key' }); } catch { /* optional */ }
          }
        }
      } catch { skuOk = false; /* บรรทัดพลาดบางส่วน — order-level บันทึกแล้ว แต่ต้องเตือน */ }
      // เงินละเอียด (ราคาเสื้อ/ส่วนลด/ค่าส่ง/VAT) → attrs ของออเดอร์ (merge คีย์อื่นคงเดิม) — เดิมแก้จากหน้าจอไหนไม่ได้เลย
      const numOr = (v) => (v === '' || v == null) ? null : (Number(v) || 0);
      const finPatch = { subtotal: numOr(edit.subtotal), discount: numOr(edit.discount), shipping: numOr(edit.shipping), vat: numOr(edit.vat) };
      const finChanged = ['subtotal', 'discount', 'shipping', 'vat'].some(k => (finPatch[k] ?? null) !== (numOr(fin?.[k]) ?? null));
      if (finChanged) {
        try {
          const { data: cur } = await supabase.from('tmk_mp_orders').select('attrs').eq('order_no', o.order_no).eq('source', o.source || '').maybeSingle();
          const a = { ...(cur?.attrs || {}) };
          for (const k of ['subtotal', 'discount', 'shipping', 'vat']) {
            if (finPatch[k] == null || finPatch[k] === 0) delete a[k]; else a[k] = finPatch[k];
          }
          await supabase.from('tmk_mp_orders').update({ attrs: a }).eq('order_no', o.order_no).eq('source', o.source || '');
          setFin({ subtotal: a.subtotal, discount: a.discount, shipping: a.shipping, vat: a.vat, promo: a.promo_code });
        } catch { /* attrs optional */ }
      }
      // ใบเสร็จ: sync confirmed payload ให้ restore/รายงานใบเสร็จตรงกับที่แก้
      if (isReceipt && (editLines.length || finChanged)) {
        try {
          const { data: rc } = await supabase.from('tmk_sale_receipts').select('confirmed').eq('order_no', o.order_no).maybeSingle();
          const cf = rc?.confirmed;
          if (cf) {
            cf.lines = editLines.filter(l => String(l.design || '').trim() || Number(l.qty) > 0).map(l => ({ name: lineDisplayName((l.design || '').trim(), l.color, l.size) || (l.design || '').trim(), code: l.mode === 'manual' ? (l.code || '').trim() : (buildLineSku((l.code || '').trim(), l.color, l.size) || (l.code || '').trim()), qty: Number(l.qty) || 0, unit_price: Number(l.price) || 0, amount: lineAmount(l) }));
            cf.total = patch.sales;
            if (finPatch.subtotal != null) cf.subtotal = finPatch.subtotal;   // 1.5: ราคาเสื้อว่าง → คงของเดิม ไม่ทับด้วยยอดรวม (กัน restore เสียราคาก่อนลด)
            if (finPatch.discount != null) cf.discount = finPatch.discount; else delete cf.discount;
            if (finPatch.shipping != null) cf.shipping = finPatch.shipping; else delete cf.shipping;
            if (finPatch.vat != null) cf.vat = finPatch.vat; else delete cf.vat;
            await supabase.from('tmk_sale_receipts').update({ confirmed: cf }).eq('order_no', o.order_no);
          }
        } catch { /* เงียบ — restore จะใช้ payload เดิม */ }
      }
      logAudit({
        action: 'update', entityType: 'order', entityName: o.order_no, entityId: o.order_no,
        summary: `แก้ออเดอร์ ${o.order_no} (${patch.channel} · ฿${patch.sales})`,
        changes: diffFields(o, patch, [
          ['channel', 'ช่องทาง'], ['sales', 'ยอดขาย'], ['qty', 'จำนวน'], ['job_type', 'ประเภทงาน'],
          ['payment_type', 'การชำระ'], ['customer_name', 'ลูกค้า'], ['customer_type', 'ประเภทลูกค้า'],
          ['province', 'จังหวัด'], ['salesperson', 'เซลล์'], ['customer_phone', 'เบอร์'], ['note', 'หมายเหตุ'],
        ]),
        fields: [
          { label: 'เลขที่', value: o.order_no },
          { label: 'ช่องทาง', value: patch.channel || '—' },
          { label: 'ยอดขาย', value: `฿${Number(patch.sales || 0).toLocaleString()}` },
          { label: 'จำนวน', value: `${patch.qty || 0} ตัว` },
          { label: 'ประเภทงาน', value: patch.job_type || '—' },
          { label: 'การชำระ', value: patch.payment_type || '—' },
          { label: 'ลูกค้า', value: patch.customer_name || '—' },
          { label: 'จังหวัด', value: patch.province || '—' },
          { label: 'เซลล์', value: patch.salesperson || '—' },
          { label: 'วันที่', value: patch.order_date || o.order_date || '—' },
          ...(editLines.length ? [{ label: 'รายการสินค้า', value: `${editLines.length} บรรทัด${delIds.length ? ` · ลบ ${delIds.length}` : ''}` }] : []),
          ...(finChanged ? [{ label: 'เงินละเอียด', value: `ส่วนลด ${finPatch.discount ?? 0} · ส่ง ${finPatch.shipping ?? 0} · VAT ${finPatch.vat ?? 0}` }] : []),
        ],
      });
      toast(skuOk ? 'บันทึกการแก้ไขแล้ว — ยอดในรายงานอัปเดตทันที' : 'บันทึกหัวออเดอร์แล้ว แต่รายการสินค้าบางบรรทัดไม่สำเร็จ — เปิดแก้อีกครั้ง', skuOk ? 'success' : 'warn');
      setEdit(null); onChanged ? onChanged() : onSaved?.();
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setBusy(false); }
  };
  const revertOrder = async () => {
    setBusy(true);
    const { error } = await supabase.from('tmk_order_overrides').delete().eq('order_id', ovId);
    setBusy(false);
    if (error) { toast('คืนค่าไม่สำเร็จ', 'error'); return; }
    toast('คืนค่าออเดอร์เป็นค่าจากไฟล์แล้ว', 'success');
    setEdit(null); onSaved && onSaved();
  };
  // ยกเลิกออเดอร์ — ใบเสร็จ: void ผ่านระบบใบเสร็จ (ยอดหาย+ส่งใหม่ได้) · มาร์เก็ตเพลส: mark cancelled
  const cancelOrder = async () => {
    if (!appCanEdit()) { toast('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว"', 'warn'); return; }
    if (!await confirm({ title: 'ยกเลิกออเดอร์', body: `ยกเลิก ${o.order_no}?\nยอดจะถูกตัดออกจากรายงานทันที${isReceipt ? ' (ส่งใบเสร็จซ้ำได้)' : ''}`, danger: true, confirmText: 'ยกเลิกออเดอร์' })) return;
    setBusy(true);
    try {
      if (isReceipt) await voidReceipt({ order_no: o.order_no }, { by: userName() || userEmail() || '', reason: 'ยกเลิกจากหน้าออเดอร์' });
      else {
        // Phase 3.2 (OCC §9): guard ด้วย row_version — คนอื่นแก้ออเดอร์นี้ก่อน = conflict (ไม่ทับสถานะเงียบ)
        const match = { order_no: o.order_no, source: o.source || '' };
        const patch = { status: 'cancelled', updated_at: new Date().toISOString() };
        let r = await versionedUpdate(supabase, 'tmk_mp_orders', match, patch, o.row_version);
        if (r.conflict) {
          const choice = await promptConflictResolution({ entity: 'ออเดอร์', changedFields: ['status'] });
          if (choice !== 'overwrite') { onClose(); onChanged?.(); return; }
          r = await versionedUpdate(supabase, 'tmk_mp_orders', match, patch);
        }
        if (!r.ok) throw r.error || new Error('ยกเลิกไม่สำเร็จ');
        invalidateSaleCache('tmk_mp_orders'); invalidateSaleCache('tmk_mp_skus');   // 1.8: mark write → กัน echo ตัวเองย้อนกลับมา reload ซ้ำ
        logAudit({ action: 'delete', entityType: 'order', entityName: o.order_no, entityId: o.order_no, severity: 'warn', summary: `ยกเลิกออเดอร์ ${o.order_no}`, fields: [{ label: 'เลขที่', value: o.order_no }, { label: 'ยอดขาย', value: `฿${Number(o.sales || 0).toLocaleString()}` }, { label: 'ช่องทาง', value: o.channel || '—' }, { label: 'ลูกค้า', value: o.customer_name || '—' }, { label: 'เซลล์', value: o.salesperson || '—' }] });
      }
      toast('ยกเลิกออเดอร์แล้ว — ยอดถูกตัดออกจากรายงาน', 'success');
      onClose(); onChanged?.();
    } catch (e) { toast('ยกเลิกไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setBusy(false); }
  };
  // นำกลับมา — ใบเสร็จ: un-void + สร้าง sku คืนจาก payload · มาร์เก็ตเพลส: mark active
  const restoreOrder = async () => {
    if (!appCanEdit()) { toast('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว"', 'warn'); return; }
    if (!await confirm({ title: 'นำออเดอร์กลับมา', body: `นำ ${o.order_no} กลับมาใช้งาน?\nยอดจะกลับเข้ารายงานทันที`, confirmText: 'นำกลับมา' })) return;
    setBusy(true);
    try {
      if (isReceipt) await restoreReceipt({ order_no: o.order_no }, { by: userName() || userEmail() || '' });
      else {
        // Phase 3.2 (OCC §9): guard ด้วย row_version
        const match = { order_no: o.order_no, source: o.source || '' };
        const patch = { status: 'active', updated_at: new Date().toISOString() };
        let r = await versionedUpdate(supabase, 'tmk_mp_orders', match, patch, o.row_version);
        if (r.conflict) {
          const choice = await promptConflictResolution({ entity: 'ออเดอร์', changedFields: ['status'] });
          if (choice !== 'overwrite') { onClose(); onChanged?.(); return; }
          r = await versionedUpdate(supabase, 'tmk_mp_orders', match, patch);
        }
        if (!r.ok) throw r.error || new Error('นำกลับไม่สำเร็จ');
        invalidateSaleCache('tmk_mp_orders');
        logAudit({ action: 'restore', entityType: 'order', entityName: o.order_no, entityId: o.order_no, summary: `นำออเดอร์ ${o.order_no} กลับมา`, fields: [{ label: 'เลขที่', value: o.order_no }, { label: 'ยอดขาย', value: `฿${Number(o.sales || 0).toLocaleString()}` }, { label: 'ช่องทาง', value: o.channel || '—' }, { label: 'ลูกค้า', value: o.customer_name || '—' }] });
      }
      toast('นำออเดอร์กลับมาแล้ว — ยอดกลับเข้ารายงาน', 'success');
      onClose(); onChanged?.();
    } catch (e) { toast('นำกลับไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setBusy(false); }
  };
  // ลบถาวร — เอาออกทุกตาราง (ออเดอร์ + รายการสินค้า + override + ใบเสร็จ) ย้อนกลับไม่ได้
  const deleteOrder = async () => {
    if (!appCanEdit()) { toast('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว"', 'warn'); return; }
    if (!await confirm({ title: 'ลบออเดอร์ถาวร', body: `ลบ ${o.order_no} ออกจากระบบถาวร?\nรายการสินค้า${isReceipt ? ' + ใบเสร็จ' : ''} จะถูกลบด้วย — ย้อนกลับไม่ได้`, danger: true, confirmText: 'ลบถาวร' })) return;
    setBusy(true);
    try {
      await supabase.from('tmk_mp_skus').delete().eq('source', o.source || '').eq('order_no', o.order_no);
      /* .eq('source','') ไม่แมตช์แถวที่ source เป็น NULL → ลบ 0 แถว ไม่มี error แล้ว toast บอกว่าสำเร็จ
         (หน้าออเดอร์คัดกรณีนี้ออกอยู่แล้ว — ทางลบทีละใบในลิ้นชักยังไม่ได้กัน) */
      if (!o.source) throw new Error('ออเดอร์ใบนี้ไม่มีช่องทาง (source) — ลบจากหน้าออเดอร์แทน');
      { const r = await supabase.from('tmk_mp_orders').delete().eq('order_no', o.order_no).eq('source', o.source).select('order_no');
        if (r.error) throw r.error;
        if (!r.data || !r.data.length) throw new Error('ไม่พบออเดอร์ใบนี้ในฐานข้อมูล (อาจถูกลบไปแล้ว)'); }
      try { await supabase.from('tmk_order_overrides').delete().eq('order_id', ovId); } catch { /* optional */ }
      try { await supabase.from('tmk_sku_overrides').delete().eq('order_no', o.order_no); } catch { /* optional — กัน override ลายบรรทัดค้างเป็น orphan */ }
      if (isReceipt) { try { await supabase.from('tmk_sale_receipts').delete().eq('order_no', o.order_no); } catch { /* optional */ } }
      logAudit({ action: 'purge', entityType: 'order', entityName: o.order_no, entityId: o.order_no, severity: 'warn', summary: `ลบออเดอร์ ${o.order_no} ถาวร (฿${o.sales})`, fields: [{ label: 'เลขที่', value: o.order_no }, { label: 'ยอดขาย', value: `฿${Number(o.sales || 0).toLocaleString()}` }, { label: 'ช่องทาง', value: o.channel || '—' }, { label: 'ลูกค้า', value: o.customer_name || '—' }, { label: 'เซลล์', value: o.salesperson || '—' }] });
      toast('ลบออเดอร์ถาวรแล้ว', 'success');
      onClose(); onChanged?.();
    } catch (e) { toast('ลบไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setBusy(false); }
  };
  // saveLine รายบรรทัดถูกยุบเข้า "บันทึกทั้งหมด" ของโหมดแก้ไขครบจบ (PART 88.2)
  const stMap = { completed: 'สำเร็จ', delivered: 'ส่งแล้ว', cancelled: 'ยกเลิก', pending: 'รอดำเนินการ', processing: 'กำลังทำ', shipped: 'จัดส่งแล้ว' };
  // COD เต็มจำนวน (ยอด COD = ยอดขาย) → โชว์ป้าย "เก็บปลายทาง" แทนเลขซ้ำ · COD บางส่วน → โชว์เลขจริง
  const isFullCod = o.cod_amount > 0 && Number(o.cod_amount) === Number(o.sales);
  const money = [{ label: 'ยอดขาย', val: B(o.sales), badge: isFullCod ? 'เก็บปลายทาง (COD)' : '' }];
  if (o.mkt_commission > 0) money.push({ label: 'ค่าธรรมเนียม', val: '−' + B(o.mkt_commission) });
  if (o.cod_amount > 0 && !isFullCod) money.push({ label: 'ยอด COD', val: B(o.cod_amount) });
  // PART 88.1: โหมดดู — ปุ่มจัดการย้ายเข้าการ์ด "ไฟล์ใบเสร็จ & จัดการ" (ไม่มี footer bar) · โหมดแก้ไขคง footer "ปิด"
  // โหมดแก้ไข: ปุ่มทั้งหมดอยู่ footer เดียว (เดิมมีแถบปุ่มกลางเนื้อหา + footer "ปิด" ซ้อนกัน 2 ชั้น)
  const footerActions = edit ? (
    <div className="row" style={{ width: '100%', gap: 8, alignItems: 'center' }}>
      {hasOv && <Button variant="ghost" size="sm" style={{ color: 'var(--bad)' }} onClick={revertOrder} disabled={busy} title="ล้างค่าที่แก้มือทั้งหมด กลับไปใช้ค่าจากไฟล์ใบเสร็จ/นำเข้า"><Icon name="refresh" /> คืนค่าจากไฟล์</Button>}
      <span style={{ marginLeft: 'auto' }} />
      <Button variant="outline" onClick={() => setEdit(null)} disabled={busy}>ยกเลิก</Button>
      <Button onClick={saveOrder} disabled={busy} title={Number(edit.total) < 0 ? 'ยอดขายต้องไม่ติดลบ' : undefined}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกทั้งหมด'}</Button>
    </div>
  ) : undefined;
  // หัว drawer สะอาด — ชื่อออเดอร์อย่างเดียว (ช่องทาง/วันที่/ยอด ไปอยู่การ์ด "ข้อมูลออเดอร์" + กล่องยอด · PART 88.1)
  return <SideSheet size="lg" icon={edit ? 'pencil' : 'listChecks'} title={`${edit ? 'แก้ไข' : 'ออเดอร์'} ${o.order_no}`} sub={edit ? 'แก้ตรงช่องได้ทุกจุด · บันทึกครั้งเดียว มีผลกับรายงานทันที' : undefined}
    onClose={onClose} footer={footerActions}>
    {(isCancelled || sk.length === 0 || designs.some(d => d.design === '(จับคู่ไม่ได้)')) && (
      <div className="quality-row items-center">
        {isCancelled && <Badge variant="secondary" className="rounded-full text-[10px] font-medium bg-red-500/15 text-red-600 dark:text-red-400">ยกเลิกแล้ว</Badge>}
        {sk.length === 0 && <Badge variant="warning" className="rounded-full text-[10px] font-medium">ไม่มี SKU</Badge>}
        {designs.some(d => d.design === '(จับคู่ไม่ได้)') && <Badge variant="warning" className="rounded-full text-[10px] font-medium">มีลายจับคู่ไม่ได้</Badge>}
      </div>
    )}

    {edit && <OrderForm f={edit} setF={setEdit} mode="edit" paymentOptions={PAYMENT_TYPES} sellerOptions={sellerOptions} />}

    {/* ยอดเงิน — การ์ดเดียว: ยอดเด่น + COD badge + เซลล์เสริม (ค่าธรรมเนียม/COD) + แยกราคา (ไม่โชว์ยอดซ้ำ) */}
    {!edit && <MoneyCard total={o.sales} codBadge={isFullCod ? 'เก็บปลายทาง (COD)' : ''} extras={money.slice(1)} discount={fin?.discount} />}

    {/* ===== Order Summary (Lemon · PART 88.1) — รายการสินค้า + สรุปเงิน เป็นบล็อกเดียวถัดจากยอด (ซ่อนตอนแก้ — ฟอร์มมีของตัวเอง) ===== */}
    {!edit && sk.length > 0 && <div className="overflow-hidden rounded-xl border shadow-sm" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}>
        <span className="grid place-items-center rounded-lg size-7" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', flex: 'none' }}><Icon name="bag" /></span>
        <span className="text-[13px] font-bold">รายการสินค้า</span>
        <span className="cap" style={{ color: 'var(--ink-4)' }}>· {N(sk.length)} รายการ · {N(sk.reduce((a, x) => a + (Number(x.qty) || 0), 0))} ตัว</span>
      </div>
      <CardTable className="table-wrap"><Table>
        <TableHeader><TableRow><TableHead>ลาย</TableHead><TableHead>รหัส</TableHead><TableHead>สี</TableHead><TableHead>ไซซ์</TableHead><TableHead style={{ textAlign: 'right' }}>จำนวน</TableHead><TableHead style={{ textAlign: 'right' }}>ยอด</TableHead></TableRow></TableHeader>
        <TableBody>{sk.map((s, i) => (
          <TableRow key={i}>
            <TableCell className="cell-title" style={{ fontWeight: 600 }} title={s.match_how ? `จับคู่ลายด้วย: ${s.match_how}` : 'จับคู่ลายไม่ได้'}>{s.design || <span style={{ color: 'var(--bad)' }}>จับคู่ไม่ได้</span>}{s._resolveSrc === 'override' && <Badge variant="outline" className="ml-1.5 text-[10px]" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>แก้มือ</Badge>}{s.raw_sku_or_name && s.raw_sku_or_name !== s.design && <div className="cap" style={{ color: 'var(--ink-4)' }}>{s.raw_sku_or_name}</div>}</TableCell>
            <TableCell className="cap">{s.product_code || '—'}</TableCell>
            <TableCell className="cap">{s.color || '—'}</TableCell>
            <TableCell className="cap">{s.size || '—'}</TableCell>
            <TableCell className="num" style={{ textAlign: 'right' }}>{N(s.qty)}</TableCell>
            <TableCell className="num" style={{ textAlign: 'right' }}>{B(s.line_sales)}</TableCell>
          </TableRow>
        ))}</TableBody>
      </Table></CardTable>
      {/* สรุปเงินท้ายรายการ (Lemon) — ราคาเสื้อ→ส่วนลด→ค่าส่ง→VAT→ยอดขาย · ซ่อนเองถ้าไม่มี breakdown */}
      <MoneySummaryRows fin={edit ? null : fin} total={o.sales} />
    </div>}

    {/* ===== ข้อมูลออเดอร์ + ลูกค้า — การ์ดคู่โชว์เลย (ซ่อนตอนแก้ — ฟอร์มมีครบ) ===== */}
    {!edit && <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
      <DrawerGroup icon="listChecks" title="ข้อมูลออเดอร์">
        {o.marketplace_id && o.marketplace_id !== '-' && <DrawerField label="ID มาร์เก็ตเพลส">{o.marketplace_id}</DrawerField>}
        <DrawerField label="วันที่">{fmtD(o.order_date || o.order_month)}</DrawerField>
        <DrawerField label="ช่องทาง"><span className="row" style={{ gap: 6, alignItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 3, background: channelColor(o.channel), flex: 'none' }} />{o.channel}</span></DrawerField>
        <DrawerField label="ประเภทงาน">{jt === 'ปลีก' ? 'ปลีก' : <span className={'chip ' + jtCls}>{jt}</span>}</DrawerField>
        {o.status && o.status !== 'completed' && o.status !== 'active' && <DrawerField label="สถานะ"><Badge variant="secondary">{stMap[o.status] || o.status}</Badge></DrawerField>}
        <DrawerField label="การชำระ">{payLabel(o)}</DrawerField>
      </DrawerGroup>
      <DrawerGroup icon="user" title="ลูกค้า">
        <DrawerField label="ลูกค้า">{o.customer_name || '—'}</DrawerField>
        {custCodeShow(o.customer_code, o.customer_name, o.customer_phone) && <DrawerField label="รหัสลูกค้า">{custCodeShow(o.customer_code, o.customer_name, o.customer_phone)}</DrawerField>}
        {o.customer_phone && <DrawerField label="เบอร์">{o.customer_phone}</DrawerField>}
        {o.customer_social && o.customer_social !== o.customer_name && <DrawerField label="โซเชียล">{o.customer_social}</DrawerField>}
        <DrawerField label="สถานะลูกค้า">{o.customer_type || '—'}</DrawerField>
        {o.cust_total_orders > 0 && <DrawerField label="ออเดอร์สะสม">{N(o.cust_total_orders)} ครั้ง</DrawerField>}
        {o.province && <DrawerField label="จังหวัด">{o.province}</DrawerField>}
        <DrawerField label="เซลล์">{o.salesperson || '—'}</DrawerField>
      </DrawerGroup>
    </div>}

    {/* ไฟล์ใบเสร็จ + จัดการออเดอร์ — แบบ A: การ์ดแถวเดียวจบ (PART 88.1 · user เลือกจาก mockup)
        ซ้าย = สถานะไฟล์ + เปิด/เปลี่ยน · ขวา = แก้ไข(เด่น) · ยกเลิก/ลบ(ghost) · ไม่มีปุ่ม "ปิด" (ใช้ ✕ บนหัว) */}
    {!edit && (
      <div className="flex items-center gap-2 flex-wrap rounded-xl border px-4 py-3 shadow-sm" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        {isReceipt && rec && (<>
          <span className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--ink-3)' }}>
            <span className="inline-flex [&_svg]:size-4" style={{ color: 'var(--accent)' }}><Icon name="external" /></span> ใบเสร็จ
            <b style={{ color: rec.file_url ? 'var(--good)' : 'var(--ink-4)' }}>{rec.file_url ? 'แนบแล้ว' : 'ยังไม่แนบ'}</b>
          </span>
          {rec.file_url && <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setPdfOpen(true)}><Icon name="external" className="size-3.5" /> เปิดไฟล์</Button>}
          {rec.status !== 'void' && canEditReceipt(rec, { email: userEmail(), isAdmin: isAdmin() }) && (
            <>
              <input ref={attachRef} type="file" accept="application/pdf" hidden onChange={e => { attachReceiptToOrder(e.target.files?.[0]); e.target.value = ''; }} />
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={attaching} onClick={() => attachRef.current?.click()}>
                {attaching ? 'กำลังแนบ…' : rec.file_url ? 'เปลี่ยนไฟล์' : 'แนบไฟล์'}
              </Button>
            </>
          )}
        </>)}
        <span className="ml-auto flex items-center gap-1.5 flex-wrap">
          {!isCancelled && appCanEdit() && <Button size="sm" className="h-8 gap-1.5" onClick={startEdit} disabled={busy}><Icon name="pencil" /> แก้ไข</Button>}
          {/* ยกเลิก/นำกลับมา/ลบถาวร = การกระทำที่แก้ข้อมูล → viewer ไม่ควรเห็นปุ่มเลย
              (ฝั่ง action กันด้วย appCanEdit() อยู่แล้ว แต่เดิมปุ่มโผล่ กดแล้วเจอ confirm ก่อนค่อยถูกปฏิเสธ
               ไม่ตรงกับหน้าออเดอร์ที่ห่อทั้งแถบด้วย canEdit) */}
          {appCanEdit() && (isCancelled
            ? <Button variant="outline" size="sm" className="h-8 gap-1.5" style={{ color: 'var(--good)' }} onClick={restoreOrder} disabled={busy}><Icon name="refresh" /> นำกลับมา</Button>
            : <Button variant="ghost" size="sm" className="h-8 gap-1.5" style={{ color: 'var(--warn)' }} onClick={cancelOrder} disabled={busy}>ยกเลิก</Button>)}
          {appCanEdit() && <Button variant="ghost" size="sm" className="h-8 px-2.5" style={{ color: 'var(--bad)' }} onClick={deleteOrder} disabled={busy} title="ลบออเดอร์ถาวร"><Icon name="trash" /></Button>}
        </span>
      </div>
    )}
    {pdfOpen && rec?.file_url && <ReceiptPdfModal url={rec.file_url} title={`ใบเสร็จ ${o.order_no}`} onClose={() => setPdfOpen(false)} />}

    {o.note && (
      <div className="flex gap-2.5 rounded-xl border p-3" style={{ borderColor: 'var(--line)', background: 'var(--warn-soft)' }}>
        <span className="mt-0.5 shrink-0 [&_svg]:size-[15px]" style={{ color: 'var(--warn)' }}><Icon name="lightbulb" /></span>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold" style={{ color: 'var(--warn)' }}>หมายเหตุ</div>
          <div className="text-sm" style={{ color: 'var(--ink)' }}>{o.note}</div>
        </div>
      </div>
    )}

  </SideSheet>;
}
