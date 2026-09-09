/* ============================================================
   flowSettingsPage.jsx — หน้าตั้งค่าต่อโครงการ (แยกจาก views-flows.jsx)
   - FlowSettingsPage + CheckRow/ColorDot (ใช้เฉพาะหน้านี้) ยกมาทั้งดุ้น ไม่แก้เนื้อใน
   - รับ flow/onAfter/onGone เป็น props เหมือนเดิม · state ทั้งหมดอยู่ในตัวมันเองอยู่แล้ว
   ============================================================ */
import { useState } from 'react';
import { TMK } from './data.js';
import { Icon, Avatar, ColorPicker, FlowIcon, IconPicker, readImageCompressed } from './components.jsx';
import { useData } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { toast, openModal, goSection, userEmail, confirm } from './lib/appBus.js';
import { logAudit } from './lib/audit.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Checkbox as ShadcnCheckbox } from '@/components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { PALETTE, GENERAL_ID, guardEdit, isMissing, defaultStatuses, confirmAsync } from './flowsShared.js';
import { FlowHistoryView } from './flowHistory.jsx';

// แถวเลือกแบบติ๊กได้ (แก้บั๊ก double-toggle: ไม่หุ้มด้วย <label> · div+onClick + checkbox visual-only)
function CheckRow({ checked, onToggle, children }) {
  return (
    <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      className="flex items-center gap-2 text-sm py-1.5 px-1 rounded hover:bg-muted/50 cursor-pointer select-none">
      <ShadcnCheckbox checked={checked} className="pointer-events-none" />{children}
    </div>
  );
}
// ปุ่มสีแบบ popover (ColorPicker ข้างใน) — สำหรับช่องเล็ก เช่นสีคอลัมน์สถานะ
function ColorDot({ value, onChange }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title="เลือกสี" className="size-8 rounded border shrink-0" style={{ background: value || '#888888' }} />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3"><ColorPicker value={value || '#888888'} onChange={onChange} size="sm" /></PopoverContent>
    </Popover>
  );
}

