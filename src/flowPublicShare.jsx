/* ============================================================
   flowPublicShare.jsx — หน้าแชร์โครงการสาธารณะ (แยกจาก views-flows.jsx)
   - PublicFlowShare ยกมาทั้งดุ้น ไม่แก้เนื้อใน · App.jsx lazy-import ไฟล์นี้แทน (?share=<token>)
   ============================================================ */
import { useState, useEffect } from 'react';
import { TMK } from './data.js';
import { supabase } from './lib/supabaseClient.js';
import { setAppState } from './lib/appBus.js';
import { thaiDate } from './lib/dateUtils.js';
import { Icon, FlowIcon } from './components.jsx';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PlannerView } from './views-planner.jsx';
import { VIEWS } from './flowsShared.js';

/* ============================================================
   PublicFlowShare — หน้าแชร์โครงการอ่านอย่างเดียว (คนนอก · ไม่ต้องล็อกอิน)
   - เปิดผ่าน ?share=<token> (App.jsx ก่อน auth gate)
   - โหลดเอง (supabase anon) flow by share_token+share_enabled → ใส่ลง TMK → render <PlannerView readOnly>
   - window.__canEdit=false → ลาก/แก้/+งาน ไม่ได้ (มี guard อยู่แล้ว) + readOnly ซ่อนปุ่ม/ปิดคลิก
   ============================================================ */
