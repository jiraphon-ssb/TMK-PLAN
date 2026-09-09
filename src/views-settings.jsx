/* ============================================================
   views-settings.jsx — หน้า "ตั้งค่า" (shell) — PART 105 (รื้อใหม่)
   ============================================================
   เดิม: เมนูซ้าย 9 แท็บเรียงยาวไม่จัดกลุ่ม · บนมือถือกองเป็นแถวตั้งดันเนื้อหาตกจอทุกครั้งที่เข้า
         · ไม่บอกว่าแต่ละแท็บมีของกี่ชิ้น · หาแท็บที่ต้องการไม่ได้นอกจากไล่อ่าน
   ใหม่: จัดกลุ่ม (ระบบ · ข้อมูลหลัก · ทีม & สิทธิ์ · ข้อมูล) + จำนวนต่อแท็บ + ค้นหาเมนู
         · มือถือ = แถบเลื่อนแนวนอน · เดสก์ท็อป = เมนูซ้ายติดขอบบน (sticky)
   ============================================================ */
import { useState } from 'react';
import { Icon } from './components.jsx';
import { TMK } from './data.js';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { SearchInput } from '@/components/ui/search-input';
import { CampaignsView, TargetsView, GeneralSettings, BrandsView, ChannelsView, DutiesView, RolesView, TrashView } from './views-settings-tabs.jsx';
import { HealthHub } from './views-health.jsx'; // PART 102: "คุณภาพข้อมูล" ย้ายมาจากหน้า Data Hub (ที่ลบไปแล้ว)
import { isAdmin, canEdit, goSection } from './lib/appBus.js';

/* ====================  SETTINGS  ==================== */
export function SettingsView(props) {
  return <SettingsBody {...props} />;
}

// กลุ่มเมนู — เรียงตาม "ใช้บ่อย/ตั้งครั้งเดียว" ไม่ใช่ตามลำดับที่เขียนโค้ด
const GROUPS = [
  { id: 'sys', label: 'ระบบ', tabs: ['general'] },
  { id: 'data', label: 'ข้อมูลหลัก', tabs: ['channels', 'brands', 'campaigns'] },
  { id: 'team', label: 'ทีม & สิทธิ์', tabs: ['duties', 'roles', 'targets'] },
  { id: 'maint', label: 'ดูแลข้อมูล', tabs: ['quality', 'trash'] },
];

