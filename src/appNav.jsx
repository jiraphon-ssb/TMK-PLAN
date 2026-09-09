/* ============================================================
   appNav.jsx — นิยามเมนู/เนวิเกชันของ App shell (แยกจาก App.jsx)
   - NAV_DEF / useNav / DEFAULT_SUB / sidebarFlows — โครงเมนูเดิม
   - PART 100 sidebar ใหม่: NavTiles (ทางลัดส่วนตัว 2×2) + FlowsRows (แถวแบนแทน accordion)
   ============================================================ */
import { useState } from 'react';
import { TMK } from './data.js';
import { Icon, FlowIcon } from './components.jsx';
import { useLang } from './i18n.jsx';
import { userEmail } from './lib/appBus.js';
import { usePersistedState } from './hooks/usePersistedState.js';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';

export const NAV_DEF = [
  { id: 'home', labelKey: 'navHome', icon: 'home' },
  // PART 103: section 'sales' เดิม (ภาพรวม/ช่องทาง/โฆษณา/ลูกค้า) ยุบรวมเข้า 'catalog' ที่เปลี่ยนชื่อเป็น "ยอดขาย"
  //   ภาพรวม+ช่องทาง → รายงานขาย แท็บภาพรวม · โฆษณา → แท็บโฆษณา · ลูกค้า → แท็บลูกค้า & CRM
  //   เหลือ 'monthly' (บันทึก & ภาพรวมเดือน) ย้ายมาเป็นหน้าสุดท้ายของกลุ่มนี้
  // โครงการ (วางแผนงาน) — อยู่ใต้ยอดขาย
  { id: 'flows', labelKey: 'navFlows', icon: 'grid', subs: [
    { id: 'overview', labelKey: 'subFlowBoard', icon: 'grid' },
    { id: 'mytasks', labelKey: 'subMyTasks', icon: 'user' },
    { id: 'calendar', labelKey: 'subCalendar', icon: 'calendarDays' },
    { id: 'kanban', labelKey: 'subKanban', icon: 'listChecks' },
    { id: 'timeline', labelKey: 'subTimeline', icon: 'route' },
    { id: 'list', labelKey: 'subFlowList', icon: 'menu' },
    { id: 'history', labelKey: 'subFlowHistory', icon: 'clock' },
  ]},
  { id: 'catalog', labelKey: 'navCatalog', icon: 'sales', subs: [
    // เรียงตาม workflow: ดูข้อมูล (รายงาน→ออเดอร์→ลูกค้า) → กรอกข้อมูล (ส่งยอด→บันทึกขาย) → ฐานข้อมูล (แคตตาล็อก)
    { id: 'report', labelKey: 'subReport', icon: 'sales' },
    { id: 'perf', labelKey: 'subPerf', icon: 'flame' },
    { id: 'orders', labelKey: 'subOrders', icon: 'listChecks' },
    { id: 'crm', labelKey: 'subCrm', icon: 'users' },
    // PART 102: ลบหน้า "ส่งยอด & ข้อมูล" (sub 'data') — เซลล์ส่งยอดผ่านปุ่มลอยในหน้าประสิทธิภาพเซล
    { id: 'shirts', labelKey: 'subShirts', icon: 'bag' },
    // PART 112: หน้าสต็อก (เฟส 1 = สต็อกตั้งต้น + นับสต็อก)
    { id: 'stock', labelKey: 'subStock', icon: 'box' },
    // 'monthly' (บันทึก & ภาพรวมเดือน) ลบถาวร 21 ส.ค. — กรอกค่าแอด = ปุ่มลอยในรายงานขาย · สรุป/YoY/ไตรมาส อยู่แท็บภาพรวม
  ]},
  // บันทึกกิจกรรม / Log — คุมสิทธิ์รายคนผ่าน locked_sections (LockPicker) เหมือนหน้าอื่น (default เข้าได้ · admin ล็อกรายคน)
  { id: 'logs', labelKey: 'navLogs', icon: 'clock' },
];
// Resolve labels from i18n at render time
export function useNav() {
  const { t } = useLang();
  return NAV_DEF.map(n => ({
    ...n, label: t(n.labelKey), badge: n.badgeKey ? t(n.badgeKey) : undefined,
    subs: n.subs?.map(s => ({ ...s, label: t(s.labelKey) })),
  }));
}
export const DEFAULT_SUB = { flows: 'overview', sales: 'overview', planner: 'calendar', catalog: 'report', settings: 'general' };

