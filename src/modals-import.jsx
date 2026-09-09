import { useState, useEffect, useMemo, useRef } from 'react';
import { N, Icon } from './components.jsx';
import { supabase } from './lib/supabaseClient.js';
import { buildMaster, buildSku, summarize, detectFileKind, buildMatchers, auditImport, auditColumns } from './lib/mpReport.js';
import { writeMonthlyRollup } from './lib/monthlyRollup.js';
import { invalidateSaleCache } from './lib/saleData.js';
import { Button } from '@/components/ui/button';
import { GOLDEN_CATALOG_GRID } from './lib/goldenGrid.js';
import { logAudit } from './lib/audit.js';
import { SideSheet, toast, uid } from './modals-core.jsx';

function detectDelimiter(s) {
  const sample = String(s || '').split(/\r?\n/).slice(0, 10).join('\n');
  let best = ',', bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    let q = false, n = 0;
    for (let i = 0; i < sample.length; i++) { const c = sample[i]; if (c === '"') q = !q; else if (!q && c === d) n++; }
    if (n > bestScore) { bestScore = n; best = d; }
  }
  return best;
}
function parseCSV(text, delim) {
  const s = String(text || '').replace(/^\uFEFF/, ''); // ตัด BOM
  const d = delim || detectDelimiter(s);
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

// อ่านข้อความ CSV แบบรู้ encoding: ลอง UTF-8 ก่อน ถ้าเจอตัวอักษรเสีย (�) ลอง windows-874 (TIS-620 ภาษาไทย)
function smartDecodeCSV(buf) {
  const u8 = new TextDecoder('utf-8').decode(buf);
  const bad = (u8.match(/�/g) || []).length;
  if (bad === 0) return { text: u8, encoding: 'utf-8' };
  try {
    const th = new TextDecoder('windows-874').decode(buf);
    const badTh = (th.match(/�/g) || []).length;
    if (badTh < bad) return { text: th, encoding: 'windows-874', recovered: true };
  } catch { /* เบราว์เซอร์ไม่รองรับ windows-874 */ }
  return { text: u8, encoding: 'utf-8', mojibake: bad };
}


/* ---------- รายงานรวมข้ามช่อง: นำเข้าไฟล์ขาย (Shipnity base + Shopee/TikTok เสริม + catalog) ---------- */
// เลิกใช้ไฟล์ Shipnity แล้ว (ยอด Shipnity เข้าทางหน้า "ส่งยอดใบเสร็จ") — import เหลือมาร์เก็ตเพลสล้วน
const MP_KIND_LABEL = { shopee: 'Shopee', tiktok: 'TikTok', catalog: 'แคตตาล็อกลาย', unknown: 'ไม่รู้จัก' };
const MAX_IMPORT_BYTES = 25 * 1024 * 1024; // 25MB — กันไฟล์ใหญ่จนหน่วยความจำบวม (malformed-file guard · SEC)
async function mpFileToGrid(file) {
  if (file?.size > MAX_IMPORT_BYTES) throw new Error(`ไฟล์ใหญ่เกิน ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)}MB (${file.name}) — แบ่งไฟล์ให้เล็กลง`);
  if (/\.(xlsx|xls|xlsm|xlsb)$/i.test(file.name)) {
    const buf = await file.arrayBuffer();
    const XLSX = await import('xlsx');
    let wb;
    try { wb = XLSX.read(buf, { type: 'array' }); }
    catch { throw new Error(`อ่านไฟล์ไม่ได้ (${file.name}) — ไฟล์อาจเสียหรือไม่ใช่ Excel จริง`); } // กันไฟล์ปลอม/เสีย crash ทั้งการนำเข้า
    if (!wb?.SheetNames?.length) throw new Error(`ไฟล์ไม่มีชีตข้อมูล (${file.name})`);
    const pick = wb.SheetNames.find(s => /ordersku|^orders$|sheet1/i.test(s)) || wb.SheetNames[0];
    return XLSX.utils.sheet_to_json(wb.Sheets[pick], { header: 1, raw: false, defval: '' });
  }
  const buf = await file.arrayBuffer();
  const { text } = smartDecodeCSV(buf);
  return parseCSV(text);
}
const mpChunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

// รวมหลายไฟล์ชนิดเดียวกัน (เช่น Shipnity 20 ไฟล์) → กริดเดียว · จับคอลัมน์ตามชื่อหัว กันคอลัมน์เรียงไม่ตรง
function mergeGrids(grids) {
  const valid = (grids || []).filter(g => g && g.length);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  const header = [], seen = new Set();
  valid.forEach(g => (g[0] || []).forEach(h => { const k = String(h ?? '').trim(); if (k && !seen.has(k)) { seen.add(k); header.push(k); } }));
  const out = [header];
  valid.forEach(g => {
    const hmap = {}; (g[0] || []).forEach((h, i) => { hmap[String(h ?? '').trim()] = i; });
    for (let r = 1; r < g.length; r++) { const row = g[r] || []; out.push(header.map(h => (h in hmap ? row[hmap[h]] : ''))); }
  });
  return out;
}

export function MpImportModal({ onClose, onDone }) {
  const [files, setFiles] = useState([]); // [{ id, name, kind, grid }]
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aliases, setAliases] = useState([]); // ชื่อพ้อง/สีใหม่ จาก tmk_mp_aliases
  const [step, setStep] = useState(1);         // 1 = เลือกไฟล์ · 2 = ตรวจข้อมูลละเอียด
  const fileRef = useRef(null);
  useEffect(() => { (async () => { const { data } = await supabase.from('tmk_mp_aliases').select('kind,term,code,design'); if (data) setAliases(data); })(); }, []);

  const onFiles = async (e) => {
    const picked = Array.from(e.target.files || []); e.target.value = '';
    if (!picked.length) return;
    setLoading(true);
    const added = [];
    for (const f of picked) {
      try {
        let grid = await mpFileToGrid(f);
        let kind = detectFileKind(grid);
        if (kind === 'shipnity') { toast(`${f.name}: ไฟล์ Shipnity เลิกใช้แล้ว — ยอด Shipnity ส่งผ่านแท็บ "ส่งยอดใบเสร็จ"`, 'warn'); continue; }
        if (kind === 'tiktok' && grid.length > 2) grid = [grid[0], ...grid.slice(2)]; // ตัดแถวคำอธิบาย
        added.push({ id: uid('f'), name: f.name, kind, grid, rows: Math.max(0, grid.length - 1) });
      } catch (err) { toast(`อ่าน ${f.name} ไม่สำเร็จ: ${err?.message || ''}`, 'error'); }
    }
    setLoading(false);
    // รับหลายไฟล์ต่อชนิดได้ (Shipnity 20 ไฟล์ ฯลฯ) — dedup ตามชื่อไฟล์ (อัปโหลดชื่อซ้ำ = ทับ)
    setFiles(prev => { const map = {}; [...prev, ...added].forEach(f => { map[f.kind + '::' + f.name] = f; }); return Object.values(map); });
  };
  const removeFile = (id) => setFiles(prev => prev.filter(f => f.id !== id));
  const cntKind = (k) => files.filter(f => f.kind === k).length;

  const result = useMemo(() => {
    const shopee = mergeGrids(files.filter(f => f.kind === 'shopee').map(f => f.grid));
    const tiktok = mergeGrids(files.filter(f => f.kind === 'tiktok').map(f => f.grid));
    // แคตตาล็อก: ใช้ไฟล์ที่อัปมา → ถ้าไม่อัป ใช้ golden ในตัว (1,617 SKU จากตารางลายเสื้อ) ไม่ต้องอัปทุกรอบ
    const catalog = mergeGrids(files.filter(f => f.kind === 'catalog').map(f => f.grid)) || GOLDEN_CATALOG_GRID;
    if (!shopee && !tiktok) return null; // มาร์เก็ตเพลสล้วน — Shopee/TikTok ไฟล์เดียวก็นำเข้าได้
    const master0 = buildMaster({ shopee, tiktok });
    const M = buildMatchers(catalog, aliases);
    const sku0 = buildSku({ shopee, tiktok }, catalog, { aliases });
    // dedup กันไฟล์ที่นำเข้าทับกัน (order_no ซ้ำข้ามไฟล์) → กัน ON CONFLICT + ตัวเลขไม่เฟ้อ
    const omap = new Map(); master0.forEach(m => omap.set(`${m.source}:${m.order_no}`, m)); const master = [...omap.values()];
    const sseen = new Set(); const sku = sku0.filter(s => { const k = `${s.source}|${s.order_no}|${s.design}|${s.color}|${s.size}|${s.qty}|${s.line_sales}|${s.raw_sku_or_name || ''}`; if (sseen.has(k)) return false; sseen.add(k); return true; });
    return { master, sku, dropped: { orders: master0.length - master.length, skus: sku0.length - sku.length }, sum: summarize(master, sku), audit: auditImport(master, sku, M), cols: auditColumns(files) };
  }, [files, aliases]);
  // ไฟล์ที่ขาดคอลัมน์บังคับ (หรือไม่รู้ชนิด) = บล็อกการบันทึก — ตัวเลขที่จะเขียนผิดแน่นอน
  const colBlocked = (result?.cols || []).length > 0;

  const baht = n => '฿' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const save = async () => {
    if (!result || saving) return;
    setSaving(true);
    try {
      const { master, sku } = result;
      const batch = 'imp-' + Date.now().toString(36);
      const omByOrder = {}, odByOrder = {}; master.forEach(m => { omByOrder[m.order_no] = m.order_month; odByOrder[m.order_no] = m.order_date || null; });
      const months = master.map(m => m.order_month).filter(Boolean);
      const overall = months.sort((a, b) => months.filter(x => x === b).length - months.filter(x => x === a).length)[0] || '';
      // 1) upsert orders (id = source:order_no)
      const oRows = master.map(m => ({ id: `${m.source}:${m.order_no}`, ...m, import_batch: batch }));
      for (const ch of mpChunk(oRows, 500)) { const { error } = await supabase.from('tmk_mp_orders').upsert(ch, { onConflict: 'id' }); if (error) throw error; }
      // 2) ลบ sku ของ order ที่จะนำเข้า (แยก source) แล้ว insert ใหม่ — กันบรรทัดเก่าค้าง
      const bySrc = {}; sku.forEach(s => { (bySrc[s.source] = bySrc[s.source] || new Set()).add(s.order_no); });
      for (const src in bySrc) { for (const ids of mpChunk([...bySrc[src]], 150)) { const { error } = await supabase.from('tmk_mp_skus').delete().eq('source', src).in('order_no', ids); if (error) throw error; } }
      const sRows = sku.map((s, i) => ({ id: `${s.source}:${s.order_no}:${i}`, ...s, order_month: omByOrder[s.order_no] || overall, order_date: odByOrder[s.order_no] || null, import_batch: batch }));
      for (const ch of mpChunk(sRows, 500)) { const { error } = await supabase.from('tmk_mp_skus').insert(ch); if (error) throw error; }
      // (โปรไฟล์ลูกค้าเลิกดึงจากไฟล์ — ใบเสร็จหน้า "ส่งยอด" เติมลูกค้าให้เอง)
      // 3) ledger การนำเข้า (ไม่บล็อกถ้าตารางยังไม่มี)
      try {
        const chans = [...new Set(master.map(m => m.channel))].join(', ');
        await supabase.from('tmk_mp_import_batches').insert({ id: batch, source_files: files.map(f => f.name).join(', '), row_orders: master.length, row_skus: sku.length, sales_total: result.sum.sales, qty_total: result.sum.qty, channels: chans, month_span: overall, status: 'active' });
      } catch { /* ledger optional */ }
      // 4) monthly rollup (PART 12/T4) — สรุปรายเดือนจาก master (order-level, dedup แล้ว) · non-blocking
      await writeMonthlyRollup(master);
      // 5) ล้างแคช sale เฉพาะตารางที่เพิ่งเขียน → dashboard เห็นข้อมูลใหม่โดยไม่ต้อง hard-reload
      invalidateSaleCache('tmk_mp_orders'); invalidateSaleCache('tmk_mp_skus');
      logAudit({ action: 'create', entityType: 'order', entityName: 'นำเข้ามาร์เก็ตเพลส', summary: `นำเข้ารายงานรวม ${master.length} ออเดอร์ · ${sku.length} SKU (${overall})`, fields: [{ label: 'ออเดอร์', value: `${N(master.length)}` }, { label: 'ยอดขาย', value: baht(result.sum.sales) }], data: { orders: master.length, skus: sku.length } });
      toast(`บันทึกแล้ว: ${master.length} ออเดอร์ · ${sku.length} SKU`, 'success');
      onDone?.(); onClose();
    } catch (err) {
      const msg = /relation .* does not exist|tmk_mp_|column .* does not exist|schema cache|PGRST204/i.test(err?.message || '') ? 'ตาราง/คอลัมน์ยังไม่ครบ — รัน migration ล่าสุด (20260623-mp-foundation.sql) ใน Supabase ก่อน' : (err.message || '');
      toast('บันทึกไม่สำเร็จ: ' + msg, 'error');
    } finally { setSaving(false); }
  };

  const need = !cntKind('shopee') && !cntKind('tiktok'); // มาร์เก็ตเพลสอย่างน้อย 1 ไฟล์ · แคตตาล็อกมี golden ในตัวสำรอง
  const kindSummary = ['shopee', 'tiktok', 'catalog'].map(k => [k, cntKind(k)]).filter(([, n]) => n > 0);
  const footer = step === 1
    ? (<>
        <Button variant="outline" onClick={onClose}>ปิด</Button>
        <Button disabled={!result} onClick={() => setStep(2)}>{result ? <>ตรวจข้อมูล <Icon name="external" /></> : (need ? 'ต้องมีไฟล์ Shopee หรือ TikTok' : 'เลือกไฟล์ก่อน')}</Button>
      </>)
    : (<>
        <Button variant="outline" onClick={() => setStep(1)}>← ย้อนกลับ</Button>
        {/* ⚠️ ขาดคอลัมน์บังคับ = ตัวเลขที่จะเขียนลงระบบผิดแน่นอน (qty/ยอด = 0 · ใบยกเลิกกลายเป็นใบปกติ)
            แล้ว upsert ทับแถวเดิมที่ยอดถูกอยู่ → ต้องปิดปุ่ม ไม่ใช่แค่ขึ้นคำเตือนแล้วปล่อยกดได้ */}
        <Button disabled={!result || saving || colBlocked} onClick={save}
          title={colBlocked ? 'ไฟล์ขาดคอลัมน์บังคับ — แก้ไฟล์แล้วอัปใหม่ก่อน' : undefined}>
          <Icon name="check" /> {saving ? 'กำลังบันทึก…' : colBlocked ? 'บันทึกไม่ได้ — ไฟล์ขาดคอลัมน์' : `บันทึกลงระบบ (${N(result?.master.length || 0)} ออเดอร์)`}
        </Button>
      </>);
  return (
    <SideSheet size="xl" icon="external" title="นำเข้าข้อมูลมาร์เก็ตเพลส" sub={step === 1 ? 'ขั้น 1/2 · เลือกไฟล์' : 'ขั้น 2/2 · ตรวจข้อมูลก่อนบันทึก'} onClose={onClose} footer={footer}>
      {step === 1 ? (<>
        <div className="cap" style={{ marginBottom: 12, color: 'var(--ink-3)' }}>
          ลากไฟล์ <b>Shopee / TikTok</b> มาได้หลายไฟล์พร้อมกัน — ระบบรู้เองว่าไฟล์ไหนคืออะไร · ไฟล์เดียวก็นำเข้าได้ · แคตตาล็อกใช้ <b>golden ในตัว</b> ให้แล้ว (อัปไฟล์แคตตาล็อกเองได้ถ้าอยากแทน) · <b>ยอด Shipnity ไม่ใช้ไฟล์แล้ว</b> — เซลล์ส่งผ่านแท็บ "ส่งยอดใบเสร็จ"
        </div>
        <div className="row" style={{ gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button size="sm" onClick={() => fileRef.current?.click()}><Icon name="external" /> {loading ? 'กำลังอ่าน…' : 'เลือกไฟล์ (หลายไฟล์ได้)'}</Button>
          <input ref={fileRef} type="file" multiple accept=".csv,.xlsx,.xls,.xlsm,.xlsb" style={{ display: 'none' }} onChange={onFiles} />
        </div>
        {files.length === 0
          ? <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)', border: '1px dashed var(--line)', borderRadius: 'var(--r-sm)' }}>ยังไม่ได้เลือกไฟล์</div>
          : <div style={{ display: 'grid', gap: 8, marginBottom: 12, maxHeight: 320, overflow: 'auto' }}>
              {files.map(f => (
                <div key={f.id} className="row between" style={{ gap: 8, padding: '8px 12px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--line)', flexWrap: 'wrap' }}>
                  <span style={{ minWidth: 0, wordBreak: 'break-all' }}><span className={'chip ' + (f.kind === 'unknown' ? 'chip-bad' : f.kind === 'catalog' ? 'chip-good' : 'chip-accent')} style={{ marginRight: 8 }}>{MP_KIND_LABEL[f.kind]}</span>{f.name} <span className="cap">· {N(f.rows)} แถว</span></span>
                  <Button variant="ghost" size="sm" onClick={() => removeFile(f.id)}><Icon name="trash" /></Button>
                </div>
              ))}
            </div>}
        {files.length > 0 && <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <span className="cap" style={{ color: 'var(--ink-3)' }}>รวม {N(files.length)} ไฟล์:</span>
          {kindSummary.map(([k, n]) => <span key={k} className="badge badge-default">{MP_KIND_LABEL[k]} × {N(n)}</span>)}
          <span className="cap" style={{ color: 'var(--ink-4)' }}>· {N(files.reduce((a, f) => a + (f.rows || 0), 0))} แถวรวม</span>
        </div>}
        {need && files.length > 0 && <div className="cap" style={{ color: 'var(--warn)', marginBottom: 10 }}>⚠️ ยังไม่มีไฟล์มาร์เก็ตเพลส (Shopee/TikTok)</div>}
        {!cntKind('catalog') && !need && <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 10 }}>ℹ️ ไม่ได้อัปไฟล์แคตตาล็อก — จะใช้ golden ในตัว (1,617 SKU จากตารางลายเสื้อ)</div>}
        {result && <div className="cap" style={{ color: 'var(--good)', fontWeight: 600 }}>✓ อ่านไฟล์เสร็จ ({N(result.master.length)} ออเดอร์) — กด "ตรวจข้อมูล" เพื่อดูละเอียดก่อนบันทึก</div>}
      </>) : !result ? <div className="cap" style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)' }}>ยังไม่มีข้อมูล — กดย้อนกลับไปเลือกไฟล์</div> : (<>
        <div className="metric-grid" style={{ marginBottom: 12 }}>
          <div className="metric-card"><div className="cap">ออเดอร์</div><div className="num" style={{ fontSize: 20, fontWeight: 700 }}>{N(result.sum.orders)}</div></div>
          <div className="metric-card"><div className="cap">ยอดขายรวม</div><div className="num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-2)' }}>{baht(result.sum.sales)}</div></div>
          <div className="metric-card"><div className="cap">จำนวนตัว</div><div className="num" style={{ fontSize: 20, fontWeight: 700 }}>{N(result.sum.qty)}</div></div>
          <div className="metric-card"><div className="cap">จับคู่ลาย</div><div className="num" style={{ fontSize: 20, fontWeight: 700, color: result.sum.matchedPct >= 99 ? 'var(--good)' : 'var(--warn)' }}>{result.sum.matchedPct.toFixed(1)}%</div><div className="cap" style={{ color: 'var(--ink-4)' }}>{N(result.sum.skuLines)} SKU</div></div>
        </div>
        {result.dropped && (result.dropped.orders > 0 || result.dropped.skus > 0) && <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 10 }}><Icon name="refresh" /> ไฟล์ทับกัน — ตัดออเดอร์ซ้ำ {N(result.dropped.orders)} · SKU ซ้ำ {N(result.dropped.skus)} (เก็บรายการล่าสุด)</div>}

        <div className="row between" style={{ alignItems: 'baseline', margin: '4px 0 8px' }}>
          <div className="eyebrow">รายการออเดอร์ที่จะนำเข้า</div>
          <span className="cap" style={{ color: 'var(--ink-4)' }}>แสดง {N(Math.min(result.master.length, 500))} จาก {N(result.master.length)}</span>
        </div>
        <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}><table className="table">
          <thead><tr><th>วันที่</th><th>ออเดอร์</th><th>ช่อง</th><th>เซลล์</th><th>ลูกค้า</th><th>จว.</th><th style={{ textAlign: 'right' }}>ยอด</th><th style={{ textAlign: 'right' }}>ตัว</th></tr></thead>
          <tbody>{result.master.slice(0, 500).map((m, i) => (
            <tr key={i}><td className="cap">{m.order_date || '—'}</td><td className="num">{m.order_no}</td><td className="cap">{m.channel}</td><td className="cap">{/^\(/.test(m.salesperson) ? '—' : m.salesperson}</td><td className="cap" style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.customer_name || '—'}</td><td className="cap">{m.province || '—'}</td><td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(m.sales || 0)}</td><td className="num" style={{ textAlign: 'right' }}>{N(m.qty || 0)}</td></tr>
          ))}</tbody>
        </table></div>

        <div className="eyebrow" style={{ margin: '16px 0 8px' }}>ยอดตามช่องทาง</div>
        <div style={{ display: 'grid', gap: 2 }}>
          {Object.entries(result.sum.byChannel).sort((a, b) => b[1].value - a[1].value).map(([k, v]) => (
            <div key={k} className="row between" style={{ padding: '6px 2px', borderBottom: '1px solid var(--line)' }}>
              <span style={{ fontWeight: 500 }}>{k}</span>
              <span className="num cap" style={{ color: 'var(--ink-4)' }}>{N(v.count)} ออเดอร์ · <b style={{ color: 'var(--ink)', fontWeight: 700 }}>{baht(v.value)}</b></span>
            </div>
          ))}
        </div>

        {(() => { const a = result.audit, cols = result.cols || []; const warn = (a.newDesigns.length + a.newColors.length + cols.length) > 0; return (
          <div style={{ marginTop: 14, border: `1px solid ${warn ? 'var(--warn)' : 'var(--line)'}`, borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
            <div className="row between" style={{ padding: '9px 12px', background: warn ? 'rgba(227,155,46,.10)' : 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
              <b className="row" style={{ gap: 7 }}><Icon name="shield" /> ตรวจสุขภาพการนำเข้า</b>
              <span className="badge badge-outline" style={{ color: warn ? 'var(--warn)' : 'var(--good)' }}>{warn ? 'มีของต้องตรวจ' : 'ผ่านสะอาด ✓'}</span>
            </div>
            <div style={{ padding: '8px 12px', display: 'grid', gap: 6, fontSize: 13 }}>
              {cols.map((c, i) => <div key={'c' + i} style={{ color: 'var(--bad)' }}>⚠️ <b>{c.file}</b> {c.kind === 'unknown' ? 'ไม่รู้ชนิดไฟล์' : `ขาดคอลัมน์: ${c.missing.join(', ')}`}</div>)}
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <span className="cap" style={{ color: 'var(--ink-3)' }}>ลายใหม่/ไม่มีรหัส:</span>
                {a.newDesigns.length ? a.newDesigns.slice(0, 8).map((d, i) => <span key={i} className="badge badge-outline" style={{ background: 'rgba(227,155,46,.14)', color: 'var(--warn)' }}>{d.key} ×{d.count}</span>) : <span className="cap" style={{ color: 'var(--good)' }}>ไม่มี ✓</span>}
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <span className="cap" style={{ color: 'var(--ink-3)' }}>สีที่ยังไม่รู้จัก:</span>
                {a.newColors.length ? a.newColors.slice(0, 8).map((d, i) => <span key={i} className="badge badge-outline" style={{ background: 'rgba(224,81,74,.14)', color: 'var(--bad)' }}>{d.key} ×{d.count}</span>) : <span className="cap" style={{ color: 'var(--good)' }}>ไม่มี ✓</span>}
              </div>
              <div className="cap" style={{ color: 'var(--ink-4)' }}>จัดการชื่อพ้อง/เพิ่มสีได้ที่แท็บ "คุณภาพข้อมูล" (ตั้งแล้วนำเข้าซ้ำเพื่อใช้)</div>
            </div>
          </div>
        ); })()}

        <div className="cap" style={{ marginTop: 8, color: 'var(--ink-4)' }}>บันทึกแล้วจะ "ทับ" ออเดอร์รหัสเดิม (อัปโหลดเดือนเดิมซ้ำได้ ไม่บวกซ้ำ)</div>
      </>)}
    </SideSheet>
  );
}

/* ---------- Campaign modal ---------- */


