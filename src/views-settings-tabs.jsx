/* ============================================================
   views-settings-tabs.jsx — sub-view แท็บของหน้า "ตั้งค่า" (PART 84 REFACTOR-1 · แยกจาก views-settings god-file)
   ============================================================
   SettingsBody (views-settings.jsx) เป็น orchestrator เรียก sub-view เหล่านี้ · behavior-preserving file-split
   ============================================================ */
import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from './components.jsx';
import { ReorderButtons } from './components/ReorderButtons.jsx';
import { useData } from './dataContext.jsx';
import { MonthPicker } from './components/MonthPicker.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit, diffFields } from './lib/audit.js';
import { fetchTargets, saveTarget } from './lib/targets.js';
import { normCutoffDay, DEFAULT_CUTOFF_DAY } from './lib/commissionCycle.js';
import { MonthTargetsZone } from './settingsMonthTargets.jsx'; // PART 103 D13: เป้าเดือน+ต่อช่องทาง ย้ายมาจากหน้ายอดขาย
import { fetchCrmTargets, saveCrmTarget } from './lib/crmTargets.js';
import { APP_VERSION } from './appVersion.js';   // ไม่ดึง changelog.js เข้ามา (ก้อนใหญ่)
import { todayISO } from './lib/dateUtils.js';
import { Card, CardContent } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/search-input';
import { Input } from '@/components/ui/input';
import { MoneyInput } from './components/MoneyInput.jsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { DD, guardEdit, guardAdmin } from './saleWidgets.jsx';
import { TRASH_TABLES, needsAdminToPurge, purgeWarning } from './lib/trashTables.js';
import { toast, confirm, openModal, goSection, userEmail, isAdmin, canEdit } from './lib/appBus.js';

