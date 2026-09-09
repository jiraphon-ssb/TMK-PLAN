import { useState, useEffect, useMemo } from 'react';
import { N, Icon, PageSkeleton } from './components.jsx';
import { SideSheet } from './modals-core.jsx';
import { GOLDEN_DESIGNS, resolveDesign, suggestDesign } from './lib/shirtCatalog.js';
import { buildMatchers, planRematch } from './lib/mpReport.js';
import { DesignCombobox } from './components/ProductPicker.jsx';
import { GOLDEN_CATALOG_GRID } from './lib/goldenGrid.js';
import { CardTable } from './components/DataTableParts.jsx';
import { supabase } from './lib/supabaseClient.js';
import { clearSaleCache } from './lib/saleData.js';
import { useSaleRealtime } from './lib/saleRealtime.js';
import { logAudit } from './lib/audit.js';
import { toast } from './lib/appBus.js';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from '@/components/ui/search-input';
import { EmptyState } from './components/EmptyState.jsx';

async function fetchAllRows(table, select, { eq, order, asc = true, pageSize = 1000 } = {}) {
  const out = []; let from = 0;
  for (let i = 0; i < 200; i++) {
    let q = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (eq) for (const k in eq) q = q.eq(k, eq[k]);
    if (order) q = q.order(order, { ascending: asc, nullsFirst: false });
    const { data, error } = await q;
    if (error) return { error };
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: out };
}


// ป้ายเดือนสำหรับหัวการ์ด CRM

const flagOfAttrs = (a) => { if (!a) return ''; if (typeof a === 'string') { try { return JSON.parse(a).flag || ''; } catch { return ''; } } return a.flag || ''; };
function groupAnoms(rows, keyf) {
  const o = {};
  rows.forEach(r => { const k = keyf(r); if (!k) return; (o[k] = o[k] || { key: k, count: 0, qty: 0, channels: new Set(), sample: '' }); o[k].count++; o[k].qty += Number(r.qty) || 0; if (r.channel) o[k].channels.add(r.channel); if (!o[k].sample) o[k].sample = r.raw_sku_or_name || ''; });
  return Object.values(o).map(v => ({ ...v, channels: [...v.channels] })).sort((a, b) => b.count - a.count);
}
// สถิติแบบ inline บนแถบสรุปหน้า "คุณภาพข้อมูล" — แทน MetricCard 4 ใบ
const HealthStat = ({ label, value, tone, sub }) => (
  <div style={{ minWidth: 84 }}>
    <div className="cap" style={{ color: 'var(--ink-4)' }}>{label}</div>
    <div className="num" style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2, color: tone || 'var(--ink-1)' }}>{value}</div>
    {sub && <div className="cap num" style={{ color: 'var(--ink-4)' }}>{sub}</div>}
  </div>
);

