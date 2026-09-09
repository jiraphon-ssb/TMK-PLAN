/* ============================================================
   receiptSubmit.js — บันทึกใบเสร็จ "ส่งยอด" เป็นชุด (batch) + แก้/ยกเลิกหลังส่ง
   ============================================================
   flow: parseReceiptPdf (receiptParse.js) → ผู้ใช้ตรวจ/เลือกช่องทาง → confirmReceipts()
   - เขียน 4 ตาราง: tmk_sale_receipts (log+กันซ้ำ) · tmk_mp_orders (upsert id=shipnity:<no>)
     · tmk_mp_skus (ลบของ order แล้ว insert ใหม่ — แพทเทิร์น import เดิม)
     · tmk_order_overrides (ผูก salesperson ให้รอดข้าม reimport)
   - salesperson = คนอัปโหลด (login) เสมอ
   - ไม่เก็บต้นทุน (นโยบายระบบ) → cost/profit เขียน 0 คงคีย์ให้ schema เดิม
   - graceful: ตาราง tmk_sale_receipts ยังไม่ migrate → isMissingReceiptTable(err) = true
   ============================================================ */
import { supabase } from './supabaseClient.js';
import { qtyBand, buildMatchers, rematchSkuRow, deriveColorSize, payShipnity } from './mpReport.js';
import { GOLDEN_CATALOG_GRID } from './goldenGrid.js';
import { invalidateSaleCache } from './saleData.js';
import { markSaleWrite } from './saleRealtime.js';
import { logAudit } from './audit.js';
import { jobTypeFromNote, paymentKind } from './receiptParse.js';

/* จับคู่ลาย/สี/ไซซ์ ให้ SKU ของใบเสร็จตอนเขียน — ใช้ catalog+alias ปัจจุบัน
   (แถวเก่าที่ยังว่างซ่อมได้ทีหลังด้วยปุ่ม "ตรวจการจับคู่ใหม่" ในแท็บคุณภาพข้อมูล) */
export async function loadReceiptMatcher() {
  let aliases = [];
  try { const a = await supabase.from('tmk_mp_aliases').select('kind,term,code,design'); if (!a.error) aliases = a.data || []; } catch { /* ตารางยังไม่มี → ใช้ golden ล้วน */ }
  return buildMatchers(GOLDEN_CATALOG_GRID, aliases);
}
// เติม design/product_code/color/size ให้ 1 skuRow (คืน object ใหม่)
// rematchSkuRow (source='shipnity') = golden match → fallback ชื่อบรรทัด · คง product_code เดิม (suffix)
function enrichSku(row, M) {
  const out = { ...row };
  const rm = rematchSkuRow(row, M);   // { design, product_code, match_how, color, size } หรือ null
  if (rm) {
    if (rm.design) out.design = rm.design;
    out.product_code = rm.product_code || row.product_code || '';
    out.match_how = rm.match_how || '';
    if (rm.color) out.color = rm.color;
    if (rm.size) out.size = rm.size;
  }
  // safety net: ถ้ายังขาดสี/ไซซ์ (rm null) → derive ตรงจากชื่อ+รหัส
  if (!out.color || !out.size) {
    const cs = deriveColorSize(row.raw_sku_or_name, out.product_code || row.product_code);
    out.color = out.color || cs.color; out.size = out.size || cs.size;
  }
  return out;
}

// live re-match บรรทัดใบเสร็จ (review table) — จับคู่ลาย/ดึงรหัสสด ให้ตรงกับตอนเขียน (buildRows)
// รับ line { code, name, color, size, qty, amount } → คืน line เดิม + code/design/color/size ที่ match ได้
// M = loadReceiptMatcher() (โหลดครั้งเดียวแล้วส่งเข้ามา) · ถ้าไม่มี M คืน line เดิม (graceful)
export function enrichReceiptLine(line, M) {
  if (!line || !M) return line;
  const sku = enrichSku({
    product_code: String(line.code || ''), design: '', color: '', size: '',
    raw_sku_or_name: String(line.name || ''), match_how: '',
  }, M);
  return {
    ...line,
    code: sku.product_code || line.code || '',
    design: sku.design || line.design || '',
    match_how: sku.match_how || line.match_how || '',
    color: line.color || sku.color || '',
    size: line.size || sku.size || '',
  };
}

export const receiptId = (orderNo) => 'shipnity:' + String(orderNo || '').trim();
const monthOf = (iso) => String(iso || '').slice(0, 7);
const normPhone = (p) => String(p || '').replace(/\D/g, '');
// คีย์ลูกค้าจากใบเสร็จ — ใช้ทั้งบน orders.customer_code และ tmk_mp_customers.customer_code (ต้องตรงกัน 100%)
// ลำดับ: 'P<เบอร์>'(≥9) → 'S<social>'(handle เฉพาะ · ต่างจากชื่อ) → 'N<ชื่อ>' — คนละ keyspace กับ CE#### จาก import เก่า
// social ก่อนชื่อ: ลดการรวม "คนละคนชื่อเดียวกัน (ไม่มีเบอร์)" · ใช้เฉพาะเมื่อ social ≠ ชื่อ (parser fallback social=ชื่อ) → คงพฤติกรรมเดิมของลูกค้าชื่อล้วน (ไม่ retro-split)
// ลูกค้าถูกปกปิด (Shopee/Lazada mask ชื่อ/เบอร์) → ไม่มีคีย์จริง (กัน CRM ขยะ · ออเดอร์ยังบันทึกปกติ)
const isMaskedCustomer = (it) => !!it.customer_masked || /\*{2,}/.test(String(it.customer_name || ''));
export const customerKeyOf = (it) => {
  if (isMaskedCustomer(it)) return '';
  const p = normPhone(it.customer_phone);
  if (p.length >= 9) return 'P' + p;
  const n = String(it.customer_name || '').trim();
  const soc = String(it.customer_social || '').trim();
  if (soc && soc !== n) return 'S' + soc.slice(0, 60);
  return n ? 'N' + n.slice(0, 60) : '';
};
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const nowISO = () => new Date().toISOString();

