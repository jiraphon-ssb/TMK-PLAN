/* ============================================================
   saleCrmDetail.jsx — แยกมาจาก saleCrm.jsx (หน้า "ภาพรวม CRM")
   ============================================================
   Drawer รายละเอียดลูกค้า (ดู/แก้โปรไฟล์ + งานติดตาม + Insight ซื้อบ่อย)
   = popup ลูกค้า "อันเดียว" ทั้งแอป (22 ส.ค.): หน้า CRM ส่ง c จาก buildDirectory · รายงานขาย/ประสิทธิภาพเซลล์ ส่งผ่าน
   CustomerDrawer (customerDrawer.jsx) ที่ประกอบ c จากออเดอร์ในหน่วยความจำ + โปรไฟล์ · skus = รายการสินค้าในหน่วยความจำ
   (ถ้าส่งมา ไม่ต้องยิง query ลาย/สี/ไซซ์)
   ============================================================ */
import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { todayISO } from './lib/dateUtils.js';
import { N, Icon } from './components.jsx';
import { channelColor } from './charts.jsx';
import { SideSheet } from './modals-core.jsx';
import { FormSection, DrawerGroup, DrawerField, Field } from './saleWidgets.jsx';
import { OrderCard } from './orderCard.jsx';
import { fmtBaht } from './lib/money.js';
import { invalidateSaleCache } from './lib/saleData.js';
import { makeSkuResolver, loadResolverMaps } from './lib/designResolve.js';
import { logAudit } from './lib/audit.js';
import { toast, openModal } from './lib/appBus.js';
import { fetchCustomerContacts, saveContact, nextSnoozeISO, cadenceDays, CONTACT_RESULTS, CONTACTS_MIGRATION } from './lib/crmContacts.js';
import { pgErrorText } from './lib/pgError.js';
import { buildFollowUpTask, followUpStatus, addDaysISO } from './lib/crmFollowUp.js';
import { TMK } from './data.js';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const baht = (n) => fmtBaht(Number(n) || 0); // decimal-aware กลาง (lib/money.js)
const TIER_CHIP_CLS = { 'เพชร': 'tier-chip-diamond', 'ทอง': 'tier-chip-gold', 'เงิน': 'tier-chip-silver', 'ทองแดง': 'tier-chip-bronze' };

// CrmField/CrmGroup ยุบไปใช้ DrawerField/DrawerGroup กลาง (saleWidgets · PART 83)
// ชิปนับความถี่ "ดำ ×5" — ใช้กับ Insight ลาย/สี/ไซซ์
const FreqChips = ({ label, items }) => items.length > 0 && (
  <div style={{ marginTop: 12 }}>
    <div className="cap mb-1.5" style={{ fontWeight: 600, color: 'var(--ink-3)' }}>{label}</div>
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      {items.slice(0, 8).map(([k, n]) => <Badge key={k} variant="outline">{k}<span style={{ color: 'var(--ink-4)', marginLeft: 3 }}>×{N(n)}</span></Badge>)}
    </div>
  </div>
);