// Combobox เลือกชื่อลายมาตรฐาน (shadcn Popover + Command/cmdk) — เลื่อนได้แม้อยู่ใน SideSheet
export function HealthHub() { // แท็บ "คุณภาพข้อมูล" ในหน้าตั้งค่า (PART 102 · ย้ายมาจากหน้า Data Hub ที่ลบแล้ว)
  const [skus, setSkus] = useState(null);
  const [aliases, setAliases] = useState([]);
  const [noTable, setNoTable] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState(null); // { kind, term, code, design }
  const [busy, setBusy] = useState(false);
  const [aliasQ, setAliasQ] = useState('');
  const [issueQ, setIssueQ] = useState('');
  const [rematch, setRematch] = useState(null); // null | ผลจาก planRematch
  const [rmBusy, setRmBusy] = useState(false);
  const [rmProg, setRmProg] = useState(0);

  const load = async () => {
    const s = await fetchAllRows('tmk_mp_skus', 'source,channel,design,color,size,product_code,qty,raw_sku_or_name,attrs,match_how');
    if (s.error) { setErr(s.error.message); return null; }
    setSkus(s.data);
    const a = await supabase.from('tmk_mp_aliases').select('*').order('created_at', { ascending: false });
    if (a.error) { setNoTable(true); setAliases([]); } else { setNoTable(false); setAliases(a.data || []); }
    return s.data;
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดข้อมูล async ตอน mount (load() เป็น async · setState เกิดหลัง await) = pattern ปกติ
  useEffect(() => { load(); }, []);
  useSaleRealtime(['tmk_mp_skus', 'tmk_mp_aliases'], load); // นำเข้า/จับคู่ใหม่ที่ไหน คุณภาพข้อมูลเห็นสด

  const A = useMemo(() => {
    const rows = skus || [];
    const newDesigns = groupAnoms(rows.filter(r => r.design && !String(r.product_code || '').trim()), r => r.design);
    const newColors = groupAnoms(rows.filter(r => flagOfAttrs(r.attrs) === 'color_new'), r => r.color);
    const unmatched = groupAnoms(rows.filter(r => !r.design), r => `${r.channel || '?'} · ${r.color || '—'}`);
    const matched = rows.filter(r => r.design).length;
    const withCode = rows.filter(r => String(r.product_code || '').trim()).length;
    return { newDesigns, newColors, unmatched, total: rows.length, matched, withCode };
  }, [skus]);

  // เปิดฟอร์ม alias — ถ้าเป็นลาย ลองให้ resolver แนะนำลาย golden + รหัสให้อัตโนมัติ
  const openAlias = (kind, term) => {
    if (kind === 'design') { const g = resolveDesign(term); setForm({ kind, term: term || '', code: g ? g.code : '', design: g ? g.name : '' }); }
    else setForm({ kind, term: term || '', code: '', design: '' });
  };
  const saveAlias = async () => {
    if (!form || !form.term.trim()) return;
    setBusy(true);
    const term = form.term.trim();
    const id = `${form.kind}:${term.toLowerCase()}`;
    const row = { id, kind: form.kind, term, code: (form.code || '').trim(), design: (form.design || '').trim(), updated_at: new Date().toISOString() };
    const { error } = await supabase.from('tmk_mp_aliases').upsert(row, { onConflict: 'id' });
    setBusy(false);
    if (error) { toast(noTable ? 'ต้องรัน migration tmk_mp_aliases ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
    logAudit({ action: 'create', entityType: 'product', entityName: 'alias', summary: `ตั้ง alias ${form.kind} "${term}"${row.code ? ' → ' + row.code : ''}` });
    setForm(null); const fresh = await load();
    // auto-scan ให้เห็นผลกับออเดอร์เก่าทันที (ไม่ต้องกด "ตรวจการจับคู่ใหม่" เอง · ไม่ต้องรอรอบนำเข้าถัดไป)
    const M = buildMatchers(GOLDEN_CATALOG_GRID, [row, ...aliases.filter(a => a.id !== row.id)]);
    const plan = planRematch(fresh || [], M);
    if (plan.changes.length) { setRematch(plan); toast(`ตั้ง alias แล้ว — พบ ${plan.changes.length} กลุ่มที่อัปเดตได้ กด "ใช้การจับคู่ใหม่" เพื่อแก้ออเดอร์เก่า`, 'success'); }
    else toast('ตั้ง alias แล้ว (ยังไม่พบแถวเก่าที่ตรง)', 'success');
  };
  const delAlias = async (a) => {
    const { error } = await supabase.from('tmk_mp_aliases').delete().eq('id', a.id);
    if (error) { toast('ลบไม่สำเร็จ', 'error'); return; }
    load();
    // เลิกทำ = เขียน alias กลับ (มีข้อมูลแถวครบ)
    const undo = async () => {
      const { id, kind, term, code, design } = a;
      const { error: e2 } = await supabase.from('tmk_mp_aliases').upsert({ id, kind, term, code: code || '', design: design || '', updated_at: new Date().toISOString() }, { onConflict: 'id' });
      toast(e2 ? 'กู้คืนไม่สำเร็จ' : 'กู้คืน alias แล้ว', e2 ? 'error' : 'success');
      load();
    };
    toast(`ลบ alias "${a.term}" แล้ว`, 'success', 6000, { label: 'เลิกทำ', onClick: undo });
  };

  // 2C — จับคู่ลายใหม่บนข้อมูลเดิม (ไม่ต้อง reimport): รัน buildMatchers ตาม alias/แคตตาล็อกปัจจุบัน
  const scanRematch = () => {
    const M = buildMatchers(GOLDEN_CATALOG_GRID, aliases);
    const plan = planRematch(skus || [], M);
    setRematch(plan);
    if (!plan.changes.length) toast('ข้อมูลจับคู่เป็นปัจจุบันแล้ว — ไม่มีอะไรต้องอัปเดต', 'success');
  };
  const applyRematch = async () => {
    if (!rematch || !rematch.changes.length) return;
    setRmBusy(true); setRmProg(0);
    let ok = 0, fail = 0; const ch = rematch.changes;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      const patch = { design: c.design, product_code: c.product_code, match_how: c.match_how };
      if (c.color) patch.color = c.color;   // เติมสี/ไซซ์ให้แถวเก่าที่ว่าง (ใบเสร็จ) — ไม่ทับของที่มีอยู่
      if (c.size) patch.size = c.size;
      /* จำกัดให้โดนเฉพาะแถวที่ "หน้าตาเหมือนตัวอย่าง" — patch คิดจากแถวเดียวแต่เดิมยิงโดนทั้งกลุ่ม
         ทำให้แถวที่แก้สี/ไซซ์ด้วยมือถูกทับ (คอมเมนต์เดิมบอกว่า "ไม่ทับของที่มีอยู่" ซึ่งไม่จริง) */
      const runUpdate = (p) => {
        let q = supabase.from('tmk_mp_skus').update(p).eq('source', c.source).eq('raw_sku_or_name', c.raw);
        q = (c.oldCode ? q.eq('product_code', c.oldCode) : q.or('product_code.is.null,product_code.eq.'));
        if (c.curDesign !== undefined) q = c.curDesign ? q.eq('design', c.curDesign) : q.or('design.is.null,design.eq.');
        if (c.curColor !== undefined) q = c.curColor ? q.eq('color', c.curColor) : q.or('color.is.null,color.eq.');
        if (c.curSize !== undefined) q = c.curSize ? q.eq('size', c.curSize) : q.or('size.is.null,size.eq.');
        return q;
      };
      let { error } = await runUpdate(patch);
      // graceful: ถ้าคอลัมน์ color/size มีปัญหา → เขียนลาย/รหัสอย่างเดียวให้ persist แน่ (ไม่ให้ทั้งก้อนพัง)
      if (error && /color|size|column/i.test(error.message || '') && (patch.color !== undefined || patch.size !== undefined)) {
        const base = { design: c.design, product_code: c.product_code, match_how: c.match_how };
        ({ error } = await runUpdate(base));
      }
      if (error) fail++; else ok++;
      setRmProg(Math.round((i + 1) / ch.length * 100));
    }
    setRmBusy(false);
    const total = rematch.filled + rematch.fixed;
    logAudit({ action: 'update', entityType: 'product', entityName: 're-match', summary: `จับคู่ลายใหม่ ${total} แถว (เติม ${rematch.filled} · แก้ ${rematch.fixed})` });
    clearSaleCache();
    toast(fail ? `อัปเดต ${ok} กลุ่มสำเร็จ · ${fail} กลุ่มล้มเหลว` : `อัปเดตการจับคู่สำเร็จ ${ok} กลุ่ม (${total} แถว)`, fail ? 'warn' : 'success');
    // converge: โหลดสด แล้วสแกนซ้ำจากข้อมูลใหม่ — เหลือเฉพาะที่ยังไม่ตรงจริง (ไม่ "ขึ้นซ้ำ" ทั้งชุดเดิม)
    const fresh = await load();
    const M2 = buildMatchers(GOLDEN_CATALOG_GRID, aliases);
    const plan2 = planRematch(fresh || [], M2);
    setRematch(plan2.changes.length ? plan2 : null);
  };

  // รวม 3 ชนิดปัญหาเป็นตารางเดียว "ต้องตรวจ" — เรียงตามจำนวนแถวมาก→น้อย
  const issues = useMemo(() => {
    const mk = (arr, kind, label, tone, act) => arr.map(d => ({ ...d, kind, label, tone, act }));
    return [
      ...mk(A.newDesigns, 'design', 'ลายไม่มีรหัส', 'var(--warn)', 'ผูกลาย'),
      ...mk(A.newColors, 'color', 'สีใหม่', 'var(--bad)', 'เพิ่มสี'),
      ...mk(A.unmatched, 'unmatched', 'จับคู่ไม่ได้', 'var(--ink-3)', null),
    ].sort((a, b) => b.count - a.count);
  }, [A]);

  if (skus === null && !err) return <PageSkeleton />;
  if (err) return <div className="w-full max-w-5xl"><Card className="p-5" style={{ color: 'var(--bad)' }}>โหลดข้อมูลไม่ได้: {err}</Card></div>;

  const matchRatio = A.total ? A.matched / A.total : 0;
  const matchPct = !A.total ? 0 : (A.matched === A.total ? 100 : Math.min(99, Math.floor(matchRatio * 100)));
  const shownIssues = issueQ.trim()
    ? issues.filter(d => `${d.label} ${d.key} ${d.sample || ''} ${(d.channels || []).join(' ')}`.toLowerCase().includes(issueQ.trim().toLowerCase()))
    : issues;

  return (
    <div className="w-full max-w-5xl" style={{ display: 'grid', gap: 14 }}>
      {noTable && <Card className="p-3" style={{ color: 'var(--warn)', borderLeft: '3px solid var(--warn)' }}><Icon name="alertTriangle" /> ยังไม่ได้สร้างตาราง <code>tmk_mp_aliases</code> — รันไฟล์ <code>supabase/migrations/20260623-mp-aliases.sql</code> ใน Supabase ก่อน จึงจะตั้ง alias ได้ (ส่วนอื่นยังดูได้ปกติ)</Card>}

      {/* แถบสรุป + จับคู่ใหม่ — บรรทัดเดียวจบ */}
      <Card className="p-4">
        <div className="row" style={{ gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <HealthStat label="SKU ทั้งหมด" value={N(A.total)} />
          <HealthStat label="จับคู่ลายได้" value={A.total ? `${matchPct}%` : '—'} sub={A.total ? `${N(A.matched)}/${N(A.total)}` : null}
            tone={!A.total ? undefined : matchPct >= 98 ? 'var(--good)' : 'var(--warn)'} />
          <HealthStat label="มีรหัสลาย" value={N(A.withCode)} />
          <HealthStat label="ต้องตรวจ" value={N(issues.length)} tone={issues.length ? 'var(--warn)' : 'var(--good)'} />
          <div style={{ flex: 1 }} />
          <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {rematch && (rematch.changes.length
              ? <Badge variant="secondary">พบ {N(rematch.filled + rematch.fixed)} แถว (เติม {N(rematch.filled)} · แก้ {N(rematch.fixed)})</Badge>
              : <span className="cap row" style={{ color: 'var(--good)', gap: 4 }}><Icon name="check" /> จับคู่เป็นปัจจุบันแล้ว</span>)}
            <Button variant="outline" size="sm" onClick={scanRematch} disabled={rmBusy || !skus}><Icon name="refresh" /> ตรวจการจับคู่ใหม่</Button>
          </div>
        </div>
        <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 8 }}>ตั้ง alias / แก้แคตตาล็อกแล้ว กด "ตรวจการจับคู่ใหม่" เพื่ออัปเดตออเดอร์เก่าทั้งหมด — ไม่ต้องนำเข้าไฟล์ซ้ำ</div>
        {rematch && rematch.changes.length > 0 && <>
          <CardTable style={{ maxHeight: 240, overflow: 'auto', marginTop: 10 }}><Table>
            <TableHeader><TableRow><TableHead>ข้อความในไฟล์</TableHead><TableHead>ลายใหม่</TableHead><TableHead>รหัส</TableHead><TableHead style={{ textAlign: 'right' }}>แถว</TableHead></TableRow></TableHeader>
            <TableBody>{rematch.changes.slice(0, 60).map((c, i) => (
              <TableRow key={i}>
                <TableCell className="cell-title num" style={{ maxWidth: 240, whiteSpace: 'normal', wordBreak: 'break-word' }}>{c.raw || '—'}</TableCell>
                <TableCell>{c.design} {c.filled ? <Badge variant="success" className="ml-1">เติม</Badge> : <Badge variant="secondary" className="ml-1">แก้</Badge>}</TableCell>
                <TableCell className="num">{c.product_code || '—'}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{N(c.rows)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table></CardTable>
          {rematch.changes.length > 60 && <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 4 }}>…และอีก {N(rematch.changes.length - 60)} กลุ่ม</div>}
          <div className="row" style={{ gap: 10, marginTop: 12, alignItems: 'center' }}>
            <Button onClick={applyRematch} disabled={rmBusy}><Icon name="check" /> {rmBusy ? `กำลังอัปเดต… ${rmProg}%` : `ใช้การจับคู่ใหม่ (${N(rematch.changes.length)} กลุ่ม)`}</Button>
            <Button variant="ghost" onClick={() => setRematch(null)} disabled={rmBusy}>ยกเลิก</Button>
          </div>
        </>}
      </Card>

      {/* ตารางรวม "ต้องตรวจ" — ลายไม่มีรหัส / สีใหม่ / จับคู่ไม่ได้ ในที่เดียว */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div className="row between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', gap: 10, flexWrap: 'wrap' }}>
          <span className="row" style={{ gap: 8, fontWeight: 700, alignItems: 'center' }}>
            <span style={{ color: issues.length ? 'var(--warn)' : 'var(--good)' }}><Icon name="shield" /></span> ต้องตรวจ
            <Badge variant={issues.length ? 'warning' : 'success'}>{issues.length ? `${N(issues.length)} รายการ` : 'ปกติ'}</Badge>
          </span>
          {issues.length > 10 && <SearchInput value={issueQ} onChange={e => setIssueQ(e.target.value)} placeholder="ค้นหา" className="h-8" wrapperClassName="w-52" />}
        </div>
        {issues.length === 0
          ? <div className="row" style={{ gap: 8, padding: '16px', color: 'var(--good)', fontSize: 13 }}><Icon name="check" /> ข้อมูลสะอาด — ทุกแถวจับคู่ลายได้ ไม่มีลาย/สีแปลกใหม่</div>
          : shownIssues.length === 0
            ? <EmptyState size="inline" mode="filtered" className="px-4" title={`ไม่พบรายการที่ตรงกับ "${issueQ}"`} />
            : <CardTable style={{ maxHeight: 440, overflow: 'auto' }}><Table>
              <TableHeader><TableRow>
                <TableHead>ปัญหา</TableHead><TableHead>รายการ</TableHead>
                <TableHead style={{ textAlign: 'right' }}>แถว</TableHead><TableHead style={{ textAlign: 'right' }}>ตัว</TableHead>
                <TableHead>ช่องทาง</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>{shownIssues.map(d => (
                <TableRow key={d.kind + d.key}>
                  <TableCell><Badge variant="outline" style={{ color: d.tone, borderColor: d.tone, fontWeight: 600 }}>{d.label}</Badge></TableCell>
                  <TableCell style={{ maxWidth: 260 }}><b>{d.key}</b>{d.sample && d.sample !== d.key ? <div className="cap" style={{ color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(d.sample).slice(0, 60)}</div> : null}</TableCell>
                  <TableCell className="num" style={{ textAlign: 'right' }}>{N(d.count)}</TableCell>
                  <TableCell className="num" style={{ textAlign: 'right' }}>{N(d.qty)}</TableCell>
                  <TableCell className="cap" style={{ color: 'var(--ink-3)' }}>{(d.channels || []).join(', ') || '—'}</TableCell>
                  <TableCell style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{d.act && <Button variant="outline" size="sm" onClick={() => openAlias(d.kind, d.key)}><Icon name="plus" /> {d.act}</Button>}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table></CardTable>}
      </Card>

      {/* ตาราง Alias ที่ตั้งไว้ */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div className="row between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', gap: 10, flexWrap: 'wrap' }}>
          <span className="row" style={{ gap: 8, fontWeight: 700, alignItems: 'center' }}>
            <span style={{ color: 'var(--accent)' }}><Icon name="listChecks" /></span> Alias ที่ตั้งไว้
            <Badge variant="secondary">{N(aliases.length)} รายการ</Badge>
          </span>
          <div className="row" style={{ gap: 8 }}>
            {aliases.length > 10 && <SearchInput value={aliasQ} onChange={e => setAliasQ(e.target.value)} placeholder="ค้นหา" className="h-8" wrapperClassName="w-52" />}
            <Button variant="outline" size="sm" onClick={() => openAlias('design', '')}><Icon name="plus" /> เพิ่ม alias</Button>
          </div>
        </div>
        {(() => {
          const shownAliases = aliasQ.trim()
            ? aliases.filter(a => `${a.term} ${a.design || ''} ${a.code || ''}`.toLowerCase().includes(aliasQ.trim().toLowerCase()))
            : aliases;
          if (aliases.length === 0) return <EmptyState size="inline" icon="sparkle" className="px-4" title="ยังไม่มี alias" hint='กด "ผูกลาย/เพิ่มสี" จากตารางต้องตรวจ หรือเพิ่มเอง' />;
          if (shownAliases.length === 0) return <EmptyState size="inline" mode="filtered" className="px-4" title={`ไม่พบ alias ที่ตรงกับ "${aliasQ}"`} />;
          return <CardTable style={{ maxHeight: 360, overflow: 'auto' }}><Table>
            <TableHeader><TableRow><TableHead>ชนิด</TableHead><TableHead>คำในไฟล์</TableHead><TableHead>แมปเป็น</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{shownAliases.map(a => (
              <TableRow key={a.id}>
                <TableCell><Badge variant={a.kind === 'color' ? 'outline' : 'secondary'}>{a.kind === 'color' ? 'สี' : 'ลาย'}</Badge></TableCell>
                <TableCell style={{ fontWeight: 600 }}>{a.term}</TableCell>
                <TableCell className="cap" style={{ color: 'var(--ink-3)' }}>{a.kind === 'design' ? <>{a.design || '—'}{a.code ? <span className="num"> ({a.code})</span> : ''}</> : 'สีที่ระบบรู้จัก'}</TableCell>
                <TableCell style={{ textAlign: 'right' }}><Button variant="outline" size="sm" style={{ color: 'var(--bad)' }} onClick={() => delAlias(a)}><Icon name="trash" /></Button></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table></CardTable>;
        })()}
      </Card>

      {form && (
        <SideSheet size="md" icon={form.kind === 'color' ? 'sparkle' : 'shield'}
          title={form.kind === 'color' ? 'เพิ่มสีที่ระบบรู้จัก' : 'ผูกลายเข้ากับ catalog'}
          sub={form.kind === 'color' ? 'ลงทะเบียนคำสีใหม่ กันระบบเข้าใจผิดว่าเป็นลาย' : 'แมปชื่อที่สะกดต่าง/ลายใหม่ ไปยังรหัส catalog'}
          onClose={() => setForm(null)}
          footer={<>
            <Button variant="outline" onClick={() => setForm(null)}>ยกเลิก</Button>
            <Button disabled={busy || !form.term.trim()} onClick={saveAlias}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก alias'}</Button>
          </>}>
          <div className="field"><label>คำที่เจอในไฟล์</label><Input value={form.term} onChange={e => setForm({ ...form, term: e.target.value })} placeholder={form.kind === 'color' ? 'เช่น ส้มอิฐ' : 'เช่น ราษภักดี'} autoFocus /></div>
          {form.kind === 'design' && <>
            <div className="field"><label>ชื่อลายมาตรฐาน (เลือกจากแคตตาล็อก {GOLDEN_DESIGNS.length} ลาย)</label>
              <DesignCombobox value={form.design} code={form.code} onPick={({ name, code }) => setForm({ ...form, design: name, code: code || form.code })} />
            </div>
            <div className="field"><label>รหัส catalog (เติมให้อัตโนมัติเมื่อเลือกลาย)</label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="เช่น JRP111" /></div>
            {(() => { const exact = resolveDesign(form.term); const g = exact || suggestDesign(form.term); return g && g.name !== form.design ? <div className="cap" style={{ color: 'var(--accent)' }}><Icon name="lightbulb" /> {exact ? 'แนะนำ' : 'ใกล้เคียง (สะกดต่าง?)'}: {g.name} ({g.code}) — <Button variant="outline" size="sm" style={{ padding: '1px 8px' }} onClick={() => setForm({ ...form, design: g.name, code: g.code })}>ใช้</Button></div> : null; })()}
          </>}
          <div className="cap" style={{ color: 'var(--ink-4)' }}>* มีผลกับการนำเข้าครั้งถัดไป — ตั้งแล้วนำเข้าไฟล์ใหม่/รี-ซิงก์เพื่อใช้</div>
        </SideSheet>
      )}

    </div>
  );
}

// หมายเหตุ: หน้า "ส่งยอด & ข้อมูล" ถูกลบแล้ว (PART 102) — HealthHub อยู่ในตั้งค่า · ส่งยอดอยู่ในปุ่มลอยหน้าประสิทธิภาพเซล
// (HealthHub ด้านบน export ให้แท็บ "คุณภาพข้อมูล" ใช้)