export const isMissingReceiptTable = (err) =>
  /tmk_sale_receipts/.test(err?.message || '') && /does not exist|schema cache|PGRST/i.test(err?.message || '');

/* ============================================================
   dedup — เช็คทั้งชุดใน query เดียวต่อตาราง
   คืน { dupReceipts: Map(order_no → row), dupOrders: Set(order_no), missingTable }
   ============================================================ */
export async function checkDuplicates(orderNos) {
  const nos = [...new Set(orderNos.filter(Boolean))];
  const dupReceipts = new Map();
  const dupOrders = new Set();
  let missingTable = false;
  for (const ids of chunk(nos, 150)) {
    try {
      const r = await supabase.from('tmk_sale_receipts')
        .select('order_no,salesperson,uploader_email,status,created_at').in('order_no', ids);
      if (r.error) throw r.error;
      (r.data || []).forEach(x => dupReceipts.set(x.order_no, x));
    } catch (e) { if (isMissingReceiptTable(e)) { missingTable = true; } else throw e; }
    const o = await supabase.from('tmk_mp_orders').select('id,order_no,salesperson')
      .in('id', ids.map(receiptId));
    if (!o.error) (o.data || []).forEach(x => dupOrders.add(x.order_no));
  }
  return { dupReceipts, dupOrders, missingTable };
}

/* ============================================================
   ลูกค้าเก่า/ใหม่ — เช็คทั้งชุด (เบอร์ใน tmk_mp_customers · ชื่อใน tmk_mp_orders)
   คืน fn(receipt) → 'ลูกค้าเก่า' | 'ลูกค้าใหม่'
   ============================================================ */
export async function customerTypeLookup(receipts) {
  const phones = [...new Set(receipts.map(r => String(r.customer_phone || '').replace(/\D/g, '')).filter(p => p.length >= 9))];
  const names = [...new Set(receipts.map(r => String(r.customer_name || '').trim()).filter(Boolean))];
  const oldPhones = new Set();
  const oldNames = new Set();
  try {
    for (const ids of chunk(phones, 150)) {
      const r = await supabase.from('tmk_mp_customers').select('phone').in('phone', ids);
      if (!r.error) (r.data || []).forEach(x => oldPhones.add(String(x.phone || '').replace(/\D/g, '')));
    }
  } catch { /* ตารางลูกค้า optional */ }
  try {
    for (const ids of chunk(names, 100)) {
      const r = await supabase.from('tmk_mp_orders').select('customer_name').in('customer_name', ids).limit(1000);
      if (!r.error) (r.data || []).forEach(x => oldNames.add(String(x.customer_name || '').trim()));
    }
  } catch { /* เงียบ */ }
  return (r) => {
    const p = String(r.customer_phone || '').replace(/\D/g, '');
    if (p && oldPhones.has(p)) return 'ลูกค้าเก่า';
    if (oldNames.has(String(r.customer_name || '').trim())) return 'ลูกค้าเก่า';
    return 'ลูกค้าใหม่';
  };
}

/* ============================================================
   โปรไฟล์ลูกค้าจากใบเสร็จ → tmk_mp_customers (แหล่งเดียวที่เติมลูกค้า หลังเลิกใช้ไฟล์)
   ============================================================
   คีย์: P<เบอร์ปกติ> (เบอร์ ≥9 หลัก) else N<ชื่อ trim> — คนละ keyspace กับรหัส CE จาก import เก่า
   merge: ช่องที่ใบใหม่มีค่า → ทับ · owner (เซลล์เจ้าของ) + since ตั้งครั้งแรกเท่านั้น
   ไม่แตะ lifetime_* (ยอดสะสมให้หน้า CRM คำนวณสดจากออเดอร์ — ยกเลิกใบแล้วไม่ค้าง) */
export async function upsertReceiptCustomers(items, user) {
  const byKey = new Map();
  for (const it of items) { const k = customerKeyOf(it); if (k) byKey.set(k, it); } // ใบหลังสุดของลูกค้าเดียวกันในชุดชนะ
  if (!byKey.size) return;
  const keys = [...byKey.keys()];
  // อ่านของเดิมทั้งชุด (query เดียวต่อ 150 คีย์) → merge ฝั่ง client
  const existing = new Map();
  for (const ids of chunk(keys, 150)) {
    const r = await supabase.from('tmk_mp_customers').select('customer_code,name,phone,social_name,address,province,contact_channel,owner,since').in('customer_code', ids);
    if (!r.error) (r.data || []).forEach(c => existing.set(c.customer_code, c));
  }
  const now = new Date().toISOString();
  const rows = keys.map(k => {
    const it = byKey.get(k); const old = existing.get(k) || {};
    return {
      customer_code: k,
      name: String(it.customer_name || '').trim() || old.name || '',
      phone: normPhone(it.customer_phone) || old.phone || '',
      social_name: String(it.customer_social || '').trim() || old.social_name || '',
      address: String(it.customer_address || '').trim() || old.address || '',   // ที่อยู่จัดส่งจากใบเสร็จ
      province: String(it.province || '').trim() || old.province || '',
      contact_channel: String(it.channel || it.channel_hint || '').trim() || old.contact_channel || '',
      owner: old.owner || user?.name || '',                       // เซลล์เจ้าของ = คนส่งใบแรก
      since: old.since || it.order_date || null,                  // เป็นลูกค้าครั้งแรก
      updated_at: now,
    };
  });
  for (const ch of chunk(rows, 300)) {
    const { error } = await supabase.from('tmk_mp_customers').upsert(ch, { onConflict: 'customer_code' });
    if (error) throw error;
  }
}