function SettingsBody({ sub, dark, setDark }) {
  const _isAdmin = isAdmin();
  const _canEdit = canEdit();
  const [q, setQ] = useState('');

  const ALL = [
    { id: 'general', label: 'ทั่วไป', icon: 'system', hint: 'ธีม · โปรไฟล์ · เกี่ยวกับระบบ' },
    { id: 'channels', label: 'ช่องทางขาย', icon: 'layers', hint: 'Facebook · LINE · Shopee …', count: (TMK.channels || []).length },
    { id: 'brands', label: 'แบรนด์', icon: 'store', hint: 'โลโก้ · สีประจำแบรนด์', count: (TMK.brands || []).length },
    { id: 'campaigns', label: 'แคมเปญ', icon: 'megaphone', hint: 'ช่วงเวลา · งานที่ผูกอยู่', count: (TMK.campaigns || []).length },
    { id: 'duties', label: 'หน้าที่', icon: 'shield', hint: 'แผนก/บทบาทในทีม', count: (TMK.duties || []).length },
    { id: 'roles', label: 'ผู้ใช้ & สิทธิ์', icon: 'users', hint: 'ใครเข้าได้ · ล็อกหน้ารายคน', count: (TMK.roles || []).length, need: 'admin' },
    // แอดมินเท่านั้น (PART 119) — หน้านี้ตั้งเป้า/เรตคอม/วันตัดรอบ = แก้ค่าตอบแทนตัวเองได้โดยตรง
    { id: 'targets', label: 'เป้า & คอมมิชชั่น', icon: 'target', hint: 'เป้ารายเดือน · เรตคอม · วันตัดรอบ', need: 'admin' },
    { id: 'quality', label: 'คุณภาพข้อมูล', icon: 'search', hint: 'ตรวจข้อมูลที่ยังไม่ครบ', need: 'edit' },
    { id: 'trash', label: 'ถังขยะ', icon: 'trash', hint: 'กู้คืนของที่ลบไป', need: 'edit' },
  ].filter(t => t.need === 'admin' ? _isAdmin : t.need === 'edit' ? _canEdit : true);

  const active = ALL.some(t => t.id === sub) ? sub : 'general';
  const setActive = (id) => { setQ(''); goSection('settings', id); };
  const ql = q.trim().toLowerCase();
  const match = (t) => !ql || t.label.toLowerCase().includes(ql) || (t.hint || '').toLowerCase().includes(ql);
  const hits = ALL.filter(match);

  const NavItem = ({ t }) => (
    <button key={t.id} type="button" onClick={() => setActive(t.id)} aria-current={active === t.id ? 'page' : undefined}
      className={'flex w-auto lg:w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors shrink-0 whitespace-nowrap '
        + (active === t.id ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground')}>
      <Icon name={t.icon} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{t.label}</span>
        {t.hint && <span className="hidden lg:block text-[11px] font-normal text-muted-foreground/80 truncate">{t.hint}</span>}
      </span>
      {t.count != null && <span className="num text-[11px] text-muted-foreground shrink-0">{t.count}</span>}
    </button>
  );

  return (
    <div className="p-4 md:p-8 max-w-[1200px] mx-auto w-full rise">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2 className="text-2xl font-bold tracking-tight">การตั้งค่า</h2>
          <p className="text-muted-foreground text-sm">ค่าที่ตั้งที่นี่มีผลกับทุกหน้าในระบบ</p>
        </div>
        <SearchInput placeholder="ค้นหาการตั้งค่า" value={q} onChange={e => setQ(e.target.value)} wrapperClassName="w-full sm:w-[240px]" />
      </div>

      {/* ผลค้นหา — กดแล้วกระโดดเข้าแท็บนั้น (เดิมต้องรู้เองว่าอะไรอยู่แท็บไหน) */}
      {ql && (
        <div className="mb-4 rounded-xl border p-2" style={{ borderColor: 'var(--line)' }}>
          {hits.length === 0
            ? <div className="px-2 py-3 text-sm text-muted-foreground">ไม่พบการตั้งค่าที่ตรงกับ "{q}"</div>
            : <div className="flex flex-col gap-0.5 [&>button]:w-full">{hits.map(t => <NavItem key={t.id} t={t} />)}</div>}
        </div>
      )}

      <Tabs value={active} onValueChange={setActive} className="flex flex-col lg:flex-row gap-6 w-full">
        {/* เมนู — มือถือ: แถบเลื่อนแนวนอน · เดสก์ท็อป: คอลัมน์ซ้าย sticky */}
        <aside className="lg:w-[248px] shrink-0">
          <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible lg:sticky lg:top-4 pb-1 lg:pb-0">
            {GROUPS.map(g => {
              const items = g.tabs.map(id => ALL.find(t => t.id === id)).filter(Boolean);
              if (!items.length) return null;
              return (
                <div key={g.id} className="contents lg:block">
                  <div className="hidden lg:block px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{g.label}</div>
                  <div className="contents lg:flex lg:flex-col lg:gap-0.5">{items.map(t => <NavItem key={t.id} t={t} />)}</div>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <TabsContent value="general" className="m-0 border-0 p-0 focus-visible:outline-none"><GeneralSettings dark={dark} setDark={setDark} /></TabsContent>
          <TabsContent value="channels" className="m-0 border-0 p-0 focus-visible:outline-none"><ChannelsView /></TabsContent>
          <TabsContent value="brands" className="m-0 border-0 p-0 focus-visible:outline-none"><BrandsView /></TabsContent>
          <TabsContent value="campaigns" className="m-0 border-0 p-0 focus-visible:outline-none"><CampaignsView /></TabsContent>
          <TabsContent value="duties" className="m-0 border-0 p-0 focus-visible:outline-none"><DutiesView /></TabsContent>
          <TabsContent value="targets" className="m-0 border-0 p-0 focus-visible:outline-none">{_isAdmin && <TargetsView />}</TabsContent>
          <TabsContent value="roles" className="m-0 border-0 p-0 focus-visible:outline-none">{_isAdmin && <RolesView />}</TabsContent>
          <TabsContent value="quality" className="m-0 border-0 p-0 focus-visible:outline-none">{_canEdit && <HealthHub />}</TabsContent>
          <TabsContent value="trash" className="m-0 border-0 p-0 focus-visible:outline-none">{_canEdit && <TrashView />}</TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