export function CustomerDetail({ c, onClose, onSaved, skus = null }) {
  const [insight, setInsight] = useState(null);   // { designs, colors, sizes, desByOrder } — lazy จาก skus
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);

  // Insight: ลาย/สี/ไซซ์ ที่ซื้อบ่อย + ลายต่อออเดอร์ (โหลดครั้งเดียวต่อลูกค้า)
  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ล้างก่อนโหลด async ตอนสลับลูกค้า (กัน Insight ของคนก่อนหน้าค้าง)
    setInsight(null);
    (async () => {
      const nos = [...new Set((c.orders || []).map(o => o.order_no).filter(x => x && !String(x).startsWith('(')))];
      if (!nos.length) { if (live) setInsight({ designs: [], colors: [], sizes: [], desByOrder: {} }); return; }
      const cntOf = (rs) => (keyf) => { const mm = new Map(); rs.forEach(x => { const k = (keyf(x) || '').trim(); if (!k) return; mm.set(k, (mm.get(k) || 0) + (Number(x.qty) || 1)); }); return [...mm.entries()].sort((a, b) => b[1] - a[1]); };
      if (skus) {   // มีรายการสินค้าในหน่วยความจำ (รายงานขาย/ประสิทธิภาพเซลล์ — resolve ชื่อลายแล้ว) → ไม่ยิง query
        const set = new Set(nos); const rs = skus.filter(x => set.has(x.order_no)); const cnt = cntOf(rs);
        if (live) setInsight({ designs: cnt(x => x.design), colors: cnt(x => x.color), sizes: cnt(x => x.size), desByOrder: {} });
        return;
      }
      const rows = [];
      for (let i = 0; i < nos.length; i += 150) {
        // ดึง product_code/raw/วันที่ เพิ่ม → resolve ชื่อลายสด (ตรงแดชบอร์ด · แก้ชื่อในแคตตาล็อกไม่แตก 2 bucket)
        const { data } = await supabase.from('tmk_mp_skus').select('order_no,design,color,size,qty,product_code,raw_sku_or_name,order_date').in('order_no', nos.slice(i, i + 150));
        rows.push(...(data || []));
      }
      if (!live) return;
      // resolve ชื่อลายสดด้วย resolver เดียวกับหน้าออเดอร์/แดชบอร์ด (catalog→alias→golden→frozen + as-of)
      const maps = await loadResolverMaps(supabase);
      if (!live) return;
      const resolve = makeSkuResolver(maps);
      rows.forEach(s => { s.design = resolve(s).design || s.design; });
      const cnt = cntOf(rows);
      const desByOrder = {};
      rows.forEach(s => { if (s.design) (desByOrder[s.order_no] = desByOrder[s.order_no] || new Set()).add(s.design); });
      setInsight({ designs: cnt(s => s.design), colors: cnt(s => s.color), sizes: cnt(s => s.size), desByOrder });
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตั้งใจโหลดครั้งเดียวต่อลูกค้า (c.key) · c.orders เป็น array ที่สร้างใหม่ทุก render ใส่เป็น dep จะยิง query รัวๆ
  }, [c.key, skus]);

  const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); toast(`คัดลอก${label}แล้ว`, 'success'); } catch { toast('คัดลอกไม่ได้', 'error'); } };

  /* ---- PART 110: บันทึก/ดูประวัติ "การติดต่อ" ของลูกค้ารายนี้ ---- */
  const [contacts, setContacts] = useState([]);
  const [cMissing, setCMissing] = useState(false);
  const [cBusy, setCBusy] = useState(false);
  const custKey = c.key || c.code || '';
  useEffect(() => {
    let live = true;
    (async () => {
      if (!custKey) return;
      const r = await fetchCustomerContacts(custKey);
      if (!live) return;
      setContacts(r.rows); setCMissing(!!r.missing);
    })();
    return () => { live = false; };
  }, [custKey]);
  const logContact = async (result, snoozeDays) => {
    if (cBusy || !custKey) return;
    setCBusy(true);
    const t = new Date(); const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const r = await saveContact({
      customerKey: custKey, customerName: c.name || '', salesperson: c.salesperson || '', dateISO: today,
      kind: c.flag === 'เสี่ยงหลุด' ? 'repurchase' : 'other', result,
      snoozeUntil: result === 'snooze' ? nextSnoozeISO(today, snoozeDays || 7) : null,
    });
    setCBusy(false);
    if (r.error) { toast(r.missing ? `ต้องรัน migration ${CONTACTS_MIGRATION} ก่อน` : 'บันทึกไม่สำเร็จ: ' + pgErrorText(r.error), r.missing ? 'warn' : 'error'); return; }
    setContacts(list => [r.row, ...list]);
    toast(result === 'snooze' ? `เลื่อนติดต่ออีก ${snoozeDays || 7} วัน` : 'บันทึกการติดต่อแล้ว', 'success');
  };
  const resultLabel = (id) => (CONTACT_RESULTS.find(x => x.id === id) || {}).label || id;

  // สร้างงานติดตาม → เปิดงานใหม่ในระบบโครงการ (prefill)
  // งานติดตาม (PART 111) — ผูกกับลูกค้าด้วยแท็ก crm:<key> → กลับมาดูได้ว่ามีงานค้างอยู่ไหม
  const today = todayISO();
  const fu = followUpStatus(TMK.tasks || [], custKey, today);
  const followUp = (days = 0) => {
    onClose();
    openModal('task', buildFollowUpTask(c, { today, days, owner: c.owner || '' }));
  };

  const startEdit = () => {
    setF({ name: c.name || '', phone: c.contact || '', social: c.social || '', address: c.address || '', province: c.province || '', owner: c.owner || '', cadence: c.cadence || '', note: c.note || '', tags: [...(c.tags || [])], contactChannel: c.contactChannel || '' });
    setEditing(true);
  };
  const saveProfile = async () => {
    if (!f.name.trim()) { toast('ใส่ชื่อลูกค้าก่อน', 'error'); return; }
    /* ⚠️ customer_code เป็น primary key — ถ้าคีย์ว่างจะเขียนทับ "แถวเดียว" ร่วมกันทุกคน
       เกิดกับลูกค้าที่ชื่อถูกปิดบัง (Shopee ณ***์) เพราะ crmCustomerKey คืน '' ให้ชื่อ mask
       ยอมไม่ได้: โปรไฟล์ของลูกค้าคนละคนทับกันถาวร และหน้า CRM ก็ไม่อ่านแถวนั้นกลับอยู่แล้ว */
    if (!String(c.key || '').trim()) {
      toast('ลูกค้ารายนี้ยังไม่มีรหัส (ชื่อถูกปิดบังจากมาร์เก็ตเพลส) — แก้โปรไฟล์ไม่ได้ ต้องผูกเบอร์/รหัสลูกค้าก่อน', 'warn');
      return;
    }
    /* อ่านโปรไฟล์เดิมไม่สำเร็จ = ไม่รู้ว่าของเดิมมีอะไร → เซฟทับ = ลบทิ้ง ห้ามเซฟ */
    if (c.profileReadOk === false) {
      toast('อ่านโปรไฟล์เดิมไม่สำเร็จ — ยังบันทึกไม่ได้ (กันเขียนทับข้อมูลเดิมหาย) ลองรีเฟรชอีกครั้ง', 'error');
      return;
    }
    setBusy(true);
    try {
      const row = {
        customer_code: c.key,
        name: f.name.trim(), phone: f.phone.replace(/\D/g, ''), social_name: f.social.trim(),
        address: f.address.trim(), province: f.province.trim(),
        owner: f.owner.trim(), cadence: f.cadence.trim(), note: f.note.trim(),
        contact_channel: f.contactChannel || '',
        tags: f.tags, updated_at: new Date().toISOString(),
      };
      let { error } = await supabase.from('tmk_mp_customers').upsert(row, { onConflict: 'customer_code' });
      if (error && /note|cadence|tags|contact_channel|column/i.test(error.message || '')) {   // คอลัมน์เสริมยังไม่มี → เซฟส่วนที่เหลือ
        const r2 = { ...row }; delete r2.note; delete r2.cadence; delete r2.tags; delete r2.contact_channel;
        ({ error } = await supabase.from('tmk_mp_customers').upsert(r2, { onConflict: 'customer_code' }));
      }
      if (error) { toast('บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
      toast('บันทึกโปรไฟล์แล้ว', 'success');
      logAudit({
        action: 'update', entityType: 'customer', entityName: row.name || c.key, entityId: row.customer_code || c.key,
        summary: `แก้โปรไฟล์ลูกค้า ${row.name || c.key}`,
        fields: [
          { label: 'ชื่อ', value: row.name || '—' },
          { label: 'เบอร์', value: row.phone || '—' },
          { label: 'โซเชียล', value: row.social_name || '—' },
          { label: 'จังหวัด', value: row.province || '—' },
          ...(row.owner ? [{ label: 'เจ้าของ', value: row.owner }] : []),
          ...(row.cadence ? [{ label: 'รอบติดตาม', value: row.cadence }] : []),
          ...(Array.isArray(row.tags) && row.tags.length ? [{ label: 'แท็ก', value: row.tags.join(', ') }] : []),
        ],
      });
      invalidateSaleCache('tmk_mp_customers');
      onSaved?.(c.key, row);
      setEditing(false);
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setBusy(false); }
  };

  const addr = c.address || (c.province ? `${c.district ? c.district + ' · ' : ''}${c.province} ${c.postcode || ''}` : '');
  const chRows = c.chSales instanceof Map ? [...c.chSales.entries()].sort((a, b) => b[1] - a[1]) : [];
  // desByOrder เลิกใช้ — ประวัติซื้อเปลี่ยนเป็นการ์ดกลางที่โหลดรายการสินค้าเองตอนขยาย (PART 88)

  return (
    <SideSheet size="lg" icon="user" title={c.name} sub={[c.mainChannel && `ช่องทางหลัก ${c.mainChannel}`, c.owner && `เซลล์ ${c.owner}`, c.province].filter(Boolean).join(' · ') || 'ลูกค้า'} onClose={onClose}
      footer={editing
        ? <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
          <Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>ยกเลิก</Button>
          <Button onClick={saveProfile} disabled={busy || !f?.name?.trim()}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกโปรไฟล์'}</Button>
        </div>
        : <Button variant="outline" onClick={onClose}>ปิด</Button>}>

      {!editing ? (<>
        {/* แถวสถานะ — ระดับ/สถานะลูกค้า มาก่อน action (เดิม "ใหม่" ลอยเดี่ยวใต้ปุ่ม · ระดับซ่อนใน sub หัว) */}
        {(c.tier || c.flag || c.cadence || c.repurchase > 0) && (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {c.tier && <span className={`tier-chip ${TIER_CHIP_CLS[c.tier] || ''}`}>{c.tier}</span>}
            {c.flag && <Badge variant="outline" className="rounded-full" style={{ color: c.flag === 'เสี่ยงหลุด' ? 'var(--bad)' : c.flag === 'ขาประจำ' ? 'var(--good)' : 'var(--accent)' }}>{c.flag}</Badge>}
            {c.cadence && <Badge variant="outline" className="rounded-full" style={{ color: 'var(--warn)' }}>ติดตามทุก {cadenceDays(c.cadence) || c.cadence} วัน</Badge>}
            {c.repurchase > 0 && <Badge variant="outline" className="rounded-full" style={{ color: 'var(--good)' }}>ซื้อซ้ำรอบ {c.repurchase}</Badge>}
          </div>
        )}
        {/* แถวปุ่ม: หลัก "โทร" + งานติดตาม + เมนูรอง (เดิมปุ่มเรียงยาว 5 อันน้ำหนักเท่ากันหมด) */}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {c.contact
            ? <Button size="sm" asChild><a href={`tel:${c.contact}`} style={{ textDecoration: 'none' }}><Icon name="phone" /> โทร {c.contact}</a></Button>
            : <span className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่มีเบอร์ติดต่อ — เพิ่มได้ที่ “แก้ไข”</span>}
          {!cMissing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={cBusy}><Icon name="phone" /> บันทึกการติดต่อ</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onSelect={() => logContact('answered')}><Icon name="check" /> โทรแล้ว · รับสาย</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => logContact('closed')}><Icon name="wallet" /> โทรแล้ว · ปิดการขายได้</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => logContact('no_answer')}><Icon name="x" /> โทรแล้ว · ไม่รับสาย</DropdownMenuItem>
                {[7, 14, 30].map(d => <DropdownMenuItem key={d} onSelect={() => logContact('snooze', d)}><Icon name="clock" /> เลื่อนไปอีก {d} วัน</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant={fu.overdue > 0 ? 'default' : 'outline'} title={fu.open > 0 ? `มีงานติดตามค้างอยู่ ${fu.open} งาน` : 'สร้างงานติดตามในระบบโครงการ'}>
                <Icon name="plus" /> งานติดตาม{fu.open > 0 ? ` · ค้าง ${N(fu.open)}` : ''}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onSelect={() => followUp(0)}><Icon name="calendarDays" /> ตามวันนี้</DropdownMenuItem>
              {[3, 7, 14].map(d => <DropdownMenuItem key={d} onSelect={() => followUp(d)}><Icon name="clock" /> ตามในอีก {d} วัน ({addDaysISO(today, d).slice(8, 10)}/{addDaysISO(today, d).slice(5, 7)})</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" aria-label="ตัวเลือกเพิ่มเติม" className="px-2.5"><Icon name="grid" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={startEdit}><Icon name="pencil" /> แก้ไขโปรไฟล์</DropdownMenuItem>
              {c.contact && <DropdownMenuItem onSelect={() => copy(c.contact, 'เบอร์')}><Icon name="layers" /> คัดลอกเบอร์</DropdownMenuItem>}
              {addr && <DropdownMenuItem onSelect={() => copy(addr, 'ที่อยู่')}><Icon name="layers" /> คัดลอกที่อยู่</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* งานติดตามที่ยังค้างของลูกค้าคนนี้ (PART 111) — เดิมกดสร้างซ้ำได้เรื่อยๆ โดยไม่รู้ว่ามีอยู่แล้ว */}
        {fu.open > 0 && (
          <div className="mb-4 rounded-xl border p-3" style={{ borderColor: fu.overdue > 0 ? 'var(--bad)' : 'var(--line)', background: fu.overdue > 0 ? 'color-mix(in srgb, var(--bad) 6%, transparent)' : 'var(--surface-2)' }}>
            <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <Icon name="listChecks" style={{ color: fu.overdue > 0 ? 'var(--bad)' : 'var(--accent)' }} />
              <span className="text-[12.5px] font-semibold" style={{ color: 'var(--ink)' }}>งานติดตามค้างอยู่ {N(fu.open)} งาน</span>
              {fu.overdue > 0 && <span className="cap" style={{ color: 'var(--bad)', fontWeight: 700 }}>เลยกำหนด {N(fu.overdue)}</span>}
            </div>
            <div className="flex flex-col gap-1">
              {fu.openTasks.slice(0, 3).map(t => {
                const due = t.dateEnd || t.dateISO || '';
                const late = due && due < today;
                return (
                  <button type="button" key={t.id} onClick={() => { onClose(); openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] }); }}
                    className="row cap" style={{ gap: 8, alignItems: 'center', textAlign: 'left', width: '100%' }}>
                    <span className="num" style={{ color: late ? 'var(--bad)' : 'var(--ink-3)', minWidth: 54, fontWeight: late ? 700 : 400 }}>{due ? `${due.slice(8, 10)}/${due.slice(5, 7)}` : '—'}</span>
                    <span style={{ color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    <Icon name="chevR" style={{ marginLeft: 'auto', color: 'var(--ink-4)' }} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ประวัติการติดต่อล่าสุด (PART 110) — เห็นว่าใครโทรไปเมื่อไหร่ ผลเป็นยังไง */}
        {contacts.length > 0 && (
          <div className="mb-4 rounded-xl border p-3" style={{ borderColor: 'var(--line)' }}>
            <div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>การติดต่อล่าสุด</div>
            <div className="flex flex-col gap-1.5">
              {contacts.slice(0, 5).map(ct => (
                <div key={ct.id} className="row cap" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="num" style={{ color: 'var(--ink-3)', minWidth: 62 }}>{String(ct.date).slice(8, 10)}/{String(ct.date).slice(5, 7)}</span>
                  <span style={{ fontWeight: 600, color: (CONTACT_RESULTS.find(x => x.id === ct.result) || {}).tone || 'var(--ink-3)' }}>{resultLabel(ct.result)}</span>
                  {ct.snooze_until && <span style={{ color: 'var(--ink-4)' }}>→ นัดใหม่ {String(ct.snooze_until).slice(8, 10)}/{String(ct.snooze_until).slice(5, 7)}</span>}
                  {ct.salesperson && <span style={{ color: 'var(--ink-4)', marginLeft: 'auto' }}>{ct.salesperson}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ยอดซื้อรวมเด่น + 3 ค่ารอง (เดิม 4 กล่องเท่ากัน — ยอดรวมไม่เด่นกว่าอย่างอื่น) */}
        <div className="mb-4 rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
          <div className="text-[11px]" style={{ color: 'var(--ink-4)' }}>ยอดซื้อรวม</div>
          <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span className="num" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.6px', lineHeight: 1.1, color: 'var(--accent)' }}>{baht(c.sales)}</span>
            <span className="cap" style={{ color: 'var(--ink-4)' }}>จาก {N(c.count)} ครั้ง</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg overflow-hidden" style={{ background: 'var(--surface)' }}>
            {[
              ['เฉลี่ย/ครั้ง', baht(c.aov), ''],
              ['ซื้อล่าสุด', c.recency != null ? `${N(c.recency)} วันก่อน` : (c.last || '—'), c.last || ''],
              ['ตัวรวม', c.qty > 0 ? `${N(c.qty)} ตัว` : '—', c.count ? `${(c.qty / c.count).toFixed(1)} ตัว/ครั้ง` : ''],
            ].map(([l, v, sub], i) => (
              <div key={l} className="p-2.5" style={i ? { borderLeft: '1px solid var(--line)' } : undefined}>
                <div className="text-[11px] whitespace-nowrap" style={{ color: 'var(--ink-4)' }}>{l}</div>
                <div className="num" style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>{v}</div>
                {sub && <div className="text-[10.5px] whitespace-nowrap" style={{ color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
              </div>
            ))}
          </div>
        </div>

        <DrawerGroup icon="user" title="ข้อมูลลูกค้า">
          {c.social && <DrawerField label="โซเชียล">@{c.social}</DrawerField>}
          {(c.owner || c.salesperson) && <DrawerField label={c.owner ? 'เซลล์เจ้าของ' : 'เซลล์'}><span style={{ color: c.owner ? 'var(--good)' : 'var(--ink)' }}>{c.owner || c.salesperson}</span></DrawerField>}
          {c.mainChannel && <DrawerField label="ช่องทางหลัก"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full shrink-0" style={{ background: channelColor(c.mainChannel) }} />{c.mainChannel}</span></DrawerField>}
          {chRows.length > 1 && <DrawerField label="ยอดแยกช่องทาง" full><span className="row" style={{ gap: '4px 12px', flexWrap: 'wrap' }}>{chRows.map(([ch, v]) => <span key={ch} className="inline-flex items-center gap-1.5 num"><span className="size-2 rounded-full shrink-0" style={{ background: channelColor(ch) }} />{ch} {baht(v)}</span>)}</span></DrawerField>}
          {c.qty > 0 && <DrawerField label="ตัวรวม">{N(c.qty)} ตัว</DrawerField>}
          {c.province && <DrawerField label="จังหวัด">{c.province}</DrawerField>}
          {c.since && <DrawerField label="เป็นลูกค้าตั้งแต่">{c.since}</DrawerField>}
          {c.last && <DrawerField label="ซื้อล่าสุด">{c.last}</DrawerField>}
          {addr && <DrawerField label="ที่อยู่จัดส่ง" full>{addr}</DrawerField>}
          {c.note && <DrawerField label="โน้ต" full><span style={{ whiteSpace: 'pre-wrap', fontWeight: 500 }}>{c.note}</span></DrawerField>}
        </DrawerGroup>

        {/* Insight ซื้อบ่อย */}
        {insight && (insight.designs.length > 0 || insight.colors.length > 0 || insight.sizes.length > 0) && (
          <div className="rounded-xl border p-3.5 mt-3.5" style={{ borderColor: 'var(--line)', background: 'var(--surface-2, transparent)' }}>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[14px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="sparkle" /></span>
              <span className="text-[13px] font-bold" style={{ color: 'var(--ink)' }}>ซื้อบ่อย — ใช้เชียร์ขายซ้ำ</span>
            </div>
            <FreqChips label="ลาย" items={insight.designs} />
            <FreqChips label="สี" items={insight.colors} />
            <FreqChips label="ไซซ์" items={insight.sizes} />
          </div>
        )}

        {c.tags && c.tags.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="cap mb-2" style={{ fontWeight: 600, color: 'var(--ink-3)' }}>แท็ก</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{c.tags.map((t, i) => <Badge key={i} variant="accent" style={{ fontSize: 11 }}>{t}</Badge>)}</div>
          </div>
        )}

        {/* ประวัติซื้อ — แถวย่อกดขยายเป็นการ์ดเต็ม (PART 88 · โหลดรายการสินค้า/ส่วนลดเฉพาะใบที่กด) */}
        <div className="cap mb-2" style={{ fontWeight: 600, color: 'var(--ink-3)', marginTop: 16 }}>ประวัติการซื้อ ({N((c.orders || []).length)})</div>
        {(c.orders || []).length === 0
          ? <div className="cap" style={{ color: 'var(--ink-4)', padding: 12 }}>ไม่มีประวัติออเดอร์ในระบบ</div>
          : <div className="flex flex-col gap-1.5" style={{ maxHeight: 340, overflowY: 'auto' }}>
              {(c.orders || []).map((o, i) => <OrderCard key={o.order_no + '#' + i} o={o} lines={c.linesByOrder?.get?.(o.order_no)} collapsed hideCustomer />)}
            </div>}
      </>) : (
        /* ---------- โหมดแก้ไขโปรไฟล์ ---------- */
        <FormSection icon="user" title="แก้ไขโปรไฟล์ลูกค้า">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="ชื่อลูกค้า *"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="เบอร์โทร"><Input inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="เช่น 0812345678" /></Field>
            <Field label="โซเชียล (FB/LINE)"><Input value={f.social} onChange={e => setF({ ...f, social: e.target.value })} /></Field>
            <Field label="จังหวัด"><Input value={f.province} onChange={e => setF({ ...f, province: e.target.value })} /></Field>
            <Field label="เซลล์เจ้าของ"><Input value={f.owner} onChange={e => setF({ ...f, owner: e.target.value })} placeholder="ชื่อเซลล์ที่ดูแล" /></Field>
            <Field label="รอบติดตาม (จำนวนวัน)" hint="ใส่ตัวเลข เช่น 30 = ถ้าเงียบเกิน 30 วันจะขึ้นลิสต์ &quot;ถึงรอบติดตาม&quot;">
              <Input value={f.cadence} onChange={e => setF({ ...f, cadence: e.target.value })} placeholder="เว้นว่าง = ไม่ตั้ง" inputMode="numeric" />
            </Field>
          </div>
          {/* ช่องทางติดต่อหลัก (CRM) — กำหนดว่าลูกค้ารายนี้เป็นลูกค้า "โทร/LINE" (เข้ากลุ่ม CRM แม้ยอดมาจากช่องอื่น) */}
          <Field label="ช่องทางติดต่อหลัก (CRM)" className="mt-3">
            <ToggleGroup type="single" value={f.contactChannel || 'none'} onValueChange={(v) => setF({ ...f, contactChannel: v === 'none' ? '' : v })} className="gap-0.5 rounded-md border bg-muted/30 p-0.5 w-fit">
              {[['none', 'ไม่ระบุ'], ['Phone', 'โทร'], ['LINE', 'LINE'], ['Facebook', 'Facebook']].map(([v, l]) => (
                <ToggleGroupItem key={v} value={v} size="sm" className="px-3 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">{l}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field label="ที่อยู่จัดส่ง" className="mt-3"><Textarea rows={2} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field>
          {/* แท็ก — พิมพ์แล้ว Enter เพื่อเพิ่ม */}
          <Field label={`แท็ก (${f.tags.length})`} className="mt-3">
            {f.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{f.tags.map((t, i) => (
              <Badge key={t + i} variant="secondary" className="gap-1 rounded-full py-1 pl-2.5 pr-1 font-normal">{t}
                <button type="button" aria-label={`ลบ ${t}`} className="ml-0.5 inline-flex rounded-full p-0.5 text-[var(--ink-4)] hover:bg-[var(--surface-2)] hover:text-[var(--bad)]" onClick={() => setF({ ...f, tags: f.tags.filter((_, j) => j !== i) })}><Icon name="x" /></button>
              </Badge>
            ))}</div>}
            <Input className="h-8" placeholder="พิมพ์แท็กแล้วกด Enter เช่น ขายส่ง / VIP" onKeyDown={e => {
              const v = e.target.value.trim();
              if (e.key === 'Enter' && v) { e.preventDefault(); if (!f.tags.includes(v)) setF({ ...f, tags: [...f.tags, v] }); e.target.value = ''; }
            }} />
          </Field>
          <Field label="โน้ต" className="mt-3"><Textarea rows={3} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="บันทึกภายใน เช่น ชอบสั่งช่วงสิ้นเดือน / ให้ส่ง Flash เท่านั้น" /></Field>
        </FormSection>
      )}
    </SideSheet>
  );
}