/* ============================================================
   หลักฐานขึ้น Storage (graceful — fail คืน null ไม่บล็อก)
   ============================================================ */
export async function uploadReceiptFile(file, key) {
  try {
    const path = `receipts/${String(key).replace(/[^A-Za-z0-9_-]/g, '')}-${Date.now().toString(36)}.pdf`;
    const { error } = await supabase.storage.from('tmk-images')
      .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf', cacheControl: '3600' });
    if (error) throw error;
    const { data: pub } = supabase.storage.from('tmk-images').getPublicUrl(path);
    return pub?.publicUrl || null;
  } catch (e) {
    // bucket ยังไม่รับ PDF (ต้องรัน 20260704-receipt-fixes.sql) หรือไฟล์ใหญ่เกิน → ไม่บล็อกการบันทึกยอด
    console.warn('uploadReceiptFile → เก็บหลักฐานไม่สำเร็จ:', e?.message || e);
    return null;
  }
}

/* ============================================================
   สร้างแถว DB จาก 1 ใบ (หลังผู้ใช้ตรวจ/แก้แล้ว)
   item = { ...parsed, order_no, order_date, customer_name, ..., lines,
            channel, job_type, customer_type, total }
   ============================================================ */
function buildRows(item, user, batch, M) {
  const orderNo = String(item.order_no || '').trim();
  const id = receiptId(orderNo);
  const qty = item.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const sales = Number(item.total) || 0;
  const payKind = paymentKind(item.payment_method, item.carrier);
  // ประเภทงาน: หมายเหตุเป็นเจ้าของ DFT (พิมพ์ "DFT" ในหมายเหตุ = DFT · ลบออก = ปลีก) · OEM = เลือกเองคงไว้
  const jobType = item.job_type === 'OEM' ? 'OEM' : jobTypeFromNote(item.note);
  const orderRow = {
    id, order_no: orderNo, source: 'shipnity', status: 'active',
    channel: item.channel || '', order_date: item.order_date || null,
    order_month: monthOf(item.order_date), salesperson: user.name || user.email,
    qty, qty_band: qtyBand(qty), sales,
    cost: 0, profit: 0, // นโยบาย: ไม่เก็บต้นทุน — คงคีย์ให้ schema เดิม
    mkt_commission: 0, mkt_net_income: sales,
    cod_amount: payKind === 'COD' ? sales : 0,
    customer_type: item.customer_type || 'ลูกค้าใหม่',
    job_type: jobType,
    province: item.province || '',
    // payment_type ตรง convention import: COD → 'COD' · ธนาคาร → 'โอน' (ธนาคารดิบเก็บใน attrs)
    payment_type: payKind === 'COD' ? 'COD' : payShipnity(item.payment_method),
    // customer_code = คีย์เดียวกับโปรไฟล์ (customerKeyOf) → หน้า ลูกค้า (CRM) join ประวัติซื้อได้
    customer_code: customerKeyOf(item), customer_name: item.customer_name || '', customer_social: item.customer_social || '',
    // เบอร์ลงคอลัมน์ออเดอร์ตรง (20260715) — เดิมอยู่แค่ customers · upsert พลาด = หายจาก query (schema-tolerant ตอนเขียน)
    customer_phone: item.customer_phone || '',
    note: item.note || '',   // ลงคอลัมน์จริง — หน้าออเดอร์เห็นหมายเหตุ (เดิมเก็บแค่ attrs.lot_note = มองไม่เห็น)
    import_batch: batch,
    // attrs เก็บข้อมูลบนใบให้ครบระดับออเดอร์ (ส่วนลด/ค่าส่ง/vat/รหัสส่วนลด/เวลา — เฉพาะที่มีค่า ไม่ bloat)
    attrs: {
      via: 'receipt', receipt_id: id, carrier: item.carrier || '', lot_note: item.note || '', payment_method: item.payment_method || '',
      ...(Number(item.discount) ? { discount: Number(item.discount) } : {}),
      ...(Number(item.shipping) ? { shipping: Number(item.shipping) } : {}),
      ...(Number(item.vat) ? { vat: Number(item.vat) } : {}),
      ...(item.subtotal != null && Number(item.subtotal) !== sales ? { subtotal: Number(item.subtotal) } : {}),
      ...(item.promo_code ? { promo_code: item.promo_code } : {}),
      ...(item.order_time ? { order_time: item.order_time } : {}),
      ...(item.customer_tax_id ? { customer_tax_id: item.customer_tax_id } : {}),
    },
    updated_at: nowISO(),
  };
  const skuRows = item.lines.map((l, i) => enrichSku({
    id: `shipnity:${orderNo}:${i}`,
    source: 'shipnity', channel: item.channel || '', order_no: orderNo,
    product_code: String(l.code || ''), design: '', color: '', size: '',
    qty: Number(l.qty) || 0, line_sales: Number(l.amount) || 0,
    raw_sku_or_name: String(l.name || ''), match_how: '',
    order_month: monthOf(item.order_date), order_date: item.order_date || null,
    import_batch: batch,
  }, M));
  const receiptRow = {
    id, order_no: orderNo,
    uploader_email: user.email || '', salesperson: user.name || user.email || '',
    channel: item.channel || '', order_date: item.order_date || null,
    order_month: monthOf(item.order_date), qty, sales,
    parsed: item.parsedRaw ?? null, confirmed: sanitizeConfirmed(item),
    file_page: item.page ?? null, source_tool: item.source_tool || 'pdfjs',   // 'manual' = คีย์มือไม่มีใบเสร็จ
    status: 'confirmed', updated_at: nowISO(),
  };
  // override sync เต็ม field — กัน override เก่า (จากการแก้ใน drawer ออเดอร์) shadow ค่าที่แก้ล่าสุดผ่านใบเสร็จ
  // + mirror ครบช่องแบบ order-edit drawer (คอลัมน์ 20260714/20260715) — กัน reimport ทับ channel/ยอด/จังหวัด/เบอร์
  const overrideRow = {
    order_id: id, salesperson: user.name || user.email || '',
    job_type: jobType, customer_name: item.customer_name || '', customer_type: item.customer_type || '', note: item.note || '',
    channel: item.channel || '', payment_type: orderRow.payment_type, sales, qty,
    province: item.province || '', order_date: item.order_date || null, cod_amount: orderRow.cod_amount,
    customer_phone: item.customer_phone || '', customer_social: item.customer_social || '',
    updated_at: nowISO(),
  };
  return { orderRow, skuRows, receiptRow, overrideRow, item };
}

