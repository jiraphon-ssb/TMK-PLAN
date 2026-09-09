/* ============================================================
   TMK Operation — Views part 1: การ์ดที่ใช้ร่วม (ทีมวันนี้ / แคมเปญ)
   ============================================================
   HomeView ย้ายไป src/homeView.jsx แล้ว (PART 122) — ไฟล์นี้เหลือ 2 การ์ดที่หน้าแรกเรียกใช้ */
import { useState, useEffect } from 'react';
import { TMK } from './data.js';
import { Icon, Avatar, Ring } from './components.jsx';
import { todayISO } from './lib/dateUtils.js';
import { supabase } from './lib/supabaseClient.js';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { teamMembers } from './lib/teamPresence.js';
import { userEmail } from './lib/appBus.js';
const D = TMK;
// ❌ ไม่ destructure constants เพราะ primitive snapshot จะค้างที่ 0
// ✅ ใช้ TMK.consts.X inline เพื่อให้อัปเดตจาก Supabase ทันที
// chipVar/getAdCampaigns/getSegments ย้ายไป views-sales.jsx (ใช้เฉพาะ Sales · REFACTOR-1)

/* ============================================================
   HOME — Executive cockpit
   ============================================================ */
/* ---------- ทีมวันนี้ — ออนไลน์/ออฟไลน์ จาก tmk_presence (heartbeat) ---------- */
const PAGE_LABEL = { home: 'หน้าหลัก', sales: 'ยอดขาย', planner: 'แผนงาน', catalog: 'สินค้า', settings: 'ตั้งค่า' };