/* ---- หน้าตั้งค่าต่อโครงการ (page · เข้าไปปรับละเอียด) ---- */
export function FlowSettingsPage({ flow, onAfter, onGone }) {
  const { reload, refresh } = useData() || {};
  const me = userEmail();
  const isGeneral = !!flow.isGeneral;
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('general');
  const [name, setName] = useState(flow.name || '');
  const [color, setColor] = useState(flow.color || PALETTE[0]);
  const [icon, setIcon] = useState(flow.icon || 'ClipboardList');
  const [description, setDescription] = useState(flow.description || '');
  const [coverUrl, setCoverUrl] = useState(flow.coverUrl || '');
  const [brandIds, setBrandIds] = useState(flow.brandIds && flow.brandIds.length ? flow.brandIds : (flow.brandId ? [flow.brandId] : []));
  const [campaignIds, setCampaignIds] = useState(flow.campaignIds || []);
  const [statuses, setStatuses] = useState((flow.statuses && flow.statuses.length) ? flow.statuses : defaultStatuses());
  // งานที่ต้องย้ายเมื่อกด "บันทึก" (จากการลบคอลัมน์สถานะ) — ยังไม่แตะ DB จนกว่าจะเซฟจริง
  const [pendingMoves, setPendingMoves] = useState([]);
  const [members, setMembers] = useState(flow.members || []);
  const [visibility, setVisibility] = useState(flow.visibility || 'shared');
  const [defaultView, setDefaultView] = useState(flow.defaultView || 'kanban');
  const [barColorSource, setBarColorSource] = useState(flow.barColorSource || 'campaign');

  const toggle = (arr, set, id) => set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);

  const save = async () => {
    if (!guardEdit()) return;
    if (!name.trim()) { toast('ใส่ชื่อโครงการก่อน', 'warn'); return; }
    setBusy(true);
    try {
      const payload = {
        id: flow.id, name: name.trim(), color, icon, description: description.trim(),
        brand_id: brandIds[0] || null, brand_ids: brandIds,   // brand_id = back-compat · brand_ids = หลายแบรนด์
        campaign_ids: campaignIds, statuses, members, visibility: isGeneral ? 'shared' : visibility,
        default_view: defaultView, owner: flow.owner || me, sort_order: flow.sortOrder ?? 0,
        cover_url: coverUrl || null,   // รูปปก (20260720 · graceful)
        bar_color_source: barColorSource,   // แหล่งสีแถบงาน (20260702 · graceful)
      };
      // graceful: คอลัมน์เสริม (brand_ids/cover_url) ยังไม่ migrate → ตัดคอลัมน์ที่ขาดออกแล้วลองใหม่
      const p = { ...payload };
      let error, guard = 0;
      ({ error } = await supabase.from('tmk_flows').upsert(p));
      while (error && guard++ < 4) {
        const col = ((error.message || '').match(/(brand_ids|cover_url|share_token|share_enabled|bar_color_source)/) || [])[1];
        if (!col || !(col in p)) break;
        delete p[col];
        ({ error } = await supabase.from('tmk_flows').upsert(p));
      }
      if (error) { if (isMissing(error)) throw new Error('ยังไม่ได้รัน migration — รัน 20260710-flows-brands.sql ก่อน'); throw error; }
      logAudit({ action: 'update', entityType: 'flow', entityName: name.trim(), summary: `แก้ไขโครงการ "${name.trim()}"`, flowId: flow.scopeId ?? flow.id });
      /* ย้ายงานของคอลัมน์ที่ถูกลบ — ทำหลังบันทึกโครงการสำเร็จเท่านั้น
         (ถ้าทำตอนกดลบคอลัมน์ แล้วผู้ใช้ออกก่อนบันทึก งานจะถูกย้ายทั้งที่คอลัมน์ยังอยู่ = กู้ไม่ได้) */
      for (const pm of pendingMoves) {
        if (!pm.ids?.length) continue;
        const { error: mvErr } = await supabase.from('tmk_tasks').update({ status: pm.to }).in('id', pm.ids);
        if (mvErr) { toast(`บันทึกโครงการแล้ว แต่ย้าย ${pm.n} งานไปคอลัมน์ "${pm.label}" ไม่สำเร็จ: ${mvErr.message || ''}`, 'error'); continue; }
        logAudit({ action: 'update', entityType: 'task', entityName: `${pm.n} งาน`, summary: `ลบคอลัมน์สถานะ — ย้าย ${pm.n} งานไปคอลัมน์ "${pm.label}"`, flowId: flow.scopeId ?? flow.id });
      }
      if (pendingMoves.length) { setPendingMoves([]); if (refresh) await refresh(['tmk_tasks']); }
      // แจ้งสมาชิกที่ถูกเพิ่มใหม่เข้าโครงการ (diff เก่า/ใหม่)
      const _added = members.filter(m => !(flow.members || []).includes(m));
      if (refresh) await refresh(['tmk_flows']); else if (reload) await reload();
      toast('บันทึกโครงการเรียบร้อย', 'success');
    } catch (err) { toast('บันทึกไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  const archiveFlow = async () => {
    if (!guardEdit() || isGeneral) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('tmk_flows').update({ archived: true }).eq('id', flow.id);
      if (error) throw error;
      logAudit({ action: 'update', entityType: 'flow', entityName: flow.name, summary: `เก็บโครงการ "${flow.name}" เข้าคลัง`, flowId: flow.scopeId ?? flow.id });
      if (refresh) await refresh(['tmk_flows']); else if (reload) await reload();
      toast('เก็บโครงการเข้าคลังแล้ว', 'success');
      onGone?.();
    } catch (err) { toast('ทำไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  const deleteFlow = async () => {
    if (!guardEdit()) return;
    // งานทั่วไป: ลบ = รีเซ็ตค่า (soft-delete config row __general__ เท่านั้น · งาน flow_id ว่าง ยังอยู่ · general โผล่ใหม่ default)
    if (isGeneral) {
      if (!await confirmAsync({ title: 'รีเซ็ต "งานทั่วไป"', body: 'ตั้งค่า (ชื่อ/สี/ไอคอน/คอลัมน์/สมาชิก) จะกลับค่าเริ่มต้น · งานที่ยังไม่จัดเข้าโครงการยังอยู่ครบ', confirmText: 'รีเซ็ต', danger: true }, 'รีเซ็ตงานทั่วไป? งานไม่หาย')) return;
      setBusy(true);
      try {
        // ลบเฉพาะ config row (ถ้ามี) — ถ้ายังไม่เคยบันทึก ก็ถือว่า default อยู่แล้ว
        await supabase.from('tmk_flows').delete().eq('id', GENERAL_ID);
        logAudit({ action: 'update', entityType: 'flow', entityName: 'งานทั่วไป', summary: 'รีเซ็ตงานทั่วไปกลับค่าเริ่มต้น', flowId: '' });
        if (refresh) await refresh(['tmk_flows']); else if (reload) await reload();
        toast('รีเซ็ตงานทั่วไปแล้ว (งานไม่หาย)', 'success');
        onGone?.();
      } catch (err) { toast('รีเซ็ตไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
      return;
    }
    const linked = (TMK.tasks || []).filter(t => t.flow === flow.id).length;
    if (!await confirmAsync({ title: `ลบโครงการ "${flow.name}"`, body: linked > 0 ? `มี ${linked} งานในโครงการ — ลบจะย้ายงานกลับ "งานทั่วไป"` : 'ลบโครงการนี้?', confirmText: 'ลบ', danger: true }, `ลบโครงการ "${flow.name}"?`)) return;
    setBusy(true);
    try {
      if (linked > 0) await supabase.from('tmk_tasks').update({ flow_id: null }).eq('flow_id', flow.id);
      const { error } = await supabase.from('tmk_flows').update({ deleted_at: new Date().toISOString() }).eq('id', flow.id);
      if (error) throw error;
      logAudit({ action: 'delete', entityType: 'flow', entityName: flow.name, summary: `ลบโครงการ "${flow.name}"`, flowId: flow.scopeId ?? flow.id });
      if (refresh) await refresh(['tmk_flows', 'tmk_tasks']); else if (reload) await reload();
      toast('ย้ายโครงการไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => { try { await supabase.from('tmk_flows').update({ deleted_at: null }).eq('id', flow.id); if (refresh) await refresh(['tmk_flows']); else if (reload) await reload(); toast('กู้คืนโครงการแล้ว', 'success'); } catch { toast('กู้คืนไม่สำเร็จ', 'error'); } },
      });
      onGone?.();
    } catch (err) { toast('ลบไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  // ตัวแก้คอลัมน์สถานะ
  const setStatus = (i, patch) => setStatuses(st => st.map((s, j) => j === i ? { ...s, ...patch } : s));
  const addStatus = () => setStatuses(st => [...st, { id: 'st_' + Math.random().toString(36).slice(2, 7), label: 'สถานะใหม่', color: PALETTE[st.length % PALETTE.length], done: false }]);
  /* ⚠️ ลบคอลัมน์สถานะ = งานที่อยู่ในคอลัมน์นั้น "หายจากทุกวิว"
     Kanban/รายการ/ไทม์ไลน์ เรนเดอร์จาก cols.map() แล้ว filter(t => t.status === col.id)
     → ไม่มี bucket ให้ status ที่ไม่รู้จัก · งานยังอยู่ใน DB แต่ไม่มีทางเห็นจาก UI (นอกจาก "งานของฉัน")
     จึงต้องนับก่อนว่ามีงานค้างกี่ใบ แล้วให้ผู้ใช้ตัดสิน — ย้ายไปคอลัมน์แรก หรือยกเลิก */
  const removeStatus = async (i) => {
    if (statuses.length <= 1) return;
    const col = statuses[i];
    const fid = flow.scopeId ?? flow.id ?? '';
    // ฟิลด์ที่ผูกงานกับโครงการคือ t.flow (ดู views-flows.jsx:79,90) ไม่ใช่ flowId/flow_id
    const stuck = (TMK.tasks || []).filter(t => !t.deletedAt && (t.flow || '') === (fid || '') && t.status === col.id);
    if (stuck.length) {
      const to = statuses.find((_, j) => j !== i);
      const ok = await confirm({
        title: `ลบคอลัมน์ "${col.label}"`,
        body: `มีงานอยู่ในคอลัมน์นี้ ${stuck.length} งาน

ถ้าลบไปเลย งานเหล่านี้จะหายจากบอร์ด/รายการ/ไทม์ไลน์ (ยังอยู่ในฐานข้อมูล แต่เปิดดูจาก UI ไม่ได้)

กด "ย้ายแล้วลบ" เพื่อย้ายงานทั้งหมดไปคอลัมน์ "${to?.label || '-'}" ก่อน`,
        danger: true, confirmText: 'ย้ายแล้วลบ',
      });
      if (!ok) return;
      /* ⚠️ ห้ามย้ายงานลง DB ตอนนี้ — การลบคอลัมน์เป็นแค่ state ที่ยังไม่ได้เซฟ
         ถ้าย้ายทันทีแล้วผู้ใช้กด "กลับบอร์ด" → คอลัมน์ยังอยู่ แต่งานถูกย้ายไปแล้วและกู้ไม่ได้
         → จดไว้เป็น "งานค้างทำ" แล้วค่อยลงมือใน save() หลังบันทึกโครงการสำเร็จ */
      setPendingMoves(pm => [...pm.filter(x => x.to !== col.id), { from: col.id, to: to.id, ids: stuck.map(t => t.id), label: to.label, n: stuck.length }]);
    }
    setStatuses(st => st.length > 1 ? st.filter((_, j) => j !== i) : st);
  };
  const moveStatus = (i, dir) => setStatuses(st => { const j = i + dir; if (j < 0 || j >= st.length) return st; const c = [...st]; [c[i], c[j]] = [c[j], c[i]]; return c; });

  // มีการแก้ที่ยังไม่บันทึกไหม — เดิมกด "กลับบอร์ด" แล้วค่าที่แก้หายเงียบ ไม่มีอะไรเตือน
  const dirty = JSON.stringify({ name, color, icon, description, coverUrl, brandIds, campaignIds, statuses, members, visibility, defaultView, barColorSource })
    !== JSON.stringify({
      name: flow.name || '', color: flow.color || PALETTE[0], icon: flow.icon || 'ClipboardList', description: flow.description || '',
      coverUrl: flow.coverUrl || '', brandIds: (flow.brandIds && flow.brandIds.length ? flow.brandIds : (flow.brandId ? [flow.brandId] : [])),
      campaignIds: flow.campaignIds || [], statuses: (flow.statuses && flow.statuses.length) ? flow.statuses : defaultStatuses(),
      members: flow.members || [], visibility: flow.visibility || 'shared', defaultView: flow.defaultView || 'kanban', barColorSource: flow.barColorSource || 'campaign',
    });
  const leave = async () => {
    if (dirty && !(await confirmAsync({ title: 'ออกโดยไม่บันทึก?', body: 'มีการแก้ไขที่ยังไม่ได้บันทึก — ออกแล้วค่าที่แก้จะหาย', danger: true, confirmText: 'ออกเลย' }))) return;
    onAfter?.(active_view_fallback(flow));
  };

  const TABS = [
    ['general', 'system', 'ทั่วไป'], ['brand', 'store', 'แบรนด์'], ['camp', 'megaphone', 'แคมเปญ'],
    ['status', 'listChecks', 'คอลัมน์สถานะ'], ['members', 'users', 'สมาชิก'],
    ...(isGeneral ? [] : [['access', 'shield', 'การมองเห็น']]),
    ['history', 'clock', 'ประวัติ'],
    ['danger', 'trash', isGeneral ? 'รีเซ็ต' : 'โซนอันตราย'],
  ];

  return (
    <div className="flex flex-col gap-4 max-w-4xl w-full mx-auto pb-8">
      <div className="rounded-lg border bg-muted/20 p-4 flex items-start gap-3 flex-wrap">
        <FlowIcon icon={icon} className="size-7 shrink-0 mt-0.5" style={{ color }} />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-foreground">ตั้งค่าโครงการ: {name || '(ไม่มีชื่อ)'}</div>
          <div className="text-xs text-muted-foreground">{isGeneral ? 'งานทั่วไป — แก้ชื่อ/ไอคอน/สี/คอลัมน์/สมาชิกได้ · ลบ = รีเซ็ตค่า (งานไม่หาย)' : 'ปรับแบรนด์ · แคมเปญที่ใช้ · คอลัมน์สถานะ · สมาชิก · การมองเห็น'}</div>
        </div>
        {/* ปุ่มบันทึก/กลับ — ย้ายมาไว้หัวมุมขวา (เลิกใช้แถบ sticky ล่างที่ทับเนื้อหา) */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {dirty && <span className="text-[11.5px] font-medium hidden sm:inline" style={{ color: 'var(--warn)' }}>ยังไม่ได้บันทึก</span>}
          <Button variant="outline" size="sm" onClick={leave} disabled={busy}>กลับบอร์ด</Button>
          <Button size="sm" onClick={save} disabled={!name.trim() || busy || !dirty}>{busy ? 'กำลังบันทึก…' : dirty ? 'บันทึกการตั้งค่า' : 'บันทึกแล้ว'}</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex flex-col lg:flex-row gap-6 w-full">
        <aside className="lg:w-1/4 shrink-0">
          <TabsList className="flex flex-row lg:flex-col h-auto bg-transparent p-0 gap-1 w-full lg:items-start overflow-x-auto">
            {TABS.map(([id, ic, l]) => (
              <TabsTrigger key={id} value={id} className="w-full justify-start gap-2.5 px-3 py-2 text-sm data-[state=active]:bg-muted data-[state=active]:shadow-none whitespace-nowrap">
                <Icon name={ic} className="size-4" />{l}
              </TabsTrigger>
            ))}
          </TabsList>
        </aside>

        <div className="flex-1 min-w-0">
          {/* ทั่วไป */}
          <TabsContent value="general" className="m-0 flex flex-col gap-5">
            <div className="grid gap-2"><Label>ชื่อโครงการ <span className="text-destructive">*</span></Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น แคมเปญเปิดตัว Q3" /></div>
            <div className="grid gap-2"><Label>รายละเอียด</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="โครงการนี้ใช้ทำอะไร" /></div>
            <div className="grid gap-2">
              <Label>ไอคอน</Label>
              <IconPicker value={icon} onChange={setIcon} />
            </div>
            <div className="grid gap-2"><Label>สีประจำโครงการ</Label><ColorPicker value={color} onChange={setColor} /></div>
            <div className="grid gap-2">
              <Label>สีแถบ/ชิปงานในปฏิทิน-บอร์ด</Label>
              {/* ปุ่มเลือกแบบชัด: อันที่เลือก = พื้น accent ตัวหนังสือขาว · อันที่ไม่เลือก = จาง */}
              <div className="inline-flex w-fit gap-1 rounded-lg border bg-muted/30 p-1">
                {[['campaign', 'megaphone', 'แคมเปญ'], ['brand', 'store', 'แบรนด์']].map(([val, ic, lb]) => {
                  const on = barColorSource === val;
                  return (
                    <button key={val} type="button" onClick={() => setBarColorSource(val)}
                      className={'inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ' + (on ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                      <Icon name={ic} className="size-3.5" /> {lb}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">งานไม่มีสีจากแหล่งที่เลือก → ใช้สีอีกแหล่งแทน · ไม่มีทั้งคู่ = เทา</p>
            </div>
            <div className="grid gap-2">
              <Label>รูปปกการ์ด <span className="text-muted-foreground font-normal text-xs">(แนวนอน · ไม่ใส่ = ใช้แถบสีโครงการ)</span></Label>
              <div className="flex items-center gap-3">
                <div className="relative w-40 aspect-[16/7] rounded-lg overflow-hidden border bg-muted shrink-0">
                  {coverUrl
                    ? <img src={coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
                    : <span className="absolute inset-0 flex items-center justify-center gap-1.5 text-white text-xs font-semibold" style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)` }}><FlowIcon icon={icon} className="size-4" />{name || 'ชื่อโครงการ'}</span>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer rounded-md border px-3 py-1.5 hover:bg-muted">
                    <Icon name="image" className="size-4" /> เลือกรูป
                    <input type="file" accept="image/*" className="hidden" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { const url = await readImageCompressed(file, 640, 0.8); setCoverUrl(url); } catch (err) { toast('อัปโหลดรูปไม่สำเร็จ: ' + (err?.message || err), 'error'); } e.target.value = ''; }} />
                  </label>
                  {coverUrl && <button type="button" className="text-xs text-destructive hover:underline text-left" onClick={() => setCoverUrl('')}>ลบรูปปก</button>}
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>มุมมองเริ่มต้น</Label>
              <Select value={defaultView} onValueChange={setDefaultView}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="calendar">ปฏิทิน</SelectItem><SelectItem value="kanban">Kanban</SelectItem>
                  <SelectItem value="timeline">ไทม์ไลน์</SelectItem><SelectItem value="list">รายการ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* แบรนด์ (เลือกได้หลายอัน) */}
          <TabsContent value="brand" className="m-0 flex flex-col gap-2">
            <Label>แบรนด์ของโครงการนี้ {brandIds.length > 0 && <span className="text-muted-foreground font-normal">({brandIds.length})</span>}</Label>
            <p className="text-xs text-muted-foreground">เลือกได้หลายแบรนด์ · ชิปแบรนด์จะโชว์บนการ์ด/หัวบอร์ด</p>
            <div className="flex flex-col gap-0.5 max-h-72 overflow-y-auto rounded-md border p-2">
              {(TMK.brands || []).length === 0 ? <span className="text-xs text-muted-foreground p-1">ยังไม่มีแบรนด์</span>
                : (TMK.brands || []).map(b => (
                  <CheckRow key={b.id} checked={brandIds.includes(b.id)} onToggle={() => toggle(brandIds, setBrandIds, b.id)}>
                    <span className="size-2.5 rounded-full" style={{ background: b.color }} />{b.logoUrl ? <img src={b.logoUrl} alt="" className="size-4 rounded object-contain bg-white" /> : null}{b.name}
                  </CheckRow>
                ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">จัดการแบรนด์ (เพิ่ม/แก้สี/โลโก้) ได้ที่ <button className="text-primary underline" onClick={() => goSection('settings', 'brands')}>ตั้งค่า → แบรนด์</button></p>
          </TabsContent>

          {/* แคมเปญ */}
          <TabsContent value="camp" className="m-0 flex flex-col gap-2">
            <Label>แคมเปญที่ใช้ในโครงการนี้ {campaignIds.length > 0 && <span className="text-muted-foreground font-normal">({campaignIds.length})</span>}</Label>
            <p className="text-xs text-muted-foreground">เว้นว่าง = ใช้ได้ทุกแคมเปญ · เลือกบางอัน = จำกัดเฉพาะที่เลือกในโมดัลงาน/ตัวกรอง</p>
            <div className="flex flex-col gap-0.5 max-h-72 overflow-y-auto rounded-md border p-2">
              {(TMK.campaigns || []).length === 0 ? <span className="text-xs text-muted-foreground p-1">ยังไม่มีแคมเปญ</span>
                : (TMK.campaigns || []).map(c => (
                  <CheckRow key={c.id} checked={campaignIds.includes(c.id)} onToggle={() => toggle(campaignIds, setCampaignIds, c.id)}>
                    <span className="size-2.5 rounded-full" style={{ background: c.color }} />{c.name}
                  </CheckRow>
                ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">สร้างแคมเปญใหม่ได้ที่ <button className="text-primary underline" onClick={() => openModal('campaign')}>+ สร้างแคมเปญ</button></p>
          </TabsContent>

          {/* คอลัมน์สถานะ */}
          <TabsContent value="status" className="m-0 flex flex-col gap-2">
            <div className="flex items-center justify-between"><Label>คอลัมน์สถานะ (Kanban/รายการ)</Label><Button type="button" variant="outline" size="sm" onClick={addStatus}><Icon name="plus" className="size-3.5 mr-1" /> เพิ่มคอลัมน์</Button></div>
            <p className="text-xs text-muted-foreground">ลากลำดับด้วยปุ่ม ▲▼ · ติ๊ก "เสร็จ" = คอลัมน์ที่ถือว่างานเสร็จ (ใช้คิด % ความคืบหน้า)</p>
            <div className="flex flex-col gap-2">
              {statuses.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 rounded-md border p-2 bg-muted/10">
                  <div className="flex flex-col">
                    <button type="button" className="text-muted-foreground disabled:opacity-30 leading-none text-[10px]" disabled={i === 0} onClick={() => moveStatus(i, -1)}>▲</button>
                    <button type="button" className="text-muted-foreground disabled:opacity-30 leading-none text-[10px]" disabled={i === statuses.length - 1} onClick={() => moveStatus(i, 1)}>▼</button>
                  </div>
                  <ColorDot value={s.color || '#888888'} onChange={(c) => setStatus(i, { color: c })} />
                  <Input value={s.label} onChange={e => setStatus(i, { label: e.target.value })} className="h-8 flex-1" />
                  <div role="button" tabIndex={0} onClick={() => setStatus(i, { done: !s.done })} className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none" title="ถือว่างานในคอลัมน์นี้ = เสร็จ"><ShadcnCheckbox checked={!!s.done} className="pointer-events-none" /> เสร็จ</div>
                  <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive hover:bg-destructive/10" disabled={statuses.length <= 1} onClick={() => removeStatus(i)}><Icon name="trash" className="size-3.5" /></Button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* สมาชิก — เลือกได้ทั้ง "บทบาท" (หน้าที่) และ "คน" */}
          <TabsContent value="members" className="m-0 flex flex-col gap-3">
            <Label>สมาชิกโครงการ {members.length > 0 && <span className="text-muted-foreground font-normal">({members.length})</span>}</Label>
            <p className="text-xs text-muted-foreground -mt-1">เลือกเป็น "บทบาท/หน้าที่" หรือ "รายคน" ก็ได้ — งานในโครงการจะแสดงให้คนในบทบาท/คนที่เลือก</p>
            <div className="grid gap-1.5">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Icon name="shield" className="size-3.5" /> บทบาท/หน้าที่</div>
              <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto rounded-md border p-2">
                {(TMK.duties || []).length === 0 ? <span className="text-xs text-muted-foreground p-1">ยังไม่มีบทบาท (เพิ่มที่ ตั้งค่า → หน้าที่)</span>
                  : (TMK.duties || []).map((d, i) => (
                    <CheckRow key={'duty-' + d.name + i} checked={members.includes(d.name)} onToggle={() => toggle(members, setMembers, d.name)}>
                      <span className="size-2.5 rounded-full" style={{ background: d.color }} />{d.name} <span className="text-[10px] text-muted-foreground">(บทบาท)</span>
                    </CheckRow>
                  ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Icon name="user" className="size-3.5" /> รายคน</div>
              <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto rounded-md border p-2">
                {(TMK.staff || []).length === 0 ? <span className="text-xs text-muted-foreground p-1">ยังไม่มีรายชื่อทีม</span>
                  : (TMK.staff || []).map((s, i) => (
                    <CheckRow key={'staff-' + s.name + i} checked={members.includes(s.name)} onToggle={() => toggle(members, setMembers, s.name)}>
                      <Avatar name={s.name} color={s.color} size={22} />{s.name}
                    </CheckRow>
                  ))}
              </div>
            </div>
          </TabsContent>

          {/* การมองเห็น */}
          {!isGeneral && (
            <TabsContent value="access" className="m-0 flex flex-col gap-2">
              <Label>การมองเห็น</Label>
              <ToggleGroup type="single" value={visibility} onValueChange={(v) => v && setVisibility(v)} className="justify-start gap-1">
                <ToggleGroupItem value="shared" size="sm" className="gap-1.5 data-[state=on]:bg-muted"><Icon name="users" className="size-3.5" /> ทุกคนเห็น</ToggleGroupItem>
                <ToggleGroupItem value="private" size="sm" className="gap-1.5 data-[state=on]:bg-muted"><Icon name="shield" className="size-3.5" /> ส่วนตัว (เฉพาะฉัน)</ToggleGroupItem>
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">ส่วนตัว = เห็นเฉพาะผู้สร้าง ({flow.owner || me || '—'})</p>
            </TabsContent>
          )}

          {/* ประวัติกิจกรรมของโครงการนี้ */}
          <TabsContent value="history" className="m-0">
            <FlowHistoryView flow={flow} compact />
          </TabsContent>

          {/* โซนอันตราย / รีเซ็ต */}
          <TabsContent value="danger" className="m-0 flex flex-col gap-3">
            <div className="rounded-lg border border-destructive/30 p-4 flex flex-col gap-3">
              {!isGeneral && (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div><div className="font-medium text-sm">เก็บเข้าคลัง (archive)</div><div className="text-xs text-muted-foreground">ซ่อนจากรายการ · กู้คืนได้ · งานไม่หาย</div></div>
                  <Button type="button" variant="outline" size="sm" onClick={archiveFlow} disabled={busy}><Icon name="box" className="size-4 mr-1" /> เก็บเข้าคลัง</Button>
                </div>
              )}
              <div className={`flex items-center justify-between gap-3 flex-wrap ${isGeneral ? '' : 'border-t pt-3'}`}>
                <div>
                  <div className="font-medium text-sm text-destructive">{isGeneral ? 'รีเซ็ตงานทั่วไป' : 'ลบโครงการ'}</div>
                  <div className="text-xs text-muted-foreground">{isGeneral ? 'ตั้งค่ากลับค่าเริ่มต้น · งานที่ยังไม่จัดเข้าโครงการยังอยู่ครบ' : 'งานในโครงการจะย้ายกลับ "งานทั่วไป" · กู้คืนได้'}</div>
                </div>
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={deleteFlow} disabled={busy}><Icon name="trash" className="size-4 mr-1" /> {isGeneral ? 'รีเซ็ต' : 'ลบโครงการ'}</Button>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
const active_view_fallback = (flow) => (flow.defaultView && flow.defaultView !== 'settings' ? flow.defaultView : 'kanban');