const sanitizeConfirmed = (item) => ({
  order_no: item.order_no, order_date: item.order_date, order_time: item.order_time || '',
  customer_name: item.customer_name, customer_phone: item.customer_phone,
  customer_social: item.customer_social, customer_address: item.customer_address,
  customer_tax_id: item.customer_tax_id || '', customer_masked: !!item.customer_masked,
  province: item.province, lines: item.lines,
  subtotal: item.subtotal, discount: item.discount, shipping: item.shipping, vat: item.vat ?? 0, total: item.total,
  payment_method: item.payment_method, carrier: item.carrier, note: item.note, promo_code: item.promo_code || '',
  channel: item.channel, job_type: item.job_type, customer_type: item.customer_type,
});

/* ============================================================
   confirmReceipts — บันทึกเป็นชุด
   items: ใบที่ผู้ใช้ติ๊ก + ตรวจแล้ว (มี channel แล้วทุกใบ)
   user:  { email, name } (จาก userContext)
   คืน { ok: [order_no], skipped: [{order_no, reason}] }
   ============================================================ */
export async function confirmReceipts(items, user, { onProgress } = {}) {
  const batch = 'receipt:' + Date.now().toString(36);
  const ok = []; const skipped = [];
  // guard: ใบที่ไม่มีเลขที่เอกสาร → ข้าม (กัน id 'shipnity:' เสีย · ต้องแก้ในตารางตรวจก่อน)
  const valid = [];
  for (const it of (items || [])) {
    if (!String(it.order_no || '').trim()) skipped.push({ order_no: it.order_no || '(ว่าง)', reason: 'ไม่มีเลขที่เอกสาร — ตรวจก่อนบันทึก' });
    else valid.push(it);
  }
  if (!valid.length) return { ok, skipped };
  const [typeOf, M] = await Promise.all([customerTypeLookup(valid), loadReceiptMatcher()]);

  // เตรียมแถวทั้งหมด (จับคู่ลาย/สี/ไซซ์ ให้ SKU ตอนเขียน)
  const prepared = valid.map(it => buildRows(
    { ...it, customer_type: it.customer_type || typeOf(it) }, user, batch, M,
  ));

  /* 1) receipts — insert ทีละใบ (กันซ้ำด้วย unique order_no · ใบ void เดิม = ปลุกกลับ) */
  const passed = [];
  const freshNos = []; // ใบที่ "insert ใหม่" รอบนี้ (ไม่รวมใบ void-ปลุกกลับ) — เผื่อ rollback ถ้า orders/skus พัง
  for (const p of prepared) {
    let ins = await supabase.from('tmk_sale_receipts').insert(p.receiptRow);
    if (ins.error && String(ins.error.code) === '23505') {
      // ซ้ำ: ถ้าใบเดิมถูก void → ส่งใหม่ได้ (upsert กลับ confirmed) · ไม่งั้นข้าม
      const old = await supabase.from('tmk_sale_receipts').select('order_no,salesperson,status,created_at').eq('order_no', p.receiptRow.order_no).maybeSingle();
      if (old.data?.status === 'void') {
        ins = await supabase.from('tmk_sale_receipts').update({ ...p.receiptRow, void_by: '', void_reason: '', void_at: null }).eq('order_no', p.receiptRow.order_no);
        if (!ins.error) { passed.push(p); continue; }
      }
      skipped.push({ order_no: p.receiptRow.order_no, reason: old.data ? `ส่งแล้วโดย ${old.data.salesperson}` : 'เลขที่ซ้ำ' });
      continue;
    }
    if (ins.error) {
      if (isMissingReceiptTable(ins.error)) throw ins.error; // ตารางยังไม่ migrate — โยนให้ UI โชว์ notice
      skipped.push({ order_no: p.receiptRow.order_no, reason: ins.error.message || 'บันทึกไม่สำเร็จ' });
      continue;
    }
    passed.push(p);
    freshNos.push(p.receiptRow.order_no);
  }
  onProgress?.('receipts', passed.length, items.length);
  if (!passed.length) return { ok, skipped };

  // ประกาศนอก try — ใช้ทั้งใน try (skus) และหลัง try (ok.push/logAudit) · กัน ReferenceError หลัง write สำเร็จ
  const nos = passed.map(p => p.orderRow.order_no);

  /* 2-3) orders + skus — ถ้าพังกลางทาง: ลบใบเสร็จ+ออเดอร์ที่เพิ่ง insert รอบนี้ทิ้ง (rollback)
     กัน "ใบ confirmed ผี"/ออเดอร์ orphan ที่บล็อกการส่งซ้ำแต่ไม่มีคู่ → ส่งใหม่ได้จริง (idempotent) */
  try {
    /* 2) orders — upsert ชุด (schema-tolerant: คอลัมน์ customer_phone ยังไม่รัน 20260715 → ตัดออกแล้วลองใหม่) */
    for (const ch of chunk(passed.map(p => p.orderRow), 400)) {
      let { error } = await supabase.from('tmk_mp_orders').upsert(ch, { onConflict: 'id' });
      if (error && /customer_phone/i.test(error.message || '')) {
        const slim = ch.map(({ customer_phone: _p, ...r }) => r);
        ({ error } = await supabase.from('tmk_mp_orders').upsert(slim, { onConflict: 'id' }));
      }
      if (error) throw error;
    }
    /* 3) skus — ลบของ order เหล่านี้ก่อน (แพทเทิร์น import) แล้ว insert ใหม่ */
    for (const ids of chunk(nos, 150)) {
      const { error } = await supabase.from('tmk_mp_skus').delete().eq('source', 'shipnity').in('order_no', ids);
      if (error) throw error;
    }
    const allSkus = passed.flatMap(p => p.skuRows);
    for (const ch of chunk(allSkus, 400)) {
      const { error } = await supabase.from('tmk_mp_skus').insert(ch);
      if (error) throw error;
    }
  } catch (err) {
    // rollback best-effort: ลบทั้งใบเสร็จ + ออเดอร์ที่เพิ่งสร้างรอบนี้ (freshNos = เฉพาะที่ insert ใหม่ ไม่ใช่ skipped)
    if (freshNos.length) {
      for (const ids of chunk(freshNos, 150)) {
        try { await supabase.from('tmk_sale_receipts').delete().in('order_no', ids); } catch { /* best-effort */ }
        try { await supabase.from('tmk_mp_orders').delete().eq('source', 'shipnity').in('order_no', ids); } catch { /* best-effort */ }
        try { await supabase.from('tmk_mp_skus').delete().eq('source', 'shipnity').in('order_no', ids); } catch { /* best-effort */ }
      }
    }
    throw err;
  }
  /* 4) overrides — mirror ครบช่องให้รอดข้าม reimport (optional table — เงียบถ้าไม่มี)
     graceful: คอลัมน์ mirror (20260714/20260715) ยังไม่รัน → ถอยไปชุดฐาน 6 ช่อง (อย่างน้อยเซลล์/งาน/ลูกค้ารอด) */
  try {
    for (const ch of chunk(passed.map(p => p.overrideRow), 400)) {
      let { error } = await supabase.from('tmk_order_overrides').upsert(ch, { onConflict: 'order_id' });
      if (error && /channel|payment_type|sales|qty|province|order_date|cod_amount|customer_phone|customer_social|column/i.test(error.message || '')) {
        const base = ch.map(r => ({ order_id: r.order_id, salesperson: r.salesperson, job_type: r.job_type, customer_name: r.customer_name, customer_type: r.customer_type, note: r.note, updated_at: r.updated_at }));
        ({ error } = await supabase.from('tmk_order_overrides').upsert(base, { onConflict: 'order_id' }));
      }
      if (error) throw error;
    }
  } catch { /* override layer optional */ }
  /* 4.5) โปรไฟล์ลูกค้า — ใบเสร็จคือแหล่งเดียวที่เติมลูกค้าแล้ว (เลิกดึงจากไฟล์ Shipnity)
     upsert tmk_mp_customers: คีย์ = เบอร์ (P<เบอร์>) else ชื่อ (N<ชื่อ>) · เก็บโปรไฟล์อย่างเดียว
     ไม่สะสมยอดในแถวลูกค้า (หน้า ลูกค้า CRM คำนวณสดจากออเดอร์ → ยกเลิกใบแล้วตัวเลขไม่ค้าง)
     merge กับของเดิม: ช่องที่มีค่าใหม่ทับ · owner/since ตั้งครั้งแรกเท่านั้น · non-blocking */
  try {
    await upsertReceiptCustomers(passed.map(p => p.item), user);
  } catch { /* ลูกค้า optional — ไม่ให้ล้มทั้งชุด */ }
  onProgress?.('orders', passed.length, items.length);

  ok.push(...nos);
  invalidateSaleCache('tmk_mp_orders'); invalidateSaleCache('tmk_mp_skus'); invalidateSaleCache('tmk_order_overrides'); invalidateSaleCache('tmk_mp_customers'); markSaleWrite('tmk_sale_receipts');
  const sum = passed.reduce((s, p) => s + (p.orderRow.sales || 0), 0);
  const totQty = passed.reduce((s, p) => s + (p.orderRow.qty || 0), 0);
  const chans = [...new Set(passed.map(p => p.orderRow.channel).filter(Boolean))];
  const months = [...new Set(passed.map(p => p.receiptRow.order_month).filter(Boolean))].sort();
  const fields = [
    { label: 'จำนวนใบ', value: String(nos.length) },
    { label: 'ยอดรวม', value: `฿${sum.toLocaleString()}` },
    { label: 'จำนวนชิ้น', value: `${totQty} ตัว` },
    { label: 'เซลล์', value: user.name || user.email || '—' },
    { label: 'ช่องทาง', value: chans.join(', ') || '—' },
    { label: 'เดือน', value: months.join(', ') || '—' },
  ];
  // ใบเดียว → เพิ่มรายละเอียดใบนั้นครบ (ให้ log อ่านรู้เรื่องเหมือน task)
  if (passed.length === 1) {
    const p0 = passed[0]; const it = p0.item || {};
    fields.push(
      { label: 'เลขที่', value: p0.receiptRow.order_no },
      { label: 'ลูกค้า', value: it.customer_name || '—' },
      { label: 'วันที่', value: it.order_date || '—' },
      { label: 'จังหวัด', value: it.province || '—' },
      { label: 'ประเภทงาน', value: p0.orderRow.job_type || '—' },
      { label: 'การชำระ', value: p0.orderRow.payment_type || '—' },
      { label: 'รายการ', value: `${(it.lines || []).length} รายการ` },
    );
  }
  logAudit({
    action: 'create', entityType: 'receipt', entityName: passed.length === 1 ? `ใบเสร็จ ${passed[0].receiptRow.order_no}` : `ส่งยอด ${nos.length} ใบ`,
    entityId: passed.length === 1 ? passed[0].receiptRow.order_no : null,
    summary: `ส่งยอด ${nos.length} ใบ · ฿${sum.toLocaleString()} (${user.name || user.email})`,
    fields,
    data: { count: nos.length, sales: sum, qty: totQty, channels: chans, months, order_nos: nos.slice(0, 100) },
  });
  return { ok, skipped };
}