export function CampaignsView() {
  const { reload, refresh } = useData() || {};
  const stMeta = { live: { l: 'กำลังดำเนินการ', cls: 'chip-good' }, upcoming: { l: 'กำลังจะมา', cls: 'chip-accent' }, paused: { l: 'หยุดชั่วคราว', cls: 'chip-warn' }, cancelled: { l: 'ยกเลิก', cls: '' }, done: { l: 'จบแล้ว', cls: '' } };
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const campaigns = DD.campaigns || [];

  // ลบแคมเปญ — ตรวจว่ามี task ผูกอยู่ก่อน
  const deleteCampaign = async (c) => {
    if (!guardEdit()) return;
    const linkedTasks = (DD.tasks || []).filter(t => t.camp === c.id).length;
    const msg = linkedTasks > 0
      ? `แคมเปญ "${c.name}" มี ${linkedTasks} งานผูกอยู่ — ลบจะปลด link ไปไม่มีแคมเปญ ยืนยัน?`
      : `ลบแคมเปญ "${c.name}"?`;
    if (!await confirm({ title: 'ลบแคมเปญ', body: msg, danger: true, confirmText: 'ลบ' })) return;
    setBusy(true);
    try {
      // ปลด link tasks (set camp = NULL) ก่อน
      if (linkedTasks > 0) {
        await supabase.from('tmk_tasks').update({ camp: null }).eq('camp', c.id);
      }
      // ลบ campaign → ถังขยะ (soft delete)
      const { error } = await supabase.from('tmk_campaigns').update({ deleted_at: new Date().toISOString() }).eq('id', c.id);
      if (error) throw error;
      logAudit({ action: 'delete', entityType: 'campaign', entityName: c.name, summary: `ลบแคมเปญ "${c.name}"` });
      if (refresh) await refresh(['tmk_campaigns', 'tmk_tasks']); else if (reload) await reload();
      toast('ย้ายแคมเปญไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => {
          try {
            await supabase.from('tmk_campaigns').update({ deleted_at: null }).eq('id', c.id);
            if (refresh) await refresh(['tmk_campaigns']); else if (reload) await reload();
            toast('กู้คืนแคมเปญแล้ว', 'success');
          } catch (e) { toast('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
        },
      });
    } catch (err) {
      toast('ลบไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  // เลื่อนแคมเปญ — บันทึก sort_order ไป Supabase
  const reorderCampaign = async (fromId, toId) => {
    if (!guardEdit()) return;
    if (fromId === toId) return;
    const fromIdx = campaigns.findIndex(c => c.id === fromId);
    const toIdx = campaigns.findIndex(c => c.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;

    const reordered = [...campaigns];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    setBusy(true);
    try {
      // อัปเดต sort_order ทุกแคมเปญตาม index ใหม่
      const updates = reordered.map((c, i) =>
        supabase.from('tmk_campaigns').update({ sort_order: i + 1 }).eq('id', c.id)
      );
      const results = await Promise.all(updates);
      const failed = results.find(r => r.error);
      if (failed) {
        // ถ้า column sort_order ไม่มี → แจ้ง user ให้รัน migration
        if (/sort_order/i.test(failed.error.message)) {
          toast('ต้อง alter table เพิ่ม sort_order ก่อน — รัน SQL migration ใหม่', 'warn');
        } else throw failed.error;
      } else toast('เรียงลำดับใหม่เรียบร้อย', 'success');
      if (refresh) await refresh(['tmk_campaigns']); else if (reload) await reload();
    } catch (err) {
      toast('เลื่อนไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="text-sm text-muted-foreground font-medium">
          {campaigns.length} แคมเปญ · เรียงลำดับด้วยปุ่มลูกศร หรือลากการ์ด
        </div>
        <Button onClick={() => openModal('campaign')}>
          <Icon name="plus" className="size-4 mr-2" /> สร้างแคมเปญ
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {campaigns.length === 0 && (
          <div className="col-span-full py-16 text-center text-muted-foreground border-2 border-dashed rounded-lg bg-muted/10">
            <p className="text-sm">ยังไม่มีแคมเปญ — กด "+ สร้างแคมเปญ" เพื่อเริ่ม</p>
          </div>
        )}
        {campaigns.map((c, idx) => {
          const isOver = dragOver === c.id;
          const statusMeta = stMeta[c.status] || stMeta.done;

          // ความคืบหน้างาน — นับงานที่เสร็จ / ทั้งหมด ของแคมเปญนี้
          const linked = (DD.tasks || []).filter(t => t.camp === c.id);
          const total = linked.length;
          const done = linked.filter(t => t.status === 'done').length;
          const pct = total ? Math.round((done / total) * 100) : 0;

          // สถานะเวลา — นับถอยหลังจากวันเริ่ม/วันจบ เทียบวันนี้
          const today = todayISO();
          const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
          let time;
          if (c.endISO && today > c.endISO) {
            time = { label: 'จบแล้ว', tone: 'done' };
          } else if (c.startISO && today < c.startISO) {
            const d = diffDays(today, c.startISO);
            time = { label: d <= 1 ? 'เริ่มพรุ่งนี้' : `เริ่มในอีก ${d} วัน`, tone: 'upcoming' };
          } else if (c.endISO) {
            const d = diffDays(today, c.endISO);
            time = d === 0 ? { label: 'วันสุดท้าย', tone: 'urgent' } : { label: `เหลืออีก ${d} วัน`, tone: d <= 3 ? 'urgent' : 'live' };
          } else {
            time = { label: 'กำลังดำเนินการ', tone: 'live' };
          }
          const timeCls = time.tone === 'upcoming' ? 'bg-primary/10 text-primary'
            : time.tone === 'urgent' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : time.tone === 'live' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-muted text-muted-foreground';

          return (
            <Card key={c.id}
              draggable
              onDragStart={() => setDragId(c.id)}
              onDragEnd={() => { setDragId(null); setDragOver(null); }}
              onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== c.id) setDragOver(c.id); }}
              onDragLeave={() => setDragOver(o => o === c.id ? null : o)}
              onDrop={() => { if (dragId) reorderCampaign(dragId, c.id); setDragId(null); setDragOver(null); }}
              className="flex flex-col transition-all overflow-hidden"
              style={{
                borderLeftWidth: '4px',
                borderLeftColor: c.color || 'var(--border)',
                cursor: busy ? 'wait' : 'grab',
                transform: isOver ? 'scale(1.02)' : 'scale(1)',
                boxShadow: isOver ? '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' : undefined,
                background: isOver ? 'hsl(var(--accent)/0.1)' : undefined,
                opacity: dragId === c.id ? 0.4 : 1,
              }}>
              <CardContent className="p-4 flex-1 flex flex-col gap-3">
                {/* หัวการ์ด: handle + ชื่อเต็ม + ป้ายสถานะ */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex gap-2 min-w-0 flex-1">
                    <ReorderButtons label={c.name} index={idx} total={campaigns.length} disabled={busy}
                      onMove={(d) => reorderCampaign(c.id, campaigns[idx + d].id)} />
                    <h3 className="font-bold text-[15px] leading-snug line-clamp-2 hover:underline cursor-pointer min-w-0 flex-1" title={c.name} onClick={() => openModal('campaign', { ...c, channels: c.channels || [] })}>
                      {c.name}
                    </h3>
                  </div>
                  <Badge variant="outline" className={`shrink-0 ${statusMeta.cls === 'chip-good' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : statusMeta.cls === 'chip-accent' ? 'bg-primary/10 text-primary border-primary/20' : statusMeta.cls === 'chip-warn' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : ''}`}>
                    {statusMeta.l}
                  </Badge>
                </div>

                {/* ช่วงเวลา + นับถอยหลัง */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-muted-foreground tabular-nums">{c.start} – {c.end}</span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium ${timeCls}`}>
                    <Icon name="clock" className="size-3" />{time.label}
                  </span>
                </div>

                {/* ความคืบหน้างาน */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground"><Icon name="listChecks" className="size-3.5" />ความคืบหน้างาน</span>
                    <span className="font-semibold tabular-nums">{total ? <>{done}/{total} <span className="text-muted-foreground font-normal">({pct}%)</span></> : <span className="text-muted-foreground font-normal">ยังไม่มีงาน</span>}</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>

                {/* ฐานการ์ด: ช่องทาง + ปุ่มแก้/ลบ */}
                <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-border/50">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    {(c.channels || []).length === 0
                      ? <span className="text-[11px] text-muted-foreground/60">ไม่มีช่องทาง</span>
                      : (c.channels || []).map(id => {
                          const ch = DD.channels.find(x => x.id === id);
                          return ch ? <span key={id} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><span className="size-2.5 rounded-full" style={{ background: ch.hex }} />{ch.name}</span> : null;
                        })}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); openModal('campaign', { ...c, channels: c.channels || [] }); }} title="แก้ไขแคมเปญ">
                      <Icon name="pencil" className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); deleteCampaign(c); }} disabled={busy} title="ลบแคมเปญ">
                      <Icon name="trash" className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}


// ===== เป้าขาย + คอมมิชชั่นต่อเซลล์ (PART 12 / T3) =====
// graceful: ตาราง tmk_targets ยังไม่ migrate → Save แจ้งให้รัน migration (ไม่พัง)
export function TargetsView() {
  const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const numOf = (r, f) => Number((r || {})[f]) || 0;

  const [month, setMonth] = useState(thisMonth);
  const [receiptNames, setReceiptNames] = useState([]);   // เซลล์ที่ส่งใบเสร็จ "เดือนนี้" เท่านั้น
  const [orphanNames, setOrphanNames] = useState([]);     // มีเป้าเดือนนี้แต่ยังไม่ส่งใบเสร็จ (ซ่อนไว้ก่อน · opt-in)
  const [manualNames, setManualNames] = useState([]);     // เพิ่มเองในเซสชัน (ตั้งเป้าล่วงหน้า)
  const [showOrphans, setShowOrphans] = useState(false);
  const [rows, setRows] = useState({});                   // name -> { sales_target, commission_rate }
  const [baseline, setBaseline] = useState({});           // ค่าที่บันทึกแล้ว (เทียบหาแถวที่แก้ค้าง)
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [savingAll, setSavingAll] = useState(false);
  const [addName, setAddName] = useState('');
  // วันตัดรอบค่าคอม (ค่าเดียวทั้งทีม · ใช้ใน popup "ค่าคอมรอบตัด") — null = คอลัมน์ยังไม่ migrate
  const [cutoffDay, setCutoffDay] = useState(DEFAULT_CUTOFF_DAY);
  const [cutoffReady, setCutoffReady] = useState(false);

  // โหลดค่า setting วันตัด async ครั้งเดียวตอน mount
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('tmk_settings').select('commission_cutoff_day').eq('id', 'main').maybeSingle();
        if (!live) return;
        if (!error) { setCutoffDay(normCutoffDay(data?.commission_cutoff_day)); setCutoffReady(true); }
      } catch { /* คอลัมน์ยังไม่ migrate → โชว์ default อ่านอย่างเดียว */ }
    })();
    return () => { live = false; };
  }, []);

  const saveCutoffDay = async (v) => {
    const day = normCutoffDay(v);
    const prev = cutoffDay;
    setCutoffDay(day); // optimistic
    const { error } = await supabase.from('tmk_settings').update({ commission_cutoff_day: day }).eq('id', 'main');
    if (error) { setCutoffDay(prev); toast('เซฟวันตัดไม่ได้ — รัน migration 20260813-commission-cutoff.sql ก่อน', 'error'); return; }
    logAudit({ action: 'update', entityType: 'target', entityName: 'วันตัดรอบค่าคอม', summary: `ตั้งวันตัดรอบค่าคอม: ทุกวันที่ ${day}`, changes: [{ label: 'วันตัด', before: String(prev), after: String(day) }] });
    toast(`ตั้งวันตัดรอบค่าคอมเป็นวันที่ ${day} แล้ว`, 'success');
  };

  const load = async () => {
    setLoading(true);
    setManualNames([]); setShowOrphans(false);
    // รายชื่อ = คนที่ส่งใบเสร็จ "เดือนนี้" เท่านั้น (order_month = เดือนที่เลือก · ตัด void)
    const recSet = new Set();
    const add = (v) => { const n = String(v || '').trim(); if (n && n !== 'ไม่ระบุเซลล์') recSet.add(n); };
    try {
      const { data } = await supabase.from('tmk_sale_receipts').select('salesperson').eq('order_month', month).neq('status', 'void');
      (data || []).forEach(r => add(r.salesperson));
    } catch { /* ตารางใบเสร็จ optional */ }
    const [targets, crmTargets] = await Promise.all([fetchTargets(month), fetchCrmTargets(month)]);
    const map = {};
    targets.forEach(t => { map[t.salesperson] = { ...(map[t.salesperson] || {}), sales_target: t.sales_target ?? 0, commission_rate: t.commission_rate ?? 0 }; });
    crmTargets.forEach(t => { map[t.salesperson] = { ...(map[t.salesperson] || {}), crm_target: t.sales_target ?? 0, calls_target: t.calls_target ?? 0, answer_rate_target: t.answer_rate_target ?? 0 }; });
    // เป้าที่บันทึกไว้แต่คนนั้นยังไม่ส่งใบเสร็จเดือนนี้ → orphan (โผล่เมื่อกด "แสดง" · กันเป้าหาย · รวมคนที่ตั้งแต่เป้า CRM)
    const orphans = [...new Set([...targets.map(t => t.salesperson), ...crmTargets.map(t => t.salesperson)].filter(n => n && !recSet.has(n)))];
    setReceiptNames([...recSet]);
    setOrphanNames(orphans);
    setRows(map);
    setBaseline(JSON.parse(JSON.stringify(map)));
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- โหลดข้อมูลเป้า async ตอนเปลี่ยนเดือน (pattern ปกติ) · load ถูกสร้างใหม่ทุก render ใส่เป็น dep จะยิง query รัวๆ
  useEffect(() => { load(); }, [month]);

  // รายชื่อที่แสดง = ส่งใบเสร็จเดือนนี้ + เพิ่มเอง (+ orphan เมื่อกดแสดง)
  const people = useMemo(() => {
    const s = new Set([...receiptNames, ...manualNames]);
    if (showOrphans) orphanNames.forEach(n => s.add(n));
    return [...s].sort((a, b) => a.localeCompare(b, 'th'));
  }, [receiptNames, manualNames, orphanNames, showOrphans]);

  const isDirty = (name) => ['sales_target', 'commission_rate', 'crm_target', 'calls_target', 'answer_rate_target']
    .some(f => numOf(rows[name], f) !== numOf(baseline[name], f));
  const dirtyNames = people.filter(isDirty);

  const setField = (name, field, val) => setRows(p => ({ ...p, [name]: { ...(p[name] || {}), [field]: val } }));

  const persist = async (name) => {
    const r = rows[name] || {};
    const { error } = await saveTarget({ salesperson: name, month, sales_target: r.sales_target, commission_rate: r.commission_rate });
    if (error) {
      const miss = /relation .* does not exist|tmk_targets|schema cache/i.test(error.message || '');
      toast(miss ? 'ต้องรัน migration 20260701-targets.sql ใน Supabase ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error');
      return false;
    }
    // เป้า CRM แยกตาราง (tmk_crm_targets) — บันทึกเฉพาะเมื่อเปลี่ยน · ตารางยังไม่ migrate → toast ชี้ migration
    const crmChanged = ['crm_target', 'calls_target', 'answer_rate_target'].some(f => numOf(r, f) !== numOf(baseline[name], f));
    if (crmChanged) {
      const { error: ce, degraded } = await saveCrmTarget({ salesperson: name, month, sales_target: r.crm_target, calls_target: r.calls_target, answer_rate_target: r.answer_rate_target });
      if (degraded) toast('เป้ายอด CRM บันทึกแล้ว · เป้ากิจกรรมยังไม่ถูกเก็บ — ต้องรัน migration 20260824-crm-activity-targets.sql', 'warn');
      if (ce) {
        const miss = /relation .* does not exist|tmk_crm_targets|schema cache/i.test(ce.message || '');
        toast(miss ? 'ต้องรัน migration 20260731-crm-targets-notes.sql ใน Supabase ก่อน' : 'บันทึกเป้า CRM ไม่สำเร็จ: ' + ce.message, 'error');
        return false;
      }
    }
    const tChanges = diffFields(baseline[name], { sales_target: numOf(r, 'sales_target'), commission_rate: numOf(r, 'commission_rate'), crm_target: numOf(r, 'crm_target'), calls_target: numOf(r, 'calls_target'), answer_rate_target: numOf(r, 'answer_rate_target') }, [['sales_target', 'เป้ายอด'], ['commission_rate', 'เรตคอม %'], ['crm_target', 'เป้า CRM'], ['calls_target', 'เป้าสาย/เดือน'], ['answer_rate_target', 'เป้า %รับสาย']]);
    logAudit({ action: 'update', entityType: 'target', entityName: name, summary: `ตั้งเป้า/คอม ${name} เดือน ${month}`, changes: tChanges.length ? tChanges : null });
    setBaseline(b => ({ ...b, [name]: { sales_target: numOf(r, 'sales_target'), commission_rate: numOf(r, 'commission_rate'), crm_target: numOf(r, 'crm_target'), calls_target: numOf(r, 'calls_target'), answer_rate_target: numOf(r, 'answer_rate_target') } }));
    return true;
  };

  // auto-save: บันทึกเมื่อโฟกัสออกจากการ์ด (blur) เฉพาะที่มีการแก้จริง — ไม่ต้องกดปุ่มรายคน
  const [savedKey, setSavedKey] = useState(null);   // แฟลช "บันทึกแล้ว ✓"
  const saveIfDirty = async (name) => {
    if (!isDirty(name) || savingKey === name) return;
    setSavingKey(name);
    const ok = await persist(name);
    setSavingKey(null);
    if (ok) { setSavedKey(name); setTimeout(() => setSavedKey(k => (k === name ? null : k)), 1600); }
  };


  const saveAll = async () => {
    if (!dirtyNames.length) return;
    setSavingAll(true);
    let ok = 0;
    for (const name of dirtyNames) { if (await persist(name)) ok++; }
    setSavingAll(false);
    if (ok) toast(`บันทึกเป้า ${ok} คน เดือนนี้แล้ว`, 'success');
  };

  // คัดลอกเป้ารายคนจากเดือนก่อน (เดิมต้องพิมพ์ใหม่ทุกเดือน)
  const [copyingPeople, setCopyingPeople] = useState(false);
  const copyPrevPeople = async () => {
    if (copyingPeople) return;
    setCopyingPeople(true);
    try {
      const [y, m] = month.split('-').map(Number);
      const pm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
      const [pt, pc] = await Promise.all([fetchTargets(pm), fetchCrmTargets(pm)]);
      if (!pt.length && !pc.length) { toast(`เดือนก่อนยังไม่ได้ตั้งเป้ารายคน`, 'warn'); return; }
      const add = new Set();
      setRows(prev => {
        const next = { ...prev };
        pt.forEach(t => { next[t.salesperson] = { ...(next[t.salesperson] || {}), sales_target: t.sales_target ?? 0, commission_rate: t.commission_rate ?? 0 }; add.add(t.salesperson); });
        // เป้า CRM ต้องลอกครบทั้ง 3 ช่อง (เดิมลอกแค่ยอด → เป้าจำนวนสาย/อัตรารับสายหายทุกเดือน)
        pc.forEach(t => { next[t.salesperson] = { ...(next[t.salesperson] || {}), crm_target: t.sales_target ?? 0, calls_target: t.calls_target ?? 0, answer_rate_target: t.answer_rate_target ?? 0 }; add.add(t.salesperson); });
        return next;
      });
      setManualNames(p => [...new Set([...p, ...add])]);
      toast(`คัดลอกเป้า ${add.size} คนจากเดือนก่อนแล้ว — กด "บันทึก" เพื่อยืนยัน`, 'success');
    } catch (e) { toast('คัดลอกไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setCopyingPeople(false); }
  };

  const addPerson = () => {
    const n = addName.trim();
    if (n && !people.includes(n)) setManualNames(p => [...p, n]);
    setAddName('');
  };

  /* UI มินิมอล (user: "ข้อมูลไม่จำเป็นเยอะเกิน") — เหลือ: หัวบรรทัดเดียว (เดือน+วันตัด) + ตารางชื่อ/3ช่อง
     กรอกแล้วออกจากแถว = บันทึกเอง (ไอคอนเล็กข้างชื่อ: ●แก้ค้าง →✓บันทึกแล้ว) · ไม่มีแถบสรุป/คำอธิบาย/ปุ่มช่วย */
  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        {/* หัว: ชื่อ + เดือน + วันตัดรอบ (บรรทัดเดียว) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold inline-flex items-center gap-2"><Icon name="target" className="size-4" /> เป้า & คอมมิชชั่น</span>
          <span className="ml-auto flex items-center gap-2">
            <MonthPicker value={month} onChange={setMonth} className="h-8" />
            <span className="text-xs text-muted-foreground" title={`รอบค่าคอม: วันที่ ${cutoffDay} เดือนก่อน – วันที่ ${Math.max(cutoffDay - 1, 1)} เดือนนี้ · ใช้ในป๊อปอัพ "ค่าคอมรอบตัด"`}>ตัดรอบ</span>
            <Select value={String(cutoffDay)} onValueChange={saveCutoffDay} disabled={!cutoffReady}>
              <SelectTrigger className="h-8 w-[64px]"><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 28 }, (_, i) => i + 1).map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </span>
        </div>

        {/* เป้าเดือน + เป้า/งบแอดต่อช่องทาง (ตามเดือนที่เลือกด้านบน · D13) */}
        <MonthTargetsZone month={month} />

        <div className="flex items-center gap-2 -mb-1">
          <span className="text-[11px] text-muted-foreground">เป้ารายคน & คอมมิชชั่น</span>
          <button type="button" onClick={copyPrevPeople} disabled={copyingPeople}
            className="ml-auto text-[11.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50">
            {copyingPeople ? 'กำลังคัดลอก…' : 'คัดลอกจากเดือนก่อน'}
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">กำลังโหลด…</p>
        ) : people.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">ยังไม่มีเซลล์เดือนนี้ — พิมพ์ชื่อด้านล่างเพื่อตั้งเป้าล่วงหน้า</div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            {/* หัวคอลัมน์ */}
            <div className="grid grid-cols-[minmax(72px,1.1fr)_1fr_84px_1fr_minmax(72px,90px)] gap-2 items-center px-3 py-1.5 bg-muted/40 text-[11px] text-muted-foreground">
              <span>เซลล์</span><span className="text-right">เป้ายอด (บาท)</span><span className="text-right">คอม %</span><span className="text-right">เป้า CRM (บาท)</span><span className="text-right">คอมที่เป้า</span>
            </div>
            <div className="divide-y">
              {people.map(name => {
                const r = rows[name] || {};
                const dirty = isDirty(name);
                return (
                  <div key={name} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) saveIfDirty(name); }}
                    className="grid grid-cols-[minmax(72px,1.1fr)_1fr_84px_1fr_minmax(72px,90px)] gap-2 items-center px-3 py-1.5">
                    <span className="text-sm font-medium truncate inline-flex items-center gap-1.5">
                      {name}
                      {savingKey === name ? <span className="size-2 rounded-full bg-[var(--accent)] animate-pulse shrink-0" title="กำลังบันทึก" />
                        : savedKey === name ? <Icon name="check" className="size-3.5 text-emerald-600 shrink-0" />
                        : dirty ? <span className="size-2 rounded-full bg-amber-500 shrink-0" title="ยังไม่บันทึก — ออกจากแถวแล้วบันทึกเอง" /> : null}
                    </span>
                    <MoneyInput value={r.sales_target ?? ''} onChange={e => setField(name, 'sales_target', e.target.value)} className="h-8 min-w-0" placeholder="0" aria-label={`เป้ายอดของ ${name}`} />
                    <Input type="number" inputMode="decimal" step="0.1" value={r.commission_rate ?? ''} onChange={e => setField(name, 'commission_rate', e.target.value)} className="h-8 text-right min-w-0" placeholder="0" aria-label={`เรตคอมของ ${name} (%)`} />
                    <MoneyInput value={r.crm_target ?? ''} onChange={e => setField(name, 'crm_target', e.target.value)} className="h-8 min-w-0" placeholder="0" aria-label={`เป้า CRM ของ ${name}`} />
                    {/* คอมที่ได้ถ้าทำถึงเป้า — เดิมต้องคิดเองว่า เป้า × เรต = เท่าไหร่ */}
                    <span className="text-right text-[12px] tabular-nums text-muted-foreground">
                      {numOf(r, 'sales_target') > 0 && numOf(r, 'commission_rate') > 0
                        ? '฿' + Math.round(numOf(r, 'sales_target') * numOf(r, 'commission_rate') / 100).toLocaleString('th-TH')
                        : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* เป้าเชิงกิจกรรมของทีม CRM (PART 110) — โชว์เฉพาะคนที่ตั้งเป้ายอด CRM ไว้ = "ทีม CRM" ของเดือนนั้น */}
        {(() => {
          const crmPeople = people.filter(n => numOf(rows[n], 'crm_target') > 0);
          if (!crmPeople.length) return null;
          return (
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-1.5 bg-muted/40 text-[11px] text-muted-foreground">เป้ากิจกรรม CRM (ไม่ตั้ง = ไม่แสดงเกจในหน้า CRM)</div>
              <div className="grid grid-cols-[minmax(72px,1.2fr)_1fr_1fr] gap-2 items-center px-3 py-1.5 text-[11px] text-muted-foreground border-b">
                <span>เซลล์ CRM</span><span className="text-right">เป้าสาย/เดือน</span><span className="text-right">เป้า %รับสาย</span>
              </div>
              <div className="divide-y">
                {crmPeople.map(name => {
                  const r = rows[name] || {};
                  return (
                    <div key={name} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) saveIfDirty(name); }}
                      className="grid grid-cols-[minmax(72px,1.2fr)_1fr_1fr] gap-2 items-center px-3 py-1.5">
                      <span className="text-sm font-medium truncate">{name}</span>
                      <MoneyInput value={r.calls_target ?? ''} onChange={e => setField(name, 'calls_target', e.target.value)} className="h-8 min-w-0" placeholder="0" aria-label={`เป้าจำนวนสายของ ${name}`} />
                      <Input type="number" inputMode="numeric" min="0" max="100" value={r.answer_rate_target ?? ''} onChange={e => setField(name, 'answer_rate_target', e.target.value)} className="h-8 text-right min-w-0" placeholder="0" aria-label={`เป้าอัตรารับสายของ ${name}`} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ท้าย: เพิ่มเซลล์ (ซ้าย) · บันทึกทั้งหมดเผื่อกรอกหลายคน (ขวา · โผล่เมื่อมีแก้ค้าง) */}
        <div className="flex flex-wrap items-center gap-2">
          <Input value={addName} onChange={e => setAddName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPerson(); }} placeholder="+ เพิ่มเซลล์" className="h-8 w-[150px]" />
          {addName.trim() && <Button variant="outline" size="sm" className="h-8" onClick={addPerson}>เพิ่ม</Button>}
          {!loading && orphanNames.length > 0 && (
            <button type="button" onClick={() => setShowOrphans(v => !v)} className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
              {showOrphans ? 'ซ่อนคนที่ยังไม่ส่งใบเสร็จ' : `+${orphanNames.length} คนที่มีเป้าแต่ยังไม่ส่งใบเสร็จ`}
            </button>
          )}
          {dirtyNames.length > 0 && (
            <Button size="sm" className="h-8 ml-auto" disabled={savingAll} onClick={saveAll}>
              {savingAll ? 'กำลังบันทึก…' : `บันทึก (${dirtyNames.length})`}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function GeneralSettings({ dark, setDark }) {
  // โปรไฟล์ของฉัน — ดึงจาก roles/staff ด้วยอีเมลที่ล็อกอินอยู่ (เดิมหน้านี้ไม่บอกเลยว่ากำลังใช้สิทธิ์อะไรอยู่)
  const me = (userEmail() || '').toLowerCase();
  const low = (x) => String(x || '').toLowerCase();
  const role = (DD.roles || []).find(r => low(r.email) === me) || null;
  const staff = (DD.staff || []).find(st => low(st.email) === me) || null;
  const myName = role?.name || staff?.name || (me ? me.replace(/@.*/, '') : 'ไม่ทราบชื่อ');
  const myColor = staff?.color || role?.color || 'var(--accent)';
  const roleMeta = { admin: { l: 'แอดมิน', c: 'var(--accent)' }, editor: { l: 'ผู้แก้ไข', c: 'var(--good)' }, viewer: { l: 'ดูอย่างเดียว', c: 'var(--ink-3)' } };
  const rm = roleMeta[role?.role] || roleMeta[isAdmin() ? 'admin' : canEdit() ? 'editor' : 'viewer'];
  const locks = (role?.lockedSections || []).length;

  const SHORTCUTS = [
    // ต้องเป็น 'admin' ให้ตรงกับแท็บจริง (views-settings.jsx) — เดิม 'edit' ทำให้ editor กดแล้วเด้งกลับแท็บทั่วไปเงียบ ๆ
    { id: 'targets', icon: 'target', label: 'เป้า & คอมมิชชั่น', hint: 'ตั้งเป้าเดือนนี้', need: 'admin' },
    { id: 'roles', icon: 'users', label: 'ผู้ใช้ & สิทธิ์', hint: `${(DD.roles || []).length} คน`, need: 'admin' },
    { id: 'quality', icon: 'search', label: 'คุณภาพข้อมูล', hint: 'ตรวจข้อมูลที่ยังไม่ครบ', need: 'edit' },
    { id: 'trash', icon: 'trash', label: 'ถังขยะ', hint: 'กู้ของที่ลบไป', need: 'edit' },
  ].filter(x => x.need === 'admin' ? isAdmin() : x.need === 'edit' ? canEdit() : true);

  return (
    <div className="flex flex-col gap-5 max-w-3xl w-full">
      {/* โปรไฟล์ของฉัน */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl text-white font-bold" style={{ background: myColor }}>{myName.slice(0, 2).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate">{myName}</div>
              <div className="text-xs text-muted-foreground truncate">{me || 'ยังไม่ได้ล็อกอิน'}</div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {role?.dutyName && <Badge variant="outline">{role.dutyName}</Badge>}
              <Badge variant="outline" style={{ color: rm.c, borderColor: rm.c + '55', background: rm.c + '14' }}>{rm.l}</Badge>
              {locks > 0 && <Badge variant="outline" className="gap-1 text-muted-foreground"><Icon name="lock" className="size-3" />ล็อก {locks} หน้า</Badge>}
            </div>
          </div>
          {!canEdit() && <p className="mt-3 text-xs text-muted-foreground">สิทธิ์ปัจจุบันดูได้อย่างเดียว — แก้ข้อมูลไม่ได้ ติดต่อแอดมินถ้าต้องการสิทธิ์เพิ่ม</p>}
        </CardContent>
      </Card>

      {/* ธีม — ปุ่มเลือกชัดกว่าสวิตช์ (สวิตช์เดิมไม่บอกว่าตอนนี้อยู่โหมดไหน จนกว่าจะสังเกตสีจอ) */}
      <Card>
        <CardContent className="pt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-sm">ธีมการแสดงผล</div>
            <div className="text-xs text-muted-foreground mt-0.5">จำไว้ในเครื่องนี้ ไม่กระทบคนอื่น</div>
          </div>
          <div className="inline-flex gap-1 rounded-lg border bg-muted/30 p-1">
            {[[false, 'sun', 'สว่าง'], [true, 'moon', 'มืด']].map(([val, ic, lb]) => (
              <button key={lb} type="button" onClick={() => setDark(val)} aria-pressed={dark === val}
                className={'inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors '
                  + (dark === val ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <Icon name={ic} className="size-3.5" /> {lb}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ทางลัด — ไปแท็บที่ใช้บ่อยโดยไม่ต้องไล่เมนู */}
      {SHORTCUTS.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SHORTCUTS.map(x => (
            <button key={x.id} type="button" onClick={() => goSection('settings', x.id)}
              className="flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors hover:bg-muted/40" style={{ borderColor: 'var(--line)' }}>
              <Icon name={x.icon} className="size-4 text-muted-foreground" />
              <span className="text-[13px] font-semibold leading-tight">{x.label}</span>
              <span className="text-[11px] text-muted-foreground">{x.hint}</span>
            </button>
          ))}
        </div>
      )}

      {/* เกี่ยวกับระบบ — เหลือเท่าที่ใช้จริง (เดิมมีป้าย "Supabase/เปิด" ที่ไม่ได้ทำอะไร) */}
      <Card>
        <CardContent className="pt-5 flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-sm">TMK Operation</div>
            <div className="text-xs text-muted-foreground mt-0.5">เวอร์ชัน {APP_VERSION} · ข้อมูลสดจาก Supabase</div>
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => goSection('whatsnew')}>
            <Icon name="sparkle" className="size-4 mr-1.5" /> มีอะไรใหม่
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---- Updates / Changelog ---- */

/* BrandsView + ChannelsView แยกไป views-settings-catalog.jsx (REFACTOR-1) — re-export กัน consumer แก้ */
export { BrandsView, ChannelsView } from './views-settings-catalog.jsx';

/* DutiesView + RolesView แยกไป views-settings-people.jsx (REFACTOR-1) — re-export กัน consumer แก้ */
export { DutiesView, RolesView } from './views-settings-people.jsx';


export function TrashView() {
  const { reload, refresh } = useData() || {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');   // ค้นหาชื่อในถังขยะ
  const [typeF, setTypeF] = useState('');   // กรองตามชนิด (งาน/แคมเปญ/ผู้ใช้…)
  const [loadErr, setLoadErr] = useState([]);   // ชนิดที่อ่านไม่สำเร็จ — ต้องบอก ไม่ใช่โชว์ว่าง

  const aliveRef = React.useRef(true);
  // ไม่ setLoading(true) ตอนต้น: ครั้งแรก state เริ่มเป็น true อยู่แล้ว / ตอน refetch (restore/purge) ปล่อยรายการเดิมค้างไว้ไม่ให้กระพริบ (มี busy คุมปุ่มแล้ว)
  const load = async () => {
    try {
      const results = await Promise.all(
        TRASH_TABLES.map(t => {
          // ดึงเฉพาะคอลัมน์ที่ list ใช้จริง (key + ชื่อ + deleted_at) — ตัด jsonb หนัก (lots/items/status_log…) ออกจาก egress
          const sel = [...new Set([t.key, t.nameCol, 'deleted_at'])].join(',');
          return supabase.from(t.table).select(sel).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
        })
      );
      if (!aliveRef.current) return; // กัน setState หลัง unmount
      const all = [];
      const failed = [];
      results.forEach((r, i) => {
        // เดิม `if (r.error) return;` = ตารางไหนอ่านไม่ได้ก็หายไปเงียบ ๆ
        // ผู้ใช้เห็นถังขยะว่างแล้วนึกว่าไม่มีของ ทั้งที่จริงคืออ่านไม่ได้
        if (r.error) { failed.push(TRASH_TABLES[i].type); return; }
        if (!r.data) return;
        const meta = TRASH_TABLES[i];
        r.data.forEach(row => all.push({
          meta,
          id: row[meta.key],
          name: row[meta.nameCol] || row[meta.key] || '(ไม่มีชื่อ)',
          deletedAt: row.deleted_at,
        }));
      });
      all.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
      setItems(all);
      setLoadErr(failed);
    } catch (e) {
      console.error('Trash load failed:', e);
      if (aliveRef.current) setLoadErr(['ทั้งหมด']);
    } finally { if (aliveRef.current) setLoading(false); }
  };

  useEffect(() => {
    aliveRef.current = true;
    (async () => { await load(); })(); // setState เกิดหลัง await ภายใน load → ไม่ใช่ synchronous ใน effect
    return () => { aliveRef.current = false; };
  }, []);

  const restore = async (it) => {
    if (!guardEdit()) return;
    if ((it.meta.table === 'tmk_user_roles' || it.meta.table === 'tmk_staff') && !guardAdmin()) return; // ผู้ใช้/สิทธิ์ = admin
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from(it.meta.table).update({ deleted_at: null }).eq(it.meta.key, it.id);
      if (error) throw error;
      // user: กู้ tmk_staff ด้วย
      if (it.meta.table === 'tmk_user_roles') {
        await supabase.from('tmk_staff').update({ deleted_at: null }).eq('email', it.id);
      }
      logAudit({ action: 'restore', entityType: it.meta.type, entityName: it.name, summary: `กู้คืน${it.meta.type} "${it.name}"` });
      toast(`กู้คืน "${it.name}" แล้ว`, 'success');
      await load();
      if (refresh) await refresh(it.meta.table === 'tmk_user_roles' ? [it.meta.table, 'tmk_staff'] : [it.meta.table]); else if (reload) await reload();
    } catch (err) {
      toast('กู้คืนไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const purge = async (it) => {
    if (!guardEdit()) return;
    // ตารางที่เป็นเงิน/สิทธิ์ = แอดมินเท่านั้น — ให้ตรงกับ policy ฝั่ง DB (RLS Tier 3b)
    // ไม่งั้นคนแก้ไขได้จะกดแล้วเจอ error RLS งง ๆ แทนที่จะถูกกันตั้งแต่แรก
    if (needsAdminToPurge(it.meta) && !guardAdmin()) return;
    if (busy) return;
    if (!await confirm({ title: 'ลบถาวร', body: purgeWarning(it.meta, it.name), danger: true, confirmText: 'ลบถาวร' })) return;
    setBusy(true);
    try {
      const { error } = await supabase.from(it.meta.table).delete().eq(it.meta.key, it.id);
      if (error) throw error;
      if (it.meta.table === 'tmk_user_roles') {
        const { error: e2 } = await supabase.from('tmk_staff').delete().eq('email', it.id);
        if (e2) throw e2;
      }
      logAudit({ action: 'purge', entityType: it.meta.type, entityName: it.name, summary: `ลบถาวร${it.meta.type} "${it.name}"` });
      toast(`ลบถาวร "${it.name}" แล้ว`, 'success');
      await load();
    } catch (err) {
      toast('ลบถาวรไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const fmtDate = (s) => { try { return new Date(s).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  // "ลบเมื่อ x วันก่อน" อ่านง่ายกว่าวันที่ดิบเวลาไล่หาของที่เพิ่งลบ
  const relTime = (iso) => {
    const t = new Date(iso).getTime(); if (!t) return '';
    // eslint-disable-next-line react-hooks/purity -- ป้ายเวลาสัมพัทธ์ต้องอิงเวลาปัจจุบันตอน render
    const sec = (Date.now() - t) / 1000;
    if (sec < 3600) return Math.max(1, Math.floor(sec / 60)) + ' นาทีก่อน';
    if (sec < 86400) return Math.floor(sec / 3600) + ' ชม.ก่อน';
    if (sec < 86400 * 7) return Math.floor(sec / 86400) + ' วันก่อน';
    return fmtDate(iso);
  };

  const ql = query.trim().toLowerCase();
  const byType = {};
  items.forEach(it => { byType[it.meta.type] = (byType[it.meta.type] || 0) + 1; });
  const shown = items.filter(it => (!typeF || it.meta.type === typeF) && (!ql || String(it.name).toLowerCase().includes(ql)));

  /* ⚠️ early-return นี้เคยอยู่ "ก่อน" แบนเนอร์ loadErr เสมอ
     → RLS/เน็ตพัง = ทุก query error → items=[] → หน้าจอขึ้น "ถังขยะว่าง · กู้คืนได้ตลอด"
       ทั้งที่แถว tmk_daily_sales (ยอดเงิน) ที่ soft-delete ไว้มองไม่เห็นและกู้ไม่ได้
     อ่านไม่ได้ ≠ ไม่มีของ — ต้องบอกตรง ๆ พร้อมปุ่มลองใหม่ */
  if (!loading && items.length === 0 && loadErr?.length) {
    return (
      <Card className="max-w-3xl w-full" style={{ borderColor: 'var(--bad)' }}>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Icon name="alertTriangle" className="size-10" style={{ color: 'var(--bad)' }} />
          <h3 className="text-lg font-semibold">อ่านถังขยะไม่สำเร็จ</h3>
          <p className="text-sm text-muted-foreground" style={{ lineHeight: 1.7 }}>
            ยังไม่รู้ว่ามีของอยู่หรือเปล่า — <b>ไม่ได้แปลว่าถังขยะว่าง</b>
            <br />{loadErr.join(' · ')}
          </p>
          <Button variant="outline" size="sm" onClick={() => load()}>ลองใหม่</Button>
        </CardContent>
      </Card>
    );
  }
  if (!loading && items.length === 0) {
    return (
      <Card className="border-dashed bg-muted/10 max-w-3xl w-full">
        <CardContent className="flex flex-col items-center justify-center py-14 text-center">
          <Icon name="trash" className="size-12 opacity-20 mb-3 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-1">ถังขยะว่าง</h3>
          <p className="text-sm text-muted-foreground">ของที่ลบจะมาอยู่ที่นี่ กู้คืนได้ตลอด</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-w-3xl w-full">
      {/* แถบเครื่องมือ — เดิมมีแต่รายการยาว หาของที่จะกู้ไม่เจอเมื่อมีหลายสิบชิ้น */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold inline-flex items-center gap-2"><Icon name="trash" className="size-4" /> ถังขยะ <span className="num text-muted-foreground">{items.length}</span></span>
        <SearchInput placeholder="ค้นหาชื่อ" value={query} onChange={e => setQuery(e.target.value)} wrapperClassName="w-full sm:w-[200px] sm:ml-auto" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setTypeF('')} aria-pressed={!typeF}
          className={'rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ' + (!typeF ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-2)]' : 'text-muted-foreground hover:bg-muted/50')}>
          ทั้งหมด <b className="num">{items.length}</b>
        </button>
        {Object.entries(byType).map(([t, n]) => (
          <button key={t} type="button" onClick={() => setTypeF(f => f === t ? '' : t)} aria-pressed={typeF === t}
            className={'rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ' + (typeF === t ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-2)]' : 'text-muted-foreground hover:bg-muted/50')}>
            {t} <b className="num">{n}</b>
          </button>
        ))}
      </div>

      {/* อ่านบางส่วนไม่สำเร็จ ต้องบอก — ไม่งั้นถังขยะที่ว่างเพราะ error ดูเหมือน "ไม่มีของ" */}
      {loadErr.length > 0 && (
        <div role="status" className="flex items-center gap-2.5 mb-3 px-3 py-2.5 rounded-[var(--r-sm)]"
          style={{ background: 'color-mix(in srgb, var(--warn) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--warn) 35%, transparent)' }}>
          <span style={{ color: 'var(--warn)', flexShrink: 0 }}><Icon name="alertTriangle" size={15} /></span>
          <span className="text-sm flex-1 min-w-0">
            อ่านรายการที่ลบของ <b>{loadErr.join(' · ')}</b> ไม่สำเร็จ — รายการด้านล่างอาจไม่ครบ
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => load()}>ลองใหม่</Button>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Icon name="loader" className="size-6 animate-spin opacity-50" /><p className="text-sm">กำลังโหลด…</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">ไม่พบรายการที่ตรงกับที่ค้นหา</div>
        ) : (
          <div className="flex flex-col divide-y divide-border/50">
            {shown.map((it, i) => (
              <div key={it.meta.table + it.id + i} className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                <Badge variant="outline" className="bg-muted shrink-0 text-[11px]">{it.meta.type}</Badge>
                <div className="flex-1 min-w-[160px]">
                  <div className="font-semibold text-sm truncate text-foreground">{it.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5" title={fmtDate(it.deletedAt)}>ลบเมื่อ {relTime(it.deletedAt)}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto justify-end">
                  <Button variant="outline" size="sm" className="h-8" disabled={busy} onClick={() => restore(it)}>
                    <Icon name="refresh" className="size-3.5 mr-1.5" /> กู้คืน
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={busy} onClick={() => purge(it)}>
                    ลบถาวร
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <p className="text-[11px] text-muted-foreground">กู้คืนแคมเปญแล้ว งานที่เคยผูกไว้จะไม่กลับมาผูกเอง — ต้องเลือกแคมเปญใหม่ในแต่ละงาน</p>
    </div>
  );
}