export function PublicFlowShare({ token }) {
  const [state, setState] = useState('loading'); // loading | ready | notfound
  const [flow, setFlow] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState('kanban');

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        // ลอง RPC bundle ก่อน (post-RLS: SECURITY DEFINER คืนทุกอย่างที่หน้าแชร์ใช้ ด้วย share token เดียว — anon ไม่ต้องอ่านตารางตรง)
        // → RPC ยังไม่มี (ก่อนรัน migration 20260716-enable-rls-tier1) fallback อ่านตารางตรงตามเดิม (RLS ปิดยังอ่านได้)
        let f = null, tData = [], cData = [], sData = [], dData = [], chData = [], bData = [];
        const { data: bundle, error: rpcErr } = await supabase.rpc('tmk_public_flow_bundle', { p_token: token });
        if (cancel) return;
        if (!rpcErr && bundle) {
          if (!bundle.found) { setState('notfound'); return; }
          f = bundle.flow; tData = bundle.tasks || []; cData = bundle.campaigns || []; sData = bundle.staff || [];
          dData = bundle.duties || []; chData = bundle.channels || []; bData = bundle.brands || [];
        } else {
          const { data: f0, error } = await supabase.from('tmk_flows').select('*')
            .eq('share_token', token).eq('share_enabled', true).is('deleted_at', null).maybeSingle();
          if (cancel) return;
          if (error || !f0) { setState('notfound'); return; }
          f = f0;
          const [tRes, cRes, sRes, dRes, chRes, bRes] = await Promise.all([
            supabase.from('tmk_tasks').select('*').eq('flow_id', f.id).is('deleted_at', null),
            supabase.from('tmk_campaigns').select('id,name,color').is('deleted_at', null),
            // ไม่ขอ email — หน้านี้ใช้แค่ ชื่อ→สี และผู้ชมอาจไม่ได้ล็อกอิน (ดู 20260908-public-share-hardening.sql)
            supabase.from('tmk_staff').select('name,color').is('deleted_at', null),
            supabase.from('tmk_duties').select('name,color').is('deleted_at', null),
            supabase.from('tmk_channels').select('id,name,color,logo_url').is('deleted_at', null),
            supabase.from('tmk_brands').select('id,name,color,logo_url').is('deleted_at', null),
          ]);
          if (cancel) return;
          tData = tRes.data || []; cData = cRes.data || []; sData = sRes.data || [];
          dData = dRes.data || []; chData = chRes.data || []; bData = bRes.data || [];
        }
        // ใส่ข้อมูลประกอบลง TMK (ไม่มี DataProvider — public อ่านอย่างเดียว)
        TMK.campaigns = cData.map(c => ({ id: c.id, name: c.name, color: c.color }));
        TMK.brands = bData.map(b => ({ id: b.id, name: b.name, color: b.color || '#6b5ce0', logoUrl: b.logo_url || '' }));
        TMK.staff = sData.map(s => ({ name: s.name, color: s.color || 'var(--ink-3)', email: '' }));   // email ไม่ส่งมาแล้ว
        TMK.duties = dData.map(d => ({ name: d.name, color: d.color || 'var(--ink-3)' }));
        TMK.channels = chData.map(ch => ({ id: ch.id, name: ch.name, hex: ch.color, logoUrl: ch.logo_url || '', color: `var(--ch-${(ch.id || '').toLowerCase()})` }));
        if (!TMK.kanbanMeta || !TMK.kanbanMeta.length) TMK.kanbanMeta = [{ id: 'todo', label: 'รอดำเนินการ' }, { id: 'inprogress', label: 'กำลังทำ' }, { id: 'review', label: 'รอตรวจ' }, { id: 'done', label: 'เสร็จแล้ว' }];
        const fl = {
          id: f.id, scopeId: f.id, name: f.name, color: f.color || '#6b5ce0', icon: f.icon || '',
          description: f.description || '', coverUrl: f.cover_url || '',
          statuses: Array.isArray(f.statuses) ? f.statuses : [],
          campaignIds: Array.isArray(f.campaign_ids) ? f.campaign_ids : [],
          barColorSource: f.bar_color_source || 'campaign',
        };
        TMK.flows = [fl];
        const mapped = tData.map(t => ({
          id: t.id, title: t.title, detail: t.detail || '',
          date: thaiDate(t.date), dateISO: t.date || '',
          responsible: String(t.responsible || '').split(',').map(s => s.trim()).filter(Boolean),
          camp: t.camp || '', flow: t.flow_id || '', status: t.status || 'todo',
          channel: t.channel || '', priority: t.priority || 'medium', dateEnd: t.date_end || '',
          tags: Array.isArray(t.tags) ? t.tags : [],
          brandIds: Array.isArray(t.brand_ids) ? t.brand_ids : [],   // ชิปแบรนด์ + สีแถบตามแบรนด์ ในหน้าแชร์
        }));
        TMK.tasks = mapped;
        setAppState({ canEdit: false }); // หน้าแชร์สาธารณะ = อ่านอย่างเดียว
        setFlow(fl); setTasks(mapped);
        setView(f.default_view && f.default_view !== 'settings' ? f.default_view : 'kanban');
        setState('ready');
      } catch { if (!cancel) setState('notfound'); }
    })();
    return () => { cancel = true; };
  }, [token]);

  if (state === 'loading') return (
    <div className="min-h-screen grid place-items-center text-muted-foreground">
      <div className="flex flex-col items-center gap-3"><Icon name="loader" className="size-7 animate-spin opacity-50" /><span className="text-sm">กำลังโหลด…</span></div>
    </div>
  );
  if (state === 'notfound') return (
    <div className="min-h-screen grid place-items-center text-center p-6">
      <div className="flex flex-col items-center gap-3 max-w-sm">
        <Icon name="shield" className="size-10 opacity-30" />
        <h1 className="text-lg font-bold">ลิงก์ไม่พร้อมใช้งาน</h1>
        <p className="text-sm text-muted-foreground">ลิงก์แชร์นี้อาจถูกปิดหรือไม่ถูกต้อง — ติดต่อเจ้าของโครงการเพื่อขอลิงก์ใหม่</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 sm:px-6 h-14 flex items-center gap-3">
        <FlowIcon icon={flow.icon} className="size-6 shrink-0" style={{ color: flow.color }} />
        <div className="min-w-0">
          <div className="font-bold truncate leading-tight" style={{ color: flow.color }}>{flow.name}</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Icon name="eye" className="size-3" /> อ่านอย่างเดียว · แชร์สาธารณะ</div>
        </div>
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v)} className="ml-auto gap-0.5 rounded-md border bg-muted/30 p-0.5 overflow-x-auto shrink-0">
          {VIEWS.map(([v, ic, l]) => (
            <ToggleGroupItem key={v} value={v} size="sm" className="gap-1.5 px-2.5 shrink-0 data-[state=on]:bg-background data-[state=on]:shadow-sm" title={l}><Icon name={ic} className="size-3.5" /><span className="hidden lg:inline">{l}</span></ToggleGroupItem>
          ))}
        </ToggleGroup>
      </header>
      <main className="flex-1 p-4 sm:p-6 overflow-auto">
        <PlannerView sub={view} tasks={tasks} setTasks={setTasks} flow={flow} readOnly />
      </main>
      <footer className="text-center text-[11px] text-muted-foreground py-3 border-t">TMK Operation</footer>
    </div>
  );
}