// รายการโครงการสำหรับ sidebar (งานทั่วไป + โครงการจริง · ไม่นับ config row/archived/private ของคนอื่น)
export function sidebarFlows() {
  const me = userEmail();
  const r = (TMK.flows || []).find(f => f.id === '__general__');
  const general = { id: '__general__', name: r?.name || 'งานทั่วไป', icon: r?.icon || 'ClipboardList', defaultView: r?.defaultView || 'kanban', isGeneral: true };
  const real = (TMK.flows || []).filter(f => f.id !== '__general__' && !f.archived && (f.visibility !== 'private' || f.owner === me))
    .map(f => ({ id: f.id, name: f.name, icon: f.icon || 'ClipboardList', defaultView: f.defaultView || 'kanban' }));
  return [general, ...real];
}
/* ---------- PART 100: กลุ่ม "โครงการ" แบบแถวแบน (แทน FlowsNav accordion เดิม) ----------
   ภาพรวม / งานของฉัน / รายโครงการ (pickFlow) / สร้างโครงการ — พฤติกรรมเดิมทุกอย่าง แค่ไม่ต้องกดกาง */
export function FlowsRows({ section, sub, go, activeFlow, pickFlow, isLocked }) {
  if (isLocked('flows')) return (
    <SidebarMenuItem>
      <SidebarMenuButton className="opacity-50" tooltip="ไม่มีสิทธิ์เข้าหน้านี้" onClick={() => go('flows')}>
        <Icon name="grid" /><span>โครงการ</span><Icon name="lock" className="ml-auto size-3.5" />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
  const flows = sidebarFlows();
  const onBoard = section === 'flows' && sub !== 'overview' && sub !== 'mytasks';
  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton tooltip="ภาพรวมโครงการ" isActive={section === 'flows' && sub === 'overview'} onClick={() => go('flows', 'overview')}>
          <Icon name="grid" /><span>ภาพรวมโครงการ</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton tooltip="งานของฉัน" isActive={section === 'flows' && sub === 'mytasks'} onClick={() => go('flows', 'mytasks')}>
          <Icon name="user" /><span>งานของฉัน</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {flows.map(f => (
        <SidebarMenuItem key={f.id}>
          <SidebarMenuButton tooltip={f.name} isActive={onBoard && activeFlow === f.id} onClick={() => pickFlow(f)}>
            <FlowIcon icon={f.icon} className="size-4 shrink-0" />
            <span className="truncate">{f.name}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
      <SidebarMenuItem>
        <SidebarMenuButton tooltip="สร้างโครงการ" className="text-muted-foreground" onClick={() => { if (window.__createFlow) window.__createFlow(); else go('flows', 'overview'); }}>
          <Icon name="plus" /><span>สร้างโครงการ</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </>
  );
}

/* ---------- PART 100: ทางลัดส่วนตัว (tile 2×2 · แบบ ref ภาพมือถือดำ) ----------
   - ผู้ใช้เลือกเองสูงสุด 4 หน้า · เก็บ localStorage ต่อคน (`tmk.navTiles.<email>` — ต่อเครื่อง)
   - ตัวเลือก = เฉพาะหน้าที่มีสิทธิ์ (isLocked กรอง) · สิทธิ์ถูกล็อกภายหลัง → tile นั้นหายเอง
   - เริ่มต้นว่าง → ปุ่มเส้นประ "เพิ่มทางลัด" (ตามสเปก: ยังไม่เลือกไม่ขึ้นอะไร) */
const TILE_EXCLUDE = new Set(['flows:calendar', 'flows:kanban', 'flows:timeline', 'flows:list', 'flows:history']); // มุมมองบอร์ด ไม่ใช่หน้าปลายทาง
export const TILE_OPTIONS = NAV_DEF.flatMap(n =>
  n.subs ? n.subs.map(s => ({ key: `${n.id}:${s.id}`, section: n.id, sub: s.id, labelKey: s.labelKey, icon: s.icon }))
    : [{ key: n.id, section: n.id, sub: undefined, labelKey: n.labelKey, icon: n.icon }]
).filter(o => !TILE_EXCLUDE.has(o.key));

export function NavTiles({ go, section, sub, isLocked }) {
  const { t } = useLang();
  const [tiles, setTiles] = usePersistedState(`tmk.navTiles.${userEmail() || 'me'}`, []);
  const [open, setOpen] = useState(false);
  const allowed = TILE_OPTIONS.filter(o => !isLocked(o.section, o.sub));
  const shown = tiles.map(k => allowed.find(o => o.key === k)).filter(Boolean);
  const toggle = (k) => setTiles(p => p.includes(k) ? p.filter(x => x !== k) : p.length >= 4 ? p : [...p, k]);
  return (
    <div className="px-2 pb-1 group-data-[collapsible=icon]:hidden">
      <div className="flex items-center justify-between px-1 mb-1.5 h-4">
        <span className="text-[11px] font-medium text-muted-foreground">ทางลัด</span>
        {shown.length > 0 && (
          <button type="button" onClick={() => setOpen(true)} className="text-muted-foreground hover:text-foreground" title="แก้ทางลัด" aria-label="แก้ทางลัด">
            <Icon name="pencil" className="size-3" />
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <button type="button" onClick={() => setOpen(true)}
          className="w-full rounded-xl border border-dashed px-3 py-3 text-[12.5px] text-muted-foreground hover:text-foreground hover:border-[var(--accent)] transition-colors">
          + เพิ่มทางลัดของคุณ
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {shown.map(o => {
            const active = section === o.section && (o.sub ? sub === o.sub : true);
            return (
              <button key={o.key} type="button" onClick={() => go(o.section, o.sub)}
                className={'flex items-center gap-2 rounded-xl border px-2.5 py-2.5 text-[12.5px] font-medium text-left transition-colors min-w-0 ' +
                  (active ? 'border-[var(--accent)] bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]' : 'bg-background/60 hover:bg-[var(--sidebar-accent)]')}>
                <Icon name={o.icon} className="size-4 shrink-0" />
                <span className="truncate leading-tight">{t(o.labelKey)}</span>
              </button>
            );
          })}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>ทางลัดของคุณ</DialogTitle>
            <DialogDescription>เลือกหน้าที่ใช้บ่อยสูงสุด 4 หน้า — จะโชว์เป็นปุ่มลัดบนเมนูของคุณคนเดียว</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {allowed.map(o => {
              const on = tiles.includes(o.key);
              const full = !on && tiles.length >= 4;
              return (
                <button key={o.key} type="button" onClick={() => toggle(o.key)} disabled={full}
                  className={'flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] text-left transition-colors ' +
                    (on ? 'border-[var(--accent)] bg-[var(--sidebar-accent)] font-medium' : full ? 'opacity-40' : 'hover:bg-muted')}>
                  <Icon name={o.icon} className="size-4 shrink-0" />
                  <span className="flex-1 truncate">{t(o.labelKey)}</span>
                  {on && <Icon name="check" className="size-3.5 shrink-0" style={{ color: 'var(--accent)' }} />}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">เลือกแล้ว {tiles.length}/4</span>
            <Button size="sm" onClick={() => setOpen(false)}>เสร็จสิ้น</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