export function TeamTodayCard({ go }) {
  const [presence, setPresence] = useState([]);
  const [presErr, setPresErr] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    const fetchP = async () => {
      const { data, error } = await supabase.from('tmk_presence').select('email,name,page,last_seen_at');
      if (!alive) return;
      /* "อ่านไม่ได้" ≠ "ไม่มีใครออนไลน์" — เดิมกลืน error เงียบ แล้วโชว์ "0 ออนไลน์"
         เป็นข้อเท็จจริง ทั้งที่ยังใช้งานกันอยู่ (ตาราง tmk_presence ยังไม่ migrate ก็เข้าทางนี้) */
      if (error) { setPresErr(true); return; }
      setPresErr(false);
      if (Array.isArray(data)) setPresence(data);
    };
    fetchP();
    // อ่านสด + ขยับ "now" ทุก 30 วิ → คนที่เงียบเกินหน้าต่างจะกลายเป็นออฟไลน์เอง
    const id = setInterval(() => { setNow(Date.now()); fetchP(); }, 30000);
    const onVis = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); fetchP(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const openTasks = (D.tasks || []).filter(t => t.status !== 'done');
  /* รายชื่อ + สถานะออนไลน์ = lib/teamPresence.js (pure · มีเทสคุม)
     รวม tmk_user_roles กับคนที่มี heartbeat แต่ยังไม่มี role — ไม่งั้นได้ "0 ออนไลน์" ทั้งที่ใช้งานอยู่ */
  const members = teamMembers(D.roles, presence, now, todayISO(), userEmail())
    .map(r => ({ ...r, load: openTasks.filter(t => (t.responsible || []).some(x => x === r.name || x === r.department)).length }));
  const onlineCount = members.filter(m => m.online).length;
  const activeCount = members.filter(m => m.activeToday).length;

  const ago = (ts) => {
    if (!ts) return 'ยังไม่เข้าระบบ';
    const s = Math.max(0, (now - ts) / 1000);
    if (s < 60) return 'เมื่อสักครู่';
    if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
    if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
    return `${Math.floor(s / 86400)} วันก่อน`;
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center text-base font-semibold">
            <Icon name="users" className="mr-2 h-4 w-4 text-primary" />
            ทีมวันนี้
            {presErr
              ? <span className="ml-2 text-xs font-normal" style={{ color: 'var(--warn)' }}>· อ่านสถานะไม่ได้</span>
              : members.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">· {onlineCount} ออนไลน์</span>}
          </CardTitle>
        </div>
        <Button variant="ghost" size="sm" onClick={() => go('settings', 'roles')} className="h-8 text-xs">
          จัดการทีม <Icon name="arrowR" className="ml-2 h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {presErr && members.length === 0 ? (
          <div className="text-center text-sm py-6" style={{ color: 'var(--warn)' }}>อ่านสถานะออนไลน์ไม่สำเร็จ — ตัวเลขด้านล่างจะไม่ตรง</div>
        ) : members.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-6">ยังไม่มีสมาชิกในทีม</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-500"></span>
                {onlineCount} ออนไลน์
              </Badge>
              <Badge variant="secondary" className="bg-muted text-muted-foreground hover:bg-muted">
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground"></span>
                {members.length - onlineCount} ออฟไลน์
              </Badge>
              <Badge variant="outline" className="text-muted-foreground">
                เคลื่อนไหววันนี้ {activeCount} คน
              </Badge>
            </div>
            {/* การ์ดสมาชิก 3 คอลัมน์/แถว — โชว์ทุกคน (สไตล์การ์ด talent · adapt ข้อมูลจริง: หน้าที่/ออนไลน์/งานค้าง) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {members.map((m, i) => (
                <div key={m.email || i} className="rounded-2xl border bg-card p-3.5 flex flex-col gap-2.5 hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="flex items-start justify-between gap-2">
                    {m.department
                      ? <span className="text-[11px] font-medium px-2 py-1 rounded-lg truncate max-w-[75%]" style={{ background: (m.color || '#64748b') + '1a', color: m.color || '#64748b' }}>{m.department}</span>
                      : <span className="text-[11px] font-medium px-2 py-1 rounded-lg bg-muted text-muted-foreground">สมาชิก</span>}
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 mt-0.5 ${m.online ? 'bg-green-500' : 'bg-muted-foreground/35'}`} title={m.online ? 'ออนไลน์' : 'ออฟไลน์'} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <Avatar name={m.name} color={m.color || 'var(--ink-3)'} size={44} />
                      {m.online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-card" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{m.name}</div>
                      <div className={`text-xs truncate ${m.online ? 'text-green-600 dark:text-green-500' : 'text-muted-foreground'}`}>
                        {m.online ? `ออนไลน์${m.page ? ` · ${PAGE_LABEL[m.page] || m.page}` : ''}` : ago(m.last)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-auto pt-0.5">
                    {m.load > 0
                      ? <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">งานค้าง {m.load}</span>
                      : <span className="text-[11px] px-2 py-0.5 rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">ไม่มีงานค้าง</span>}
                    {m.activeToday && <span className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground">เคลื่อนไหววันนี้</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- แคมเปญ — donut total/กำลังรัน/เสี่ยง จาก TMK.campaigns ---------- */
const CAMP_TABS = [['all', 'ทั้งหมด'], ['live', 'กำลังรัน'], ['risk', 'เสี่ยง'], ['upcoming', 'รอเริ่ม']];
export function CampaignsCard({ go }) {
  const [campFilter, setCampFilter] = useState('all'); // filter เลือกดูแคมเปญตามสถานะ
  const today = todayISO();
  // ใกล้จบใน 5 วัน — คำนวณแบบ pure จาก today (เลี่ยง Date.now ระหว่าง render)
  const [_ty, _tm, _td] = today.split('-').map(Number);
  const soon = new Date(Date.UTC(_ty, _tm - 1, _td + 5)).toISOString().slice(0, 10);
  const all = (D.campaigns || []).filter(c => c.status !== 'done' && c.status !== 'cancelled'); // แคมเปญที่ยัง active (รัน/กำลังจะรัน/พัก)
  const live = all.filter(c => c.status === 'live');
  // เสี่ยง = กำลังรัน และใกล้จบ/เลยกำหนดแล้ว (ต้องตัดสินใจต่อ/สรุป) หรือถูกพักไว้
  const atRisk = all.filter(c => (c.status === 'live' && c.endISO && c.endISO <= soon) || c.status === 'paused');
  const urgent = [...atRisk].filter(c => c.endISO).sort((a, b) => a.endISO.localeCompare(b.endISO))[0] || atRisk[0];
  const total = all.length;
  const pctOf = (n) => total > 0 ? (n / total) * 100 : 0;
  // ความคืบหน้าแต่ละแคมเปญ = สัดส่วนเวลาที่ผ่านไปของช่วงแคมเปญ (pure — ไม่ใช้ Date.now)
  const dnum = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const tNum = dnum(today);
  const stMeta = { live: { l: 'กำลังรัน', c: 'var(--good)' }, upcoming: { l: 'รอเริ่ม', c: 'var(--info)' }, paused: { l: 'พัก', c: 'var(--warn)' } };
  const progressOf = (c) => { if (!c.startISO || !c.endISO) return null; const s = dnum(c.startISO), e = dnum(c.endISO); if (e <= s) return 100; return Math.max(0, Math.min(100, ((tNum - s) / (e - s)) * 100)); };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center text-base font-semibold"><Icon name="megaphone" className="mr-2 h-4 w-4 text-primary" /> แคมเปญ</CardTitle>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => go('settings', 'campaigns')}>ดูทั้งหมด <Icon name="arrowR" className="ml-2 h-3 w-3" /></Button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
      {total === 0 ? (
        <div style={{ textAlign: 'center', padding: '18px 0', color: 'var(--ink-4)' }}>
          <div className="cap" style={{ marginBottom: 10 }}>ยังไม่มีแคมเปญที่กำลังดำเนินอยู่</div>
          <Button variant="outline" size="sm" onClick={() => go('settings', 'campaigns')}>สร้างแคมเปญ</Button>
        </div>
      ) : (<>
        {/* KPI rings — คลิกเพื่อกรองรายการด้านล่าง */}
        <div className="grid grid-cols-4 gap-2">
          {(() => { const upc = all.filter(c => c.status === 'upcoming').length; return [
            { id: 'all', n: total, l: 'ทั้งหมด', c: 'var(--accent)', pct: 100 },
            { id: 'live', n: live.length, l: 'กำลังรัน', c: 'var(--good)', pct: pctOf(live.length) },
            { id: 'risk', n: atRisk.length, l: 'เสี่ยง', c: 'var(--warn)', pct: pctOf(atRisk.length) },
            { id: 'upcoming', n: upc, l: 'รอเริ่ม', c: 'var(--info)', pct: pctOf(upc) },
          ]; })().map(k => (
            <button key={k.id} onClick={() => setCampFilter(k.id)} title={`ดูเฉพาะ${k.l}`}
              className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border transition-all ${campFilter === k.id ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-muted/50'}`}>
              <Ring pct={k.pct} size={56} stroke={6} color={k.c}><span className="num" style={{ fontSize: 17, fontWeight: 800, color: k.id === 'risk' && k.n ? 'var(--warn)' : undefined }}>{k.n}</span></Ring>
              <span className="text-xs text-muted-foreground font-medium">{k.l}</span>
            </button>
          ))}
        </div>
        {/* ต้องดูด่วน */}
        <div className="mt-3 pt-3 border-t border-border/60">
          {urgent ? (
            <div onClick={() => go('settings', 'campaigns')} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer" style={{ background: 'color-mix(in srgb, var(--warn) 9%, transparent)' }}>
              <span className="size-2 rounded-full shrink-0" style={{ background: urgent.color || 'var(--warn)' }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate"><span style={{ color: 'var(--warn)' }}>ต้องดูด่วน</span> · {urgent.name}</div>
                <div className="text-xs text-muted-foreground truncate">{urgent.status === 'paused' ? 'ถูกพักไว้' : urgent.endISO && urgent.endISO < today ? `เลยกำหนด (จบ ${urgent.end})` : `ใกล้จบ ${urgent.end}`}</div>
              </div>
              <Icon name="arrowR" className="size-4 text-muted-foreground shrink-0" />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--good)' }}><Icon name="check" className="size-4" /> ทุกแคมเปญอยู่ในแผน</div>
          )}
        </div>
        {/* filter + รายการความคืบหน้า (เวลาผ่านไปกี่ %) */}
        <div className="mt-3 pt-3 border-t border-border/60 flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            {CAMP_TABS.map(([id, label]) => {
              const n = id === 'all' ? all.length : id === 'live' ? live.length : id === 'risk' ? atRisk.length : all.filter(c => c.status === 'upcoming').length;
              return (
                <button key={id} onClick={() => setCampFilter(id)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${campFilter === id ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-muted'}`}>
                  {label} {n > 0 && <span className={campFilter === id ? 'opacity-80' : 'opacity-60'}>{n}</span>}
                </button>
              );
            })}
          </div>
          {/* รายการเลื่อนได้เมื่อแคมเปญเยอะ — ไม่ให้การ์ดสูงเกินคอลัมน์ซ้าย */}
          <div className="flex flex-col gap-2.5 overflow-y-auto pr-1 -mr-1" style={{ maxHeight: 300 }}>
          {(() => {
            const shown = all.filter(c => campFilter === 'all' ? true : campFilter === 'live' ? c.status === 'live' : campFilter === 'risk' ? atRisk.includes(c) : c.status === 'upcoming');
            if (shown.length === 0) return <div className="text-center text-xs text-muted-foreground py-2.5">ไม่มีแคมเปญในหมวดนี้</div>;
            return shown.map(c => {
              const p = progressOf(c);
              const sm = stMeta[c.status] || { l: c.status, c: 'var(--ink-3)' };
              return (
                <div key={c.id} onClick={() => go('settings', 'campaigns')} className="rounded-lg px-2 py-1.5 -mx-1 hover:bg-muted/40 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="size-2 rounded-sm shrink-0" style={{ background: c.color || 'var(--ink-3)' }} />
                    <span className="text-sm font-semibold flex-1 truncate">{c.name}</span>
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md shrink-0 tabular-nums" style={{ background: sm.c + '1a', color: sm.c }}>{p == null ? sm.l : `${Math.round(p)}%`}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${p == null ? 0 : p}%`, background: c.color || 'var(--accent)' }} /></div>
                  <div className="text-[11px] text-muted-foreground mt-1 truncate">{sm.l}{c.start && c.end ? ` · ${c.start}–${c.end}` : ''}</div>
                </div>
              );
            });
          })()}
          </div>
        </div>
      </>)}
      </CardContent>
    </Card>
  );
}



/* Skeleton ยอดขาย: การ์ด KPI + กราฟ */

/* HomeView ย้ายไป src/homeView.jsx (PART 122 — รื้อหน้าแรก) · ไฟล์นี้เหลือการ์ดที่ใช้ร่วม */

/* ============================================================
   SALES — sub: overview / channels / ads / customers
   ============================================================ */

/* Shared date picker bar */

// PART 103: SalesView (หน้ายอดขายเก่า) ถูกลบถาวร — section ยุบเข้ารายงานขายแล้ว