/* อัปโหลดหลักฐานหลังบันทึก (background) — อัปเดต file_url รายใบ · ไม่บล็อก UI */
export async function attachReceiptFiles(entries, { onProgress } = {}) {
  // entries: [{ order_no, file, page }] — PDF รวมหลายใบ: ไฟล์เดียวกันหลาย entry → อัปครั้งเดียว
  const byFile = new Map();
  for (const e of entries) {
    if (!e.file) continue;
    if (!byFile.has(e.file)) byFile.set(e.file, []);
    byFile.get(e.file).push(e);
  }
  let done = 0;
  for (const [file, list] of byFile) {
    const url = await uploadReceiptFile(file, list.length === 1 ? list[0].order_no : 'batch');
    if (url) {
      for (const ids of chunk(list.map(e => e.order_no), 150)) {
        try { await supabase.from('tmk_sale_receipts').update({ file_url: url }).in('order_no', ids); } catch { /* เงียบ */ }
      }
    }
    done += 1; onProgress?.(done, byFile.size);
  }
}

/* ============================================================
   สิทธิ์แก้/ยกเลิก: แอดมิน = เสมอ · เจ้าของใบ = ภายในวันเดียวกัน
   ============================================================ */
export function canEditReceipt(receipt, { email, isAdmin }) {
  if (isAdmin) return true;
  if ((receipt.uploader_email || '') !== (email || '')) return false;
  /* "ภายในวันเดียวกัน" ต้องเป็นวันปฏิทินไทย ไม่ใช่วัน UTC
     เดิมเทียบ UTC ทั้งคู่ = หน้าต่าง 07:00→07:00 → ใบที่ส่งก่อน 7 โมงเช้าแก้ไม่ได้ทั้งวันนั้น */
  const local = (iso) => { const t = new Date(iso); return Number.isNaN(t.getTime()) ? '' : `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  const d = local(receipt.created_at);
  const now = new Date();
  return !!d && d === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/* ============================================================
   editReceipt — แก้หลังส่ง (ทุกช่อง · เลขที่เปลี่ยน = ย้าย id)
   orig: แถว tmk_sale_receipts เดิม · edited: payload ใหม่ (โครงเดียวกับ confirm item)
   editor: { email, name, isAdmin } · salespersonOverride: แอดมินโอนยอด (ชื่อใหม่) หรือ null
   ============================================================ */
export async function editReceipt(orig, edited, editor, { salespersonOverride = null } = {}) {
  const [typeOf, M] = await Promise.all([customerTypeLookup([edited]), loadReceiptMatcher()]);
  const seller = salespersonOverride || orig.salesperson;
  const user = { email: orig.uploader_email, name: seller };
  const batch = 'receipt-edit:' + Date.now().toString(36);
  const rows = buildRows({ ...edited, customer_type: edited.customer_type || typeOf(edited) }, user, batch, M);

  const oldNo = String(orig.order_no).trim();
  const newNo = String(edited.order_no).trim();
  const moved = oldNo !== newNo;

  if (moved) {
    // เลขใหม่ต้องไม่ชนใคร
    const { dupReceipts, dupOrders } = await checkDuplicates([newNo]);
    const hit = dupReceipts.get(newNo);
    if ((hit && hit.status === 'confirmed') || dupOrders.has(newNo)) {
      throw new Error(`เลขที่ ${newNo} มีอยู่แล้ว${hit ? ` (ส่งโดย ${hit.salesperson})` : ' (จากข้อมูล import)'}`);
    }
  }

  // ประวัติการแก้: diff field หลัก
  const changes = {};
  const oldC = orig.confirmed || {};
  for (const k of Object.keys(sanitizeConfirmed(edited))) {
    const a = JSON.stringify(oldC[k] ?? null), b = JSON.stringify(sanitizeConfirmed(edited)[k] ?? null);
    if (a !== b) changes[k] = [oldC[k] ?? null, sanitizeConfirmed(edited)[k] ?? null];
  }
  if (salespersonOverride && salespersonOverride !== orig.salesperson) changes.salesperson = [orig.salesperson, salespersonOverride];
  const history = [...(Array.isArray(orig.history) ? orig.history : []), { at: nowISO(), by: editor.name || editor.email, changes }];

  const newReceiptRow = {
    ...rows.receiptRow,
    parsed: orig.parsed ?? null,          // ข้อมูลดิบครั้งแรกคงเดิม (audit)
    uploader_email: orig.uploader_email,  // เจ้าของใบเดิม
    salesperson: seller,
    history, created_at: orig.created_at, status: 'confirmed', updated_at: nowISO(),
  };
  if (rows.orderRow) rows.orderRow.salesperson = seller;
  rows.overrideRow.salesperson = seller;

  if (moved) {
    // ลำดับปลอดภัย: เขียนใหม่ก่อน แล้วค่อยลบของเก่า
    let ins = await supabase.from('tmk_sale_receipts').insert(newReceiptRow);
    if (ins.error && String(ins.error.code) === '23505') {
      ins = await supabase.from('tmk_sale_receipts').update(newReceiptRow).eq('order_no', newNo); // ทับใบ void เดิม
    }
    if (ins.error) throw ins.error;
  } else {
    const { error } = await supabase.from('tmk_sale_receipts').update(newReceiptRow).eq('order_no', oldNo);
    if (error) throw error;
  }

  { const { error } = await supabase.from('tmk_mp_orders').upsert(rows.orderRow, { onConflict: 'id' }); if (error) throw error; }
  { const { error } = await supabase.from('tmk_mp_skus').delete().eq('source', 'shipnity').in('order_no', moved ? [oldNo, newNo] : [oldNo]); if (error) throw error; }
  if (rows.skuRows.length) { const { error } = await supabase.from('tmk_mp_skus').insert(rows.skuRows); if (error) throw error; }
  try { await supabase.from('tmk_order_overrides').upsert(rows.overrideRow, { onConflict: 'order_id' }); } catch { /* optional */ }

  if (moved) {
    // ลบร่องรอยเลขเก่า (ลบไม่ได้ → มาร์คแทน กันแถว phantom ค้างในรายงาน/feed)
    const delRec = await supabase.from('tmk_sale_receipts').delete().eq('order_no', oldNo);
    if (delRec.error) {
      const fb = await supabase.from('tmk_sale_receipts').update({ status: 'void', void_by: editor.name || editor.email || '', void_reason: 'ย้ายเลขที่ → ' + newNo, void_at: nowISO() }).eq('order_no', oldNo);
      if (fb.error) throw new Error(`ลบ/ยกเลิกใบเก่า ${oldNo} ไม่สำเร็จ — ${delRec.error.message}`);   // ทั้งลบและมาร์คไม่ได้ = กัน phantom (ให้ UI เห็น)
    }
    const del = await supabase.from('tmk_mp_orders').delete().eq('id', receiptId(oldNo));
    if (del.error) {
      const fb = await supabase.from('tmk_mp_orders').update({ status: 'cancelled' }).eq('id', receiptId(oldNo));
      if (fb.error) throw new Error(`ลบ/ยกเลิกออเดอร์เก่า ${oldNo} ไม่สำเร็จ — ${del.error.message}`);
    }
    try { await supabase.from('tmk_order_overrides').delete().eq('order_id', receiptId(oldNo)); } catch { /* optional */ }
  }

  // โปรไฟล์ลูกค้าตามการแก้ (ชื่อ/เบอร์/จังหวัดเปลี่ยน) — non-blocking
  try { await upsertReceiptCustomers([edited], editor); } catch { /* optional */ }

  invalidateSaleCache('tmk_mp_orders'); invalidateSaleCache('tmk_mp_skus'); invalidateSaleCache('tmk_order_overrides'); invalidateSaleCache('tmk_mp_customers'); markSaleWrite('tmk_sale_receipts');
  logAudit({
    action: 'update', entityType: 'receipt', entityName: 'ใบเสร็จ ' + newNo, entityId: receiptId(newNo),
    summary: `แก้ใบเสร็จ ${moved ? `${oldNo} → ${newNo}` : newNo} โดย ${editor.name || editor.email}`,
  });
  return { moved };
}

/* ============================================================
   voidReceipt — ยกเลิกใบ (ยอดหายจากรายงานทันที · ส่งใหม่ได้)
   ============================================================ */
// RPC ยังไม่ได้รัน migration → error แบบ "ฟังก์ชันไม่มี" → fallback client path
const rpcMissing = (err) => /PGRST202|42883|does not exist|Could not find the function|schema cache/i.test(String((err && (err.message || err.code)) || ''));

/* ลบออเดอร์หลายใบ "ทีเดียว" — RPC ธุรกรรม (skus+orders+overrides+receipts atomic)
   fallback (ยังไม่รัน migration): batch .in() ต่อตาราง (round-trip น้อย · ไม่ atomic) · แยกตาม source */
export async function deleteOrders(orderNos, { source = '', overrideIds = [] } = {}) {
  const nos = [...new Set((orderNos || []).map(n => String(n || '').trim()).filter(Boolean))];
  if (!nos.length) return;
  // 🛡️ ตารางร่วม (shipnity + มาร์เก็ตเพลส อยู่ตารางเดียวกัน แยกด้วย source)
  //    ถ้า source ว่าง เงื่อนไข `if (source)` ข้างล่างจะไม่ทำงาน → ลบ "ทุก source" ที่มี order_no ตรงกัน
  //    ตรงกับกติกาใน CLAUDE.md "ห้าม TRUNCATE ตารางร่วม ใช้ DELETE WHERE source=..."
  if (!source) throw new Error('deleteOrders: ต้องระบุ source (ตารางร่วม — ลบโดยไม่ระบุ source จะลบข้ามช่องทาง)');
  const rpc = await supabase.rpc('tmk_delete_orders', { p_order_nos: nos, p_source: source || '', p_override_ids: overrideIds || [] });
  if (rpc.error) {
    if (!rpcMissing(rpc.error)) console.warn('tmk_delete_orders RPC ล้มเหลว → fallback batch:', rpc.error?.message || rpc.error);
    for (const ids of chunk(nos, 150)) {
      // ⚠️ เช็ค error ของการลบ "บรรทัดลาย (skus)" ด้วย — เดิม `await skq;` ทิ้งผลลัพธ์
      //    supabase ไม่ throw แต่คืน { data, error } → ถ้าลบ skus ล้ม (RLS/เน็ต) โค้ดเดินต่อไปลบ order สำเร็จ
      //    ผลคือ order หายแต่บรรทัดลายค้าง → รายงานลาย/สี/ไซซ์ยังนับยอดนั้น แต่ยอดระดับออเดอร์หายไป = ตัวเลขไม่ตรงแบบเงียบ
      const skq = supabase.from('tmk_mp_skus').delete().in('order_no', ids); if (source) skq.eq('source', source);
      { const { error } = await skq; if (error) throw error; }
      const orq = supabase.from('tmk_mp_orders').delete().in('order_no', ids); if (source) orq.eq('source', source);
      { const { error } = await orq; if (error) throw error; }
    }
    for (const ids of chunk(overrideIds || [], 150)) { try { await supabase.from('tmk_order_overrides').delete().in('order_id', ids); } catch { /* optional */ } }
    for (const ids of chunk(nos, 150)) { try { await supabase.from('tmk_sku_overrides').delete().in('order_no', ids); } catch { /* optional — กัน override ลายบรรทัดค้างเป็น orphan */ } }
    for (const ids of chunk(nos, 150)) { try { await supabase.from('tmk_sale_receipts').delete().in('order_no', ids); } catch { /* optional */ } }
  }
  invalidateSaleCache('tmk_mp_orders'); invalidateSaleCache('tmk_mp_skus'); invalidateSaleCache('tmk_order_overrides'); markSaleWrite('tmk_sale_receipts');
}

/* ยกเลิก (void) ใบเสร็จหลายใบ "ทีเดียว" — RPC ธุรกรรม · fallback batch */
export async function voidReceipts(orderNos, { by = '', reason = '' } = {}) {
  const nos = [...new Set((orderNos || []).map(n => String(n || '').trim()).filter(Boolean))];
  if (!nos.length) return;
  const rpc = await supabase.rpc('tmk_void_receipts', { p_order_nos: nos, p_by: by, p_reason: reason });
  if (rpc.error) {
    if (!rpcMissing(rpc.error)) console.warn('tmk_void_receipts RPC ล้มเหลว → fallback batch:', rpc.error?.message || rpc.error);
    for (const ids of chunk(nos, 150)) { // chunk กัน URL ยาวเกินตอน void หลายร้อยใบ
      { const { error } = await supabase.from('tmk_sale_receipts').update({ status: 'void', void_by: by, void_reason: reason, void_at: nowISO(), updated_at: nowISO() }).in('order_no', ids); if (error) throw error; }
      { const { error } = await supabase.from('tmk_mp_orders').update({ status: 'cancelled', updated_at: nowISO() }).in('id', ids.map(receiptId)); if (error) throw error; }
      { const { error } = await supabase.from('tmk_mp_skus').delete().eq('source', 'shipnity').in('order_no', ids); if (error) throw error; }
    }
  }
  invalidateSaleCache('tmk_mp_orders'); invalidateSaleCache('tmk_mp_skus'); invalidateSaleCache('tmk_order_overrides'); invalidateSaleCache('tmk_mp_customers'); markSaleWrite('tmk_sale_receipts');
}

export async function voidReceipt(receipt, { by, reason = '' } = {}) {
  const no = String(receipt.order_no).trim();
  await voidReceipts([no], { by: by || '', reason });
  logAudit({ action: 'delete', entityType: 'receipt', entityName: 'ใบเสร็จ ' + no, entityId: receiptId(no), severity: 'warn', summary: `ยกเลิกใบเสร็จ ${no}${reason ? ` — ${reason}` : ''} โดย ${by || ''}` });
}

/* ============================================================
   restoreReceipt — นำใบที่ void กลับมา (un-void + สร้าง sku คืนจาก payload confirmed)
   voidReceipt ลบ tmk_mp_skus ทิ้ง → restore ต้องสร้างใหม่จาก confirmed.lines ที่เก็บไว้ในใบ
   ============================================================ */
export async function restoreReceipt(receipt, { by } = {}) {
  const no = String(receipt.order_no).trim();
  const { data: rec, error: e0 } = await supabase.from('tmk_sale_receipts').select('*').eq('order_no', no).maybeSingle();
  if (e0) throw e0;
  if (!rec) throw new Error('ไม่พบใบเสร็จ ' + no);
  // สร้าง row จาก payload ก่อน (void ลบ sku ไปแล้ว) — ใช้ตัวสร้างเดียวกับตอนส่ง
  const item = rec.confirmed || rec.parsed;
  const M = await loadReceiptMatcher();
  const built = (item && Array.isArray(item.lines) && item.lines.length)
    ? buildRows(item, { name: rec.salesperson || '', email: rec.uploader_email || '' }, 'restore:' + nowISO(), M) : null;
  // ไม่มี payload รายการสินค้า → ถ้านำกลับ ออเดอร์จะไม่มี sku (ยอด/สี/ไซซ์/ลายเพี้ยนถาวร) → กันไว้ก่อน un-void ให้ UI เห็น
  if (!built) throw new Error(`นำใบ ${no} กลับไม่ได้ — ไม่มีข้อมูลรายการสินค้าที่บันทึกไว้ (โปรดส่งใบใหม่แทน)`);
  // un-void ใบ
  { const { error } = await supabase.from('tmk_sale_receipts')
      .update({ status: 'confirmed', void_by: null, void_reason: null, void_at: null, updated_at: nowISO() })
      .eq('order_no', no); if (error) throw error; }
  // ออเดอร์กลับ active — เช็คว่ามีแถวจริง (คงค่าที่แก้ไว้) · ถ้าแถวหาย (เช่นหลังย้ายเลข) upsert คืนจาก payload กัน sku ลอย
  { const { data, error } = await supabase.from('tmk_mp_orders').update({ status: 'active', updated_at: nowISO() }).eq('id', receiptId(no)).select('id');
    if (error) throw error;
    if ((!data || !data.length) && built) { const { error: e2 } = await supabase.from('tmk_mp_orders').upsert(built.orderRow, { onConflict: 'id' }); if (e2) throw e2; } }
  // insert sku คืน
  if (built && built.skuRows.length) {
    await supabase.from('tmk_mp_skus').delete().eq('source', 'shipnity').eq('order_no', no);   // กันซ้ำ
    const { error } = await supabase.from('tmk_mp_skus').insert(built.skuRows); if (error) throw error;
  }
  invalidateSaleCache('tmk_mp_orders'); invalidateSaleCache('tmk_mp_skus'); invalidateSaleCache('tmk_order_overrides'); invalidateSaleCache('tmk_mp_customers'); markSaleWrite('tmk_sale_receipts');
  logAudit({ action: 'restore', entityType: 'receipt', entityName: 'ใบเสร็จ ' + no, entityId: receiptId(no), summary: `นำใบเสร็จ ${no} กลับมา โดย ${by || ''}` });
}
