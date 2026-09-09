/* ============================================================
   TMK Operation — App shell, navigation, routing
   ============================================================ */
import { useState, useEffect, useRef, useCallback, memo, Suspense } from 'react';
import { TMK } from './data.js';
import { Icon, PageSkeleton, FlowIcon } from './components.jsx';
import { ConfirmHost } from './ui-confirm.jsx';
import { ConflictMergeHost } from './ui-conflict-merge.jsx';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup } from '@/components/ui/dropdown-menu';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import tmkLogo from './assets/tmk-logo.png';
import { HomeView } from './homeView.jsx';
import { OfflineBar } from './components/OfflineBar.jsx';   // PART 103: SalesView ไม่ใช้แล้ว (section 'ยอดขาย' เดิมยุบเข้ารายงานขาย)
import { Spotlight } from './Spotlight.jsx';
import { lazyRetry } from './lib/lazyRetry.js';
// Heavy views — code-split เป็น chunk แยก ลด main bundle (~330 kB)
// views-1 (Home + Sales) คงเดิม เพราะ Home เป็นหน้าแรกหลัง login ต้องเร็ว
const PlannerView  = lazyRetry(() => import('./views-planner.jsx').then(m => ({ default: m.PlannerView  })), 'views-planner');
const CatalogView  = lazyRetry(() => import('./views-catalog.jsx').then(m => ({ default: m.CatalogView  })), 'views-catalog');
const SettingsView = lazyRetry(() => import('./views-settings.jsx').then(m => ({ default: m.SettingsView })), 'views-settings');
const FlowsView    = lazyRetry(() => import('./views-flows.jsx').then(m => ({ default: m.FlowsView })), 'views-flows');
const SalePerfView = lazyRetry(() => import('./salePerf.jsx').then(m => ({ default: m.SalePerfView })), 'salePerf');
const LogView = lazyRetry(() => import('./views-log.jsx').then(m => ({ default: m.LogView })), 'views-log');
const PublicFlowShare = lazyRetry(() => import('./flowPublicShare.jsx').then(m => ({ default: m.PublicFlowShare })), 'flowPublicShare');
/* หน้า "มีอะไรใหม่" โหลดแยก — ไฟล์นั้น import changelog.js (~216 KB ข้อความย้อนหลังทุกเวอร์ชัน)
   เดิม import แบบ static ทำให้ทุกคนโหลดข้อความที่ยังไม่ได้เปิดอ่าน ก่อนเห็นหน้าจอแรก */
const WhatsNewPage = lazyRetry(() => import('./whatsNewPage.jsx').then(m => ({ default: m.WhatsNewPage })), 'whatsNewPage');
// dialogs — lazy per split file (PART 79 · ดึงออกจาก index · LoginScreen คง eager = auth gate)
const TaskModal            = lazyRetry(() => import('./modals-task.jsx').then(m => ({ default: m.TaskModal })), 'modals-task');
const CampaignModal        = lazyRetry(() => import('./modals-ads.jsx').then(m => ({ default: m.CampaignModal })), 'modals-ads-campaign');
const AdCampaignModal      = lazyRetry(() => import('./modals-ads.jsx').then(m => ({ default: m.AdCampaignModal })), 'modals-ads-ad');

/* ---- Prefetch chunk ตอนเบราว์เซอร์ว่าง ---------------------------------------
   เดิม chunk ของแต่ละเมนูดาวน์โหลด "ตอนกดครั้งแรก" เท่านั้น
   → กด Sale > รายงานขาย ครั้งแรกต้องรอ views-catalog ~290KB + vendor-charts ~430KB
     (สถานะนั้นคือ Suspense fallback = สิ่งที่ผู้ใช้เห็นว่า "โหลดอีกแล้ว")
   วิธีที่ถูกคือทำให้ "ไม่ต้องรอ" ไม่ใช่ซ่อน skeleton — โหลดล่วงหน้าตอนว่าง
   ใช้ import() ตัวเดียวกับ lazy() ด้านบน → Vite ชี้ chunk เดิม กดแล้วขึ้นทันที (ไม่เพิ่มขนาด bundle) */
const PREFETCH_CHUNKS = [
  () => import('./views-flows.jsx'),
  () => import('./views-planner.jsx'),
  () => import('./modals-task.jsx'),
  () => import('./views-catalog.jsx'),
  () => import('./modals-sale.jsx'),
  () => import('./salePerf.jsx'),
  () => import('./views-sale-submit.jsx'),
  () => import('./views-settings.jsx'),
];
let _prefetched = false;
function prefetchIdle() {
  if (_prefetched) return;
  _prefetched = true;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300));
  let i = 0;
  const next = () => {
    if (i >= PREFETCH_CHUNKS.length) return;
    const load = PREFETCH_CHUNKS[i++];
    load().then(next, next); // เสร็จ (หรือพลาด) แล้วค่อยคิวตัวถัดไป ไม่ยิงพร้อมกันแย่ง bandwidth
  };
  idle(next);
}
import { LoginScreen } from './LoginScreen.jsx';
import { LangProvider, useLang } from './i18n.jsx';
import { ToastProvider, useToast } from './toast.jsx';
import { supabase } from './lib/supabaseClient.js';
import { registerServices, setAppState, openModal } from './lib/appBus.js';
import { logAudit } from './lib/audit.js';
import { parseTaskDate, todayISO, thaiDate } from './lib/dateUtils.js';
import { DataProvider, useData } from './dataContext.jsx';
import { UserProvider, useUser } from './userContext.jsx';
import { canSeeAuditLog } from './lib/roleAccess.js';
import { promptConflictResolution } from './lib/optimisticUpdate.js';
import { UpdateBanner, useUnseenVersion } from './WhatsNew.jsx';
// ชิ้นส่วน shell + นิยามเมนู — แยกไฟล์ (ยกทั้งดุ้น ไม่แก้เนื้อใน)
import { LoadingScreen, DataErrorScreen, SyncIndicator, ErrorBoundary, RealtimeStatus } from './appShellParts.jsx';
import { NAV_DEF, useNav, DEFAULT_SUB, sidebarFlows, FlowsRows, NavTiles } from './appNav.jsx';

const ACCENTS = { '#4f46e5': '#4338ca', '#0a5aa0': '#033f78', '#b07d33': '#946614', '#1f8a5b': '#176c47', '#b8543a': '#97432d' };

const accent = '#4f46e5'; // indigo-600 — แบรนด์ active/selected/icon


/* ---- เนื้อหาของ section ปัจจุบัน — memo ไว้ ----------------------------------
   เดิม renderView() ถูกเรียกอยู่ใน Shell() → ทุกครั้งที่ state ของ shell ขยับ
   (เปิด/ปิด drawer, เมนูมือถือ, Spotlight, hover) เนื้อหาทั้งหน้าถูก render ใหม่ตามไปด้วย
   ทั้งที่ section/sub/ข้อมูล ไม่ได้เปลี่ยนเลย
   แยกเป็น component ระดับโมดูล + memo → เนื้อหาวาดใหม่เฉพาะตอน props ที่มันใช้จริงเปลี่ยน
   (go ส่งเป็น goStable ที่ identity คงที่ ไม่งั้น memo ไม่มีผล) */
const SectionContent = memo(function SectionContent({ section, sub, go, tasks, setTasks, activeFlow, dark, setDark, saleLocked = false, logsAllowed = false }) {
  let view;
  // Home + Sales (views-1) ไม่ lazy เพราะเป็นหน้าแรกหลัง login — ต้องเร็ว
  if (section === 'home') view = <HomeView go={go} />;
  else if (section === 'whatsnew') view = <Suspense fallback={<PageSkeleton />}><WhatsNewPage /></Suspense>;   // หน้า "มีอะไรใหม่" — ทุกคนเข้าได้ (ไม่ผูก settings)
  // PART 103: section 'sales' เดิมถูกยุบเข้า 'catalog' (ชื่อ "ยอดขาย") — ลิงก์/ทางลัดเก่ายังเข้าได้ ไม่ 404
  //   overview/channels → รายงานขาย · ads → แท็บโฆษณา · customers → แท็บลูกค้า · monthly → บันทึก & ภาพรวมเดือน
  else if (section === 'sales') {
    // ทางลัดยุคเก่า (section 'sales' ถูกยุบเข้า 'catalog' แล้ว) — ต้องเช็คสิทธิ์ของ 'catalog'
    // เดิม go() เช็ค isLocked('sales') ซึ่งเป็นคีย์ที่ LockPicker สร้างไม่ได้อีกแล้ว → ล็อกหน้าไม่มีผลกับทางลัดนี้
    view = saleLocked
      ? <div className="content-inner"><div className="rounded-lg border p-6 text-center" style={{ color: 'var(--ink-3)' }}>ไม่มีสิทธิ์เข้าหน้านี้ — ติดต่อแอดมิน</div></div>
      : <Suspense fallback={<PageSkeleton />}><CatalogView sub="report" /></Suspense>;
  }
  else view = (
    // Heavy chunks — ห่อด้วย Suspense
    <Suspense fallback={<PageSkeleton />}>
      {/* PART 102: ลบหน้า "ส่งยอด & ข้อมูล" — ลิงก์เก่า (data/submit/io/entry) เด้งไปประสิทธิภาพเซล (มีปุ่มส่งยอด/คนทักในนั้น) */}
      {/* 'monthly' (บันทึก & ภาพรวมเดือน) ลบถาวร → เด้งไปรายงานขาย */}
      {section === 'catalog' && sub === 'monthly' ? <CatalogView sub="report" />
        : section === 'catalog' && (sub === 'perf' || sub === 'data' || sub === 'submit' || sub === 'io' || sub === 'entry') ? <SalePerfView />
        /* ⚠️ "บันทึกกิจกรรม" = แอดมินเท่านั้น (CLAUDE.md + header ของ views-log.jsx เขียนว่า "gate ที่ App")
           แต่ App ไม่เคยมี gate จริง — มีแค่ isLocked('logs') ซึ่งเป็น deny-list ที่ default = เข้าได้
           log มี before→after ของ "เป้ายอด/เรตคอม" รายคน ซึ่งหน้าตั้งค่าและตารางรายคนกันไว้ให้ admin แล้ว */
        : section === 'logs' ? (logsAllowed ? <LogView />
          : <div className="rounded-lg border p-6 text-center" style={{ color: 'var(--ink-3)' }}>บันทึกกิจกรรมเปิดให้แอดมินเท่านั้น — ติดต่อแอดมิน</div>)
        : section === 'flows' ? <FlowsView sub={sub} tasks={tasks} setTasks={setTasks} activeFlow={activeFlow} />
        : section === 'planner' ? <PlannerView sub={sub} tasks={tasks} setTasks={setTasks} />
        : section === 'catalog' ? <CatalogView sub={sub} />
        : section === 'settings' ? <SettingsView sub={sub} dark={dark} setDark={setDark} />
        : null}
    </Suspense>
  );
  // PART 95: ล้อม ErrorBoundary รายหน้า → หน้าใด render พัง แสดงการ์ดเล็ก ที่เหลือ (sidebar/เมนู) ยังใช้ได้
  // resetKey=section:sub → สลับหน้าแล้วเคลียร์ error เอง
  return <ErrorBoundary variant="section" scope={section} resetKey={section + ':' + sub}>{view}</ErrorBoundary>;
});

export default function App() {
  /* ลิงก์ ?track=<code> — หน้าติดตามพัสดุสาธารณะ ปิดใช้งานถาวร (PART 118)
     ข้อมูลของหน้านี้มาจากตาราง tmk_orders ยุคเก่าที่ไม่มีใครเขียนตั้งแต่ PART 35 → ค้นยังไงก็ไม่เจอ
     คงเส้นทางไว้เป็นข้อความสั้น ๆ เผื่อมีลูกค้าถือลิงก์เก่าอยู่ (ดีกว่าเจอหน้าล็อกอินแล้วงง) */
  const trackCode = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('track') : null;
  if (trackCode != null) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)', color: 'var(--ink)' }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>ระบบติดตามพัสดุออนไลน์ปิดให้บริการแล้ว</div>
          <div style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.7 }}>
            สอบถามสถานะการจัดส่งได้ที่แชทที่สั่งซื้อไว้ ทีมงานตรวจให้ทันที
          </div>
        </div>
      </div>
    );
  }
  // เปิดลิงก์ ?share=<token> → หน้าโครงการสาธารณะ อ่านอย่างเดียว (ไม่ต้องล็อกอิน · ไม่โหลดข้อมูลร้านทั้งหมด)
  const shareToken = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('share') : null;
  if (shareToken) {
    return (
      <ErrorBoundary>
        <LangProvider><ToastProvider>
          <Suspense fallback={<PageSkeleton />}>
            <PublicFlowShare token={shareToken} />
          </Suspense>
        </ToastProvider></LangProvider>
      </ErrorBoundary>
    );
  }
  return (
    <ErrorBoundary>
      <LangProvider>
        <ToastProvider>
          <DataProvider>
            <AppShellWithUser />
          </DataProvider>
        </ToastProvider>
      </LangProvider>
    </ErrorBoundary>
  );
}

function AppShellWithUser() {
  const { version } = useData();
  return (
    <UserProvider version={version}>
      <AppInner />
    </UserProvider>
  );
}

function AppInner() {
  const { t } = useLang();
  const { toast } = useToast();
  const { loading: dataLoading, error: dataError, version: dataVersion, reload: dataReload, refresh: dataRefresh, ensureLoaded: dataEnsure, patchRows: dataPatch } = useData();
  const { user: currentUserCtx } = useUser() || {};
  // version bumps when Supabase data arrives → force re-render of all views
  const NAV = useNav();
  const unseenVersion = useUnseenVersion(); // จุดแดง "มีอะไรใหม่" บนเมนูโปรไฟล์

  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('tmk-dark') === 'true'; } catch { return false; }
  });
  // Auth จริง: session มาจาก Supabase Auth (persist/refresh ให้เองใน localStorage)
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false); // เช็ค session แรกเสร็จหรือยัง (กันจอ login กระพริบตอน restore)
  const authed = !!session;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap auth: ไม่มี Supabase = ปลดล็อกหน้าจอทันที (ทางเดียวกับ getSession ที่เป็น async) การรื้อเป็น derived state เสี่ยงจอ login กระพริบ
    if (!supabase) { setAuthReady(true); return; } // ยังไม่ตั้งค่า Supabase → ข้าม (กัน crash, DataProvider แจ้ง error เอง)
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setAuthReady(true); } });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (alive) setSession(s); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);
  const [modal, setModal] = useState(null);
  const [spotlight, setSpotlight] = useState(false);
  // Persist section + subMap → กด refresh แล้วอยู่หน้าเดิม
  const [section, setSection] = useState(() => {
    try { const s = localStorage.getItem('tmk-section') || 'home'; return s === 'planner' ? 'flows' : s; } catch { return 'home'; } // planner ถูกแทนด้วย flows (multi-flow)
  });
  const [subMap, setSubMap] = useState(() => {
    try {
      const saved = localStorage.getItem('tmk-submap');
      const merged = saved ? { ...DEFAULT_SUB, ...JSON.parse(saved) } : { ...DEFAULT_SUB };
      // migrate stale sub ids (เช่น sales 'daily'/'status' ที่ถูกรวมไปแล้ว) → กัน sub-nav ไม่มี active + breadcrumb ว่าง
      const valid = {}; NAV_DEF.forEach(n => { if (n.subs) valid[n.id] = n.subs.map(s => s.id); });
      Object.keys(merged).forEach(sec => { if (valid[sec] && !valid[sec].includes(merged[sec])) merged[sec] = DEFAULT_SUB[sec] || valid[sec][0]; });
      return merged;
    } catch { return DEFAULT_SUB; }
  });
  // โครงการที่เปิดอยู่ — single source of truth ที่ App (ไม่พึ่ง window.__activeFlow ที่ lag) → sidebar/breadcrumb/board อัปเดตพร้อมกันคลิกเดียว
  const [activeFlow, setActiveFlow] = useState(() => { try { return localStorage.getItem('tmk-flow') || '__general__'; } catch { return '__general__'; } });
  useEffect(() => { try { localStorage.setItem('tmk-flow', activeFlow); } catch { /* ignore */ } setAppState({ activeFlow }); }, [activeFlow]);
  useEffect(() => { registerServices({ setFlow: (id) => setActiveFlow(id || '__general__') }); }, []);
  // โครงการที่เปิดอยู่หาย (ถูกลบ/archive/ซ่อน) → กลับ "งานทั่วไป"
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync จาก external store (TMK.flows mutate นอก React) เมื่อ dataVersion ขยับ · คำนวณตอน render ไม่ได้เพราะต้องอ่าน global ที่เพิ่งถูก mutate
  useEffect(() => { if (activeFlow !== '__general__' && !sidebarFlows().find(f => f.id === activeFlow)) setActiveFlow('__general__'); }, [activeFlow, dataVersion]);
  const [tasks, setTasks] = useState(TMK.tasks);
  // Sync local tasks state เมื่อ Supabase data update (version bump)
  // ปรับ state ตอน render เมื่อ version เปลี่ยน (pattern ที่ React แนะนำ) แทน setState ใน effect → ไม่ render ซ้ำ
  const [tasksVer, setTasksVer] = useState(dataVersion);
  if (tasksVer !== dataVersion) {
    setTasksVer(dataVersion);
    setTasks([...(TMK.tasks || [])]);
  }

  // Persist section + subMap ทุกครั้งที่เปลี่ยน → refresh แล้วอยู่หน้าเดิม
  useEffect(() => {
    try { localStorage.setItem('tmk-section', section); } catch { /* ignore */ }
  }, [section]);
  useEffect(() => {
    try { localStorage.setItem('tmk-submap', JSON.stringify(subMap)); } catch { /* ignore */ }
  }, [subMap]);
  const [drawer, setDrawer] = useState(false);
  const [, setMenu] = useState(false);
  const contentRef = useRef(null);

  const nav = NAV.find(n => n.id === section);
  // Settings ไม่อยู่ใน NAV แต่มี sub-tabs — อ่านจาก subMap ตรง
  const SECTIONS_WITH_SUBS = ['settings'];
  const sub = (nav?.subs || SECTIONS_WITH_SUBS.includes(section)) ? subMap[section] : null;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', !!dark);
    root.style.setProperty('--accent', dark ? `color-mix(in srgb, ${accent} 62%, white)` : accent);
    root.style.setProperty('--accent-2', dark ? `color-mix(in srgb, ${accent} 40%, white)` : (ACCENTS[accent] || accent));
    try { localStorage.setItem('tmk-dark', dark ? 'true' : 'false'); } catch { /* ignore */ }
  }, [dark]);

  // สิทธิ์แก้ไข: 'viewer' = ดูอย่างเดียว (เจ้าของ/แอดมิน/ผู้แก้ไข = แก้ได้) — default viewer ถ้าไม่อยู่ในระบบ
  const canEdit = (currentUserCtx?.role || 'viewer') !== 'viewer';
  const isAdmin = canSeeAuditLog(currentUserCtx);   // gate หน้าที่เปิดให้แอดมินเท่านั้น (logs) — สูตรอยู่ lib/roleAccess.js
  const canEditRef = useRef(canEdit);
  // อัปเดตใน effect (ไม่เขียน ref ตอน render) — อ่านเฉพาะตอน event (openModal) จึงทันเสมอ
  useEffect(() => { canEditRef.current = canEdit; }, [canEdit]);

  // สถานะสิทธิ์ → appBus (window.__* = facade มิเรอร์ให้อัตโนมัติ · ไม่เขียน window ตอน render)
  useEffect(() => {
    setAppState({
      canEdit,
      isAdmin: currentUserCtx?.role === 'admin', // จัดการผู้ใช้/สิทธิ์ = admin เท่านั้น
      userEmail: currentUserCtx?.email || '',      // ผู้ทำรายการ (created_by/by)
      lockedSections: currentUserCtx?.lockedSections || [], // หน้าใหญ่ที่ถูกล็อก (admin = [] เสมอ)
    });
  }, [canEdit, currentUserCtx?.role, currentUserCtx?.email, currentUserCtx?.lockedSections]);

  // บริการ app-level → appBus (openModal/toast/reload/refresh/ensureLoaded/goSection)
  useEffect(() => {
    registerServices({
      openModal: (type, data) => {
        if (!canEditRef.current) { toast('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว" — แก้ไขข้อมูลไม่ได้ (ติดต่อแอดมินเพื่อขอสิทธิ์)', 'warn'); return; }
        setModal({ type, data });
      },
      toast,
      reload: dataReload, // full reload (ใช้เฉพาะที่จำเป็นจริง)
      refresh: (tables) => (dataRefresh ? dataRefresh(tables) : dataReload?.()), // per-table refresh ลด egress
      patchRows: (table, rows) => dataPatch?.(table, rows), // optimistic: เห็นผลทันทีที่กดเซฟ
      ensureLoaded: (keys) => dataEnsure?.(keys), // โหลดตาราง deferred ตอนกดเข้า section
      goSection: (sec, s) => goRef.current(sec, s), // ref → go ล่าสุดเสมอ (กัน stale closure สิทธิ์)
    });
    // deps: ทุกตัวเป็น useCallback ที่ identity คงที่จาก DataProvider → effect รันครั้งเดียวเหมือนเดิม (registerServices merge = idempotent)
  }, [toast, dataReload, dataRefresh, dataEnsure, dataPatch]);

  // กันล้อเมาส์เปลี่ยนค่า input[type=number] เงียบๆ ตอน scroll ฟอร์มกรอกยอด/สินค้า
  // (Chrome/Firefox: focus ค้าง + scroll → ค่าเพิ่ม/ลด → ยอดเพี้ยนถูกเซฟจริงได้)
  useEffect(() => {
    const onWheel = (e) => {
      const t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'number' && document.activeElement === t) t.blur();
    };
    document.addEventListener('wheel', onWheel, { passive: true });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);

  // ===== Presence heartbeat — บันทึก "ออนไลน์" ของผู้ใช้ปัจจุบัน =====
  // upsert แถวของตัวเองทุก ~45 วิ ระหว่างแท็บเปิดอยู่ (+ ตอนเปิด/กลับมาที่แท็บ)
  // การ์ด "ทีมวันนี้" หน้าหลักอ่าน tmk_presence ทุก 30 วิ → online = last_seen ภายใน ~2.5 นาที
  // page/name อ่านผ่าน ref → effect ไม่ rerun ทุกครั้งที่เปลี่ยนหน้า (ไม่ทิ้ง/ตั้ง interval ใหม่)
  const presenceMetaRef = useRef({ page: section, name: currentUserCtx?.name || '' });
  // เขียนใน effect (ไม่เขียน ref ตอน render) — effect นี้อยู่เหนือ heartbeat จึงอัปเดตก่อน beat() รอบแรกเสมอ
  useEffect(() => { presenceMetaRef.current = { page: section, name: currentUserCtx?.name || '' }; }, [section, currentUserCtx?.name]);
  useEffect(() => {
    const email = session?.user?.email;
    if (!email) return;
    const key = email.toLowerCase();
    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      const nowIso = new Date().toISOString();
      supabase.from('tmk_presence').upsert(
        { email: key, name: presenceMetaRef.current.name, page: presenceMetaRef.current.page, last_seen_at: nowIso, updated_at: nowIso },
        { onConflict: 'email' }
      ).then(() => {}, () => {}); // เงียบถ้าตารางยังไม่ถูกสร้าง (ยังไม่รัน migration)
    };
    beat();
    const id = setInterval(beat, 45000);
    const onVis = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [session]);

  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSpotlight(s => !s); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const closeModal = () => { setModal(null); };
  const logout = async () => {
    const email = session?.user?.email;
    if (email) {
      logAudit({ action: 'logout', entityType: 'auth', entityName: email, summary: `ออกจากระบบ (${email})` });
      // mark offline ทันที — ตั้ง last_seen ย้อน 10 นาที (พ้นหน้าต่าง online แต่ยังนับเป็น "วันนี้")
      // ใช้ update (ไม่ใช่ upsert) → แก้แค่ 2 คอลัมน์ ไม่ทับ name/page ให้เป็น null
      supabase.from('tmk_presence').update(
        { last_seen_at: new Date(Date.now() - 600000).toISOString(), updated_at: new Date().toISOString() }
      ).eq('email', email.toLowerCase()).then(() => {}, () => {});
    }
    setMenu(false); setDrawer(false);
    setSection('home'); setSubMap(DEFAULT_SUB);
    try {
      localStorage.removeItem('tmk-section');
      localStorage.removeItem('tmk-submap');
    } catch { /* ignore */ }
    await supabase.auth.signOut(); // → onAuthStateChange เคลียร์ session → authed=false
  };

  // Called by LoginScreen หลัง signIn/signUp สำเร็จ — auth จริงทำใน LoginScreen, session เปลี่ยนเองผ่าน onAuthStateChange
  const handleLogin = (email) => {
    const userEmail = email || '';
    logAudit({ action: 'login', entityType: 'auth', entityName: userEmail, summary: `เข้าสู่ระบบ (${userEmail})` });
  };

  // ล็อกหน้าของ user นี้ — จุดคุมเดียวที่ go() ครอบทุกทางเข้า (sidebar/drawer/tabbar/breadcrumb/Spotlight/__goSection)
  // รองรับทั้ง section ใหญ่ (id) และหน้าย่อย (composite "section:sub" เช่น catalog:orders) เก็บใน locked_sections เดียวกัน
  const isLocked = (sec, s) => { const L = currentUserCtx?.lockedSections || []; return L.includes(sec) || (!!s && L.includes(sec + ':' + s)); };
  // หน้าย่อยแรกที่เข้าได้ของ section (null = ล็อกหมดทุกหน้าย่อย)
  const firstAllowedSub = (sec) => (NAV_DEF.find(n => n.id === sec)?.subs || []).map(x => x.id).find(id => !isLocked(sec, id)) || null;
  /* คืน true = ไปถึงจริง · false = ถูกปฏิเสธ (ล็อก)
     ผู้เรียกที่ทำอย่างอื่นต่อหลัง go() ต้องเช็คค่านี้ ไม่งั้นทำงานบนหน้าที่เพิ่งโดนห้าม
     (เคสจริง: FAB มือถือ go() แล้ว setTimeout เปิดฟอร์มสร้างงานต่อทันที) */
  const go = (sec, s) => {
    // บันทึกกิจกรรม = แอดมินเท่านั้น (ไม่ใช่ deny-list) — บล็อกตั้งแต่นำทาง ทุกทางเข้า
    if (sec === 'logs' && !isAdmin) { toast('บันทึกกิจกรรมเปิดให้แอดมินเท่านั้น', 'warn'); return false; }
    if (isLocked(sec)) { toast('ไม่มีสิทธิ์เข้าหน้านี้ — ติดต่อแอดมิน', 'warn'); return false; } // section ใหญ่ล็อก
    if (s && isLocked(sec, s)) { toast('ไม่มีสิทธิ์เข้าหน้านี้ — ติดต่อแอดมิน', 'warn'); return false; } // หน้าย่อยที่ระบุถูกล็อก
    let target = s;
    const hasSubs = (NAV_DEF.find(n => n.id === sec)?.subs || []).length > 0;
    if (!target && hasSubs) { // คลิก header — ใช้ default; ถ้า default ล็อก → หน้าย่อยแรกที่เข้าได้
      const def = subMap[sec] || DEFAULT_SUB[sec];
      target = def && !isLocked(sec, def) ? def : firstAllowedSub(sec);
      if (!target) { toast('ไม่มีสิทธิ์เข้าหน้านี้ — ติดต่อแอดมิน', 'warn'); return false; } // ล็อกทุกหน้าย่อย
    }
    setSection(sec);
    if (target) setSubMap(m => ({ ...m, [sec]: target }));
    setDrawer(false); setMenu(false);
    if (contentRef.current) contentRef.current.scrollTop = 0;
    return true;
  };
  const goRef = useRef(go);
  // ตัวอ้างอิง go ที่ identity คงที่ — ส่งให้ <SectionContent> ที่ memo ไว้
  // (go ตัวจริงถูกสร้างใหม่ทุก render ถ้าส่งตรงๆ memo จะไม่มีผลเลย)
  const goStable = useCallback((sec, s) => goRef.current(sec, s), []);
  // ให้ window.__goSection ใช้ go ล่าสุด (deps ครบ: isLocked/subMap/lockedSections)
  // เขียนใน effect ทุกรอบ render (ไม่เขียน ref ตอน render) — goRef ถูกอ่านเฉพาะตอน event เท่านั้น
  // eslint-disable-next-line react-hooks/immutability -- pattern "เก็บ callback ล่าสุดใส่ ref": compiler เตือนเพราะ goRef ถูกอ่านใน effect registerServices ด้านบน แต่การอ่านนั้นเกิดตอนผู้ใช้กด (goSection) ไม่ใช่ตอน effect รัน · ย้าย effect ไปไว้ก่อนหน้าไม่ได้เพราะ go() นิยามที่นี่
  useEffect(() => { goRef.current = go; });
  // section/หน้าย่อยปัจจุบันโดนล็อก (restore จาก localStorage / โดนล็อกสดผ่าน realtime) → เด้งออก
  // ก่อน roles โหลด lockedSections = [] จึงไม่ redirect มั่ว
  /* eslint-disable react-hooks/set-state-in-effect -- เด้งออกจากหน้าที่ถูกล็อก (สิทธิ์มาทีหลัง/ถูกล็อกสดผ่าน realtime) เป็น guard ด้านความปลอดภัย ต้องทำหลัง render · รื้อเป็น derived state เสี่ยงหลุดหน้าที่ไม่มีสิทธิ์ */
  useEffect(() => {
    if (isLocked(section)) { setSection('home'); return; }
    if (sub && isLocked(section, sub)) { const alt = firstAllowedSub(section); alt ? setSubMap(m => ({ ...m, [section]: alt })) : setSection('home'); }
  }, [currentUserCtx?.lockedSections, section, sub]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */
  // เลือกโครงการ + ไปบอร์ด (คลิกเดียว · setActiveFlow ทำให้ sidebar/breadcrumb/board re-render พร้อมกัน)
  const pickFlow = (f) => { setActiveFlow(f.id); go('flows', f.defaultView && f.defaultView !== 'settings' ? f.defaultView : 'kanban'); };



  // lazy-load (PART 33 · ลดเหลือ adCamps อย่างเดียวใน PART 109): โหลดตอนกดเข้า section ที่ใช้จริง
  useEffect(() => {
    if (dataVersion < 1) return;
    if (section === 'sales' || section === 'catalog' || section === 'settings') dataEnsure?.(['adCamps']);
  }, [section, dataVersion, dataEnsure]);

  // Prefetch chunk ของเมนูอื่นตอนว่าง — เริ่มหลังข้อมูลชุดแรกมาแล้ว (ไม่แย่ง bandwidth กับ query ตอนเปิดแอป)
  useEffect(() => { if (dataVersion >= 1) prefetchIdle(); }, [dataVersion]);



  // Special sections not in NAV (settings)
  const SPECIAL_LABELS = { settings: 'ตั้งค่า', whatsnew: 'มีอะไรใหม่' };
  const subLabel = nav?.subs?.find(s => s.id === sub)?.label || SPECIAL_LABELS[section];

  const isMobile = useIsMobile();
  const Shell = () => (
    <SidebarProvider className="app">
      {spotlight && <Spotlight onClose={() => setSpotlight(false)} onGo={go} />}
      {/* ---------- Desktop Sidebar ---------- */}
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-white text-sidebar-primary-foreground">
                  <img src={tmkLogo} alt="TMK" className="size-6 object-contain" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold text-[15px]">TMK Operation</span>
                  <span className="text-xs text-muted-foreground font-medium">ศูนย์ปฏิบัติการ</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {/* PART 100: sidebar ใหม่ — การ์ดไฮไลต์ + หน้าหลัก + ทางลัดส่วนตัว + กลุ่มแถวแบน (ไม่มี accordion) */}
          {/* การ์ด "มีอะไรใหม่" — โผล่เฉพาะยังไม่อ่านเวอร์ชันล่าสุด (แบบการ์ดแจ้งเตือน ref ภาพมือถือ) */}
          {unseenVersion && (
            <div className="px-2 pt-2 group-data-[collapsible=icon]:hidden">
              <button type="button" onClick={() => go('whatsnew')}
                className="w-full flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-[var(--sidebar-accent)]"
                style={{ background: 'var(--accent-soft, rgba(99,102,241,.06))' }}>
                <span className="relative grid size-8 shrink-0 place-items-center rounded-full border bg-background">
                  <Icon name="sparkle" className="size-4" style={{ color: 'var(--accent)' }} />
                  <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full" style={{ background: 'var(--bad, #ef4444)' }} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight">มีอะไรใหม่</span>
                  <span className="block text-[11px] text-muted-foreground">อัปเดตล่าสุด — กดดูเลย</span>
                </span>
                <Icon name="chevR" className="size-4 text-muted-foreground shrink-0" />
              </button>
            </div>
          )}

          {/* หน้าหลัก (แถวบนสุด — tile เป็นของ custom เพิ่มเอง) */}
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={section === 'home'} onClick={() => go('home')} tooltip="หน้าหลัก">
                  <Icon name="home" /><span>หน้าหลัก</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* ทางลัดส่วนตัว — เลือกเองสูงสุด 4 (เฉพาะหน้าที่มีสิทธิ์ · เริ่มต้นว่าง) */}
          <NavTiles go={go} section={section} sub={sub} isLocked={isLocked} />

          {/* กลุ่มเมนูแบน: ยอดขาย → โครงการ → Sale (เรียงตาม NAV เดิม) — เห็นทุกหน้าใน 1 คลิก */}
          {NAV.filter(n => n.id !== 'home' && n.id !== 'logs').map(n => (
            <SidebarGroup key={n.id}>
              <SidebarGroupLabel>{n.label}</SidebarGroupLabel>
              <SidebarMenu>
                {n.id === 'flows' ? (
                  <FlowsRows section={section} sub={sub} go={go} activeFlow={activeFlow} pickFlow={pickFlow} isLocked={isLocked} />
                ) : (n.subs || []).map(s => {
                  const L = isLocked(n.id, s.id);
                  return (
                    <SidebarMenuItem key={s.id}>
                      <SidebarMenuButton isActive={section === n.id && sub === s.id} className={L ? 'opacity-50' : undefined}
                        tooltip={L ? 'ไม่มีสิทธิ์เข้าหน้านี้' : s.label} onClick={() => go(n.id, s.id)}>
                        <Icon name={s.icon} /><span>{s.label}</span>
                        {L && <Icon name="lock" className="ml-auto size-3.5" />}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}

          {/* ระบบ — บันทึกกิจกรรม (admin คุมสิทธิ์รายคน) + มีอะไรใหม่ (ทุกคนเข้าได้เสมอ ไม่มีล็อก) */}
          <SidebarGroup>
            <SidebarGroupLabel>ระบบ</SidebarGroupLabel>
            <SidebarMenu>
              {NAV.filter(n => !n.subs && n.id !== 'home' && !(n.id === 'logs' && !isAdmin)).map(n => {
                const L = isLocked(n.id);
                return (
                  <SidebarMenuItem key={n.id}>
                    <SidebarMenuButton isActive={section === n.id} className={L ? 'opacity-50' : undefined}
                      tooltip={L ? 'ไม่มีสิทธิ์เข้าหน้านี้' : n.label} onClick={() => go(n.id)}>
                      <Icon name={n.icon} /><span>{n.label}</span>
                      {L && <Icon name="lock" className="ml-auto size-3.5" />}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              <SidebarMenuItem>
                <SidebarMenuButton isActive={section === 'whatsnew'} tooltip="มีอะไรใหม่" onClick={() => go('whatsnew')}>
                  <Icon name="sparkle" /><span>มีอะไรใหม่</span>
                  {unseenVersion && <span className="ml-auto inline-block size-2 rounded-full" style={{ background: 'var(--bad, #ef4444)' }} aria-label="มีเวอร์ชันใหม่" />}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            {/* "มีอะไรใหม่" ย้ายไป: การ์ดไฮไลต์บน SidebarContent (ตอนมีของใหม่) + เมนูผู้ใช้ (ถาวร) */}
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground outline-none"
                  >
                    <span className="relative">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarFallback className="rounded-lg font-semibold" style={{ backgroundColor: currentUserCtx?.color || '#e2e8f0', color: currentUserCtx?.color ? '#fff' : '#334155' }}>
                          {currentUserCtx?.name ? currentUserCtx.name.substring(0, 2).toUpperCase() : 'GR'}
                        </AvatarFallback>
                      </Avatar>
                      {unseenVersion && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-[var(--sidebar,#fff)]" style={{ background: 'var(--bad, #ef4444)' }} aria-hidden="true" />}
                    </span>
                    <div className="flex flex-col gap-0.5 leading-none flex-1 text-left">
                      <span className="font-semibold text-sm">{currentUserCtx?.name || 'Graphic'}</span>
                      <span className="text-xs text-muted-foreground">{currentUserCtx?.email || 'graphic@tmk.co'}</span>
                    </div>
                    <Icon name="chevD" className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarFallback className="rounded-lg font-semibold" style={{ backgroundColor: currentUserCtx?.color || '#e2e8f0', color: currentUserCtx?.color ? '#fff' : '#334155' }}>
                          {currentUserCtx?.name ? currentUserCtx.name.substring(0, 2).toUpperCase() : 'GR'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-0.5 leading-none flex-1 text-left">
                        <span className="font-semibold text-sm">{currentUserCtx?.name || 'Graphic'}</span>
                        <span className="text-xs text-muted-foreground">{currentUserCtx?.email || 'graphic@tmk.co'}</span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    {/* ล็อกหน้าตั้งค่าไว้ = ต้องเห็นว่าล็อก (เหมือนแผงมือถือด้านล่าง) — เดิมกดแล้วเงียบ ไม่มีอะไรเกิดขึ้น */}
                    <DropdownMenuItem onClick={() => go('settings', 'general')} disabled={isLocked('settings')} className="cursor-pointer">
                      <Icon name={isLocked('settings') ? 'lock' : 'system'} className="size-4 mr-2 text-muted-foreground" />
                      ตั้งค่า
                      {isLocked('settings') && <span className="ml-auto text-[11px] text-muted-foreground">ถูกล็อก</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => go('whatsnew')} className="cursor-pointer">
                      <Icon name="sparkle" className="size-4 mr-2 text-muted-foreground" />
                      มีอะไรใหม่
                      {unseenVersion && <span className="ml-auto inline-block size-2 rounded-full" style={{ background: 'var(--bad, #ef4444)' }} aria-label="มีเวอร์ชันใหม่" />}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive">
                    <Icon name="external" className="size-4 mr-2" />
                    ออกจากระบบ
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* ---------- Main Inset ---------- */}
      <SidebarInset>
        <div className="main">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <div className="flex flex-1 items-center gap-2 overflow-hidden">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    {section === 'flows' ? (() => {
                      // breadcrumb ของ flows = สลับ "โครงการ + ภาพรวม" · อ่าน activeFlow จาก state (reactive · ไม่ lag)
                      const flows = sidebarFlows();
                      const cur = flows.find(f => f.id === activeFlow);
                      const pick = (f) => pickFlow(f);
                      return (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="flex items-center gap-1.5 focus:outline-none">
                            {sub === 'overview' ? <Icon name="grid" className="size-4 opacity-70" /> : sub === 'mytasks' ? <Icon name="user" className="size-4 opacity-70" /> : <FlowIcon icon={cur?.icon} className="size-4" />}
                            <span className="truncate max-w-[180px]">{sub === 'overview' ? 'โครงการทั้งหมด' : sub === 'mytasks' ? 'งานของฉัน' : (cur?.name || 'โครงการ')}</span>
                            <Icon name="chevD" className="size-3 ml-0.5 opacity-50" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-56">
                            <DropdownMenuItem onClick={() => go('flows', 'overview')} className="cursor-pointer gap-2"><Icon name="grid" className="size-4" /><span className="flex-1">ภาพรวมโครงการ</span>{sub === 'overview' && <Icon name="check" className="size-4 text-primary" />}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => go('flows', 'mytasks')} className="cursor-pointer gap-2"><Icon name="user" className="size-4" /><span className="flex-1">งานของฉัน</span>{sub === 'mytasks' && <Icon name="check" className="size-4 text-primary" />}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {flows.map(f => (
                              <DropdownMenuItem key={f.id} onClick={() => pick(f)} className="cursor-pointer gap-2">
                                <FlowIcon icon={f.icon} className="size-4 shrink-0" /><span className="flex-1 truncate">{f.name}</span>
                                {sub !== 'overview' && sub !== 'mytasks' && activeFlow === f.id && <Icon name="check" className="size-4 text-primary" />}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    })() : nav?.subs ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex items-center gap-1 focus:outline-none">
                          {nav.label}
                          <Icon name="chevD" className="size-3 ml-1 opacity-50" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {nav.subs.map(sub => (
                            <DropdownMenuItem key={sub.id} onClick={() => go(section, sub.id)} className="cursor-pointer">
                              {sub.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <BreadcrumbPage>{nav?.label || SPECIAL_LABELS[section] || ''}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {nav?.subs && subLabel && !(section === 'flows' && (sub === 'overview' || sub === 'mytasks')) && (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{subLabel}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </>
                  )}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            
            <div className="flex items-center gap-2">
              {!canEdit && (
                <Badge variant="secondary" className="cursor-pointer bg-amber-100 text-amber-800 hover:bg-amber-200" onClick={() => { const admins = (TMK.roles || []).filter(r => r.role === 'admin').map(r => `${r.name} (${r.email})`); toast(admins.length ? `ขอสิทธิ์แก้ไขได้ที่แอดมิน: ${admins.join(', ')}` : 'ยังไม่มีแอดมินในระบบ', 'warn'); }} title="คลิกดูแอดมินที่ขอสิทธิ์ได้">
                  <Icon name="eye" className="size-3 mr-1" /><span className="hidden sm:inline">ดูอย่างเดียว</span>
                </Badge>
              )}
              
              <Button variant="outline" className="relative h-9 w-9 p-0 xl:h-9 xl:w-60 xl:justify-start xl:px-3 xl:py-2 text-muted-foreground" onClick={() => setSpotlight(true)} title={t('search')}>
                <Icon name="search" className="size-4 xl:mr-2" />
                <span className="hidden xl:inline flex-1 text-left">{t('search')}...</span>
                <kbd className="pointer-events-none hidden xl:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </Button>
            </div>
          </header>

          <OfflineBar />

          <div className={'content' + (section === 'catalog' ? ' sale-section' : '')} ref={contentRef}>
            {/* คอลัมน์เนื้อหากลางเดียว (max 1280 · จัดกึ่งกลาง) — ทุกหน้าอยู่ตรงกลางเท่ากันไม่ว่าจะพับ sidebar หรือไม่ */}
            <div className="content-inner">
              <SectionContent
                saleLocked={isLocked('catalog') || isLocked('catalog', 'report')}
                logsAllowed={isAdmin}
                section={section} sub={sub} go={goStable}
                tasks={tasks} setTasks={setTasks} activeFlow={activeFlow}
                dark={dark} setDark={setDark}
              />
            </div>
          </div>
        </div>
      </SidebarInset>


      {/* mobile drawer */}
      {drawer && (
        <>
          <div className="scrim" onClick={() => setDrawer(false)}></div>
          <div className="drawer">
            <div className="row between" style={{ marginBottom: 18, padding: '0 6px' }}>
              <div className="row" style={{ gap: 10 }}>
                <div className="rail-brand" style={{ margin: 0, width: 38, height: 38 }}><img src={tmkLogo} alt="TMK" /></div>
                <div><div className="h3">TMK Operation</div><div className="cap">ศูนย์ปฏิบัติการ</div></div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setDrawer(false)}><Icon name="x" /></Button>
            </div>
            {/* ซ่อน logs จากคนที่ไม่ใช่แอดมิน เหมือน sidebar — ไม่งั้นเห็นแท็บแล้วกดได้แต่โดนปฏิเสธ */}
            {NAV.filter(n => !(n.id === 'logs' && !isAdmin)).map(n => (
              <div key={n.id} style={{ marginBottom: 2 }}>
                <button className={'panel-item' + (section === n.id ? ' active' : '')} style={isLocked(n.id) ? { opacity: .5 } : undefined} onClick={() => go(n.id)}>
                  <Icon name={n.icon} />{n.label}{isLocked(n.id) && <span style={{ marginLeft: 'auto', display: 'inline-flex' }}><Icon name="lock" className="size-3.5" /></span>}
                </button>
                {section === n.id && n.subs && (
                  <div style={{ paddingLeft: 16 }}>
                    {n.subs.map(s => (
                      <button key={s.id} className={'panel-item' + (sub === s.id ? ' active' : '')} onClick={() => go(n.id, s.id)} style={{ fontSize: 'var(--fs-sm)' }}>
                        <Icon name={s.icon} />{s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="divider" style={{ margin: '12px 0' }}></div>
            <button className="panel-item" style={isLocked('settings') ? { opacity: .5 } : undefined} onClick={() => go('settings', 'general')}><Icon name="system" />ตั้งค่า{isLocked('settings') && <span style={{ marginLeft: 'auto', display: 'inline-flex' }}><Icon name="lock" className="size-3.5" /></span>}</button>
            <button className="panel-item" onClick={() => setDark(d => !d)}><Icon name={dark ? 'sun' : 'moon'} />{dark ? 'โหมดสว่าง' : 'โหมดมืด'}</button>
            <button className="panel-item" style={{ color: 'var(--bad)' }} onClick={logout}><Icon name="external" />ออกจากระบบ</button>
          </div>
        </>
      )}

      {/* mobile bottom tab bar */}
      <nav className="tabbar mobile-only">
        <div className="tabbar-inner">
          {NAV.filter(n => !(n.id === 'logs' && !isAdmin)).map(n => (
            <button key={n.id} className={'tab' + (section === n.id ? ' active' : '')} style={isLocked(n.id) ? { opacity: .45 } : undefined} onClick={() => go(n.id)}>
              <Icon name={isLocked(n.id) ? 'lock' : n.icon} /><span className="tab-label">{n.label}</span>
            </button>
          ))}
        </div>
      </nav>
      {/* ปุ่ม ➕ มือถือ = "สร้างงานใหม่" อย่างเดียว (PART 119)
          เดิมในเมนู Sale มันเปิดฟอร์มของระบบยุคเก่า (กรอกแล้วข้อมูลหาย · แก้ไป PART 116)
          แล้วเปลี่ยนเป็น "พาไปหน้านั้น" ซึ่งกดบนหน้าเดิมแล้วไม่เกิดอะไรเลย = ปุ่มหลอก
          ตอนนี้ทุกหน้าใน Sale มีปุ่มเพิ่มของตัวเองบนมือถืออยู่แล้ว (นับสต็อก · สร้างใบสั่งผลิต · เพิ่มออเดอร์)
          → ซ่อน FAB ในเมนู Sale ไปเลย เหลือเฉพาะที่มันทำงานจริง */}
      {/* ⚠️ ต้องเช็คล็อก "หน้าย่อย" ด้วย (flows:kanban) ไม่ใช่แค่ section
          go() ปฏิเสธแล้วเด้ง toast แต่ setTimeout ยังเปิด modal ต่อ = เขียนงานลงบอร์ดที่เพิ่งโดนห้าม
          และเปิด modal ก็ต่อเมื่อ go() ไปถึงจริง (ไม่ใช่ยิงทิ้งไว้ 100ms แล้วหวังว่าจะสำเร็จ) */}
      {canEdit && section !== 'catalog' && !isLocked('flows') && !isLocked('flows', 'kanban') && (
        <button className="fab mobile-only" title="สร้างงานใหม่" onClick={() => {
          if (!go('flows', 'kanban')) return;
          setTimeout(() => openModal('task'), 100);
        }}><Icon name="plus" /></button>
      )}
    </SidebarProvider>
  );

  // สถานะโหลดข้อมูล: version===0 = ยังไม่เคยโหลดสำเร็จ (ครั้งแรก)
  const firstError = authed && dataVersion === 0 && !!dataError;
  // จอโหลดแรก: arm ตอน login เสร็จ, done เมื่อโหลดข้อมูลครั้งแรกเสร็จ/พลาด, ค้างขั้นต่ำ ~5.5 วิ
  // โชว์จอโหลด "เท่าที่โหลดจริง" — ข้อมูลมาเมื่อไหร่เข้าแอปทันที
  // (เดิม useMinSplash บังคับค้างขั้นต่ำ 5.5 วิ แม้ข้อมูลมาใน <1 วิ)
  const firstLoading = authed && !(dataVersion >= 1 || firstError);
  const showShell = authed && !firstError && !firstLoading;
  const syncing = authed && dataVersion >= 1 && dataLoading; // realtime reload หลังโหลดครั้งแรก

  return (
    <>
      {!authReady && <LoadingScreen />}
      {authReady && !authed && <LoginScreen onLogin={handleLogin} />}
      {firstLoading && !firstError && <LoadingScreen />}
      {firstError && <DataErrorScreen error={dataError} onRetry={dataReload} />}
      {/* eslint-disable-next-line react-hooks/refs -- Shell() เรียกเป็นฟังก์ชัน (inline render) โดยตั้งใจ · เปลี่ยนเป็น <Shell/> จะเป็น component ชนิดใหม่ทุก render = remount ทั้ง sidebar/เนื้อหา · ref ที่ compiler ไล่เจอคือ contentRef ใน go() ซึ่งแตะเฉพาะตอนคลิกเมนู ไม่ได้อ่านตอน render */}
      {showShell && Shell()}
      {syncing && <SyncIndicator />}

      {/* แถบ "มีเวอร์ชันใหม่" — เด้งบนสุดเมื่อ deploy บิลด์ใหม่ (changelog ย้ายไปหน้า Settings > มีอะไรใหม่) */}
      {showShell && <UpdateBanner />}

      {/* กล่องยืนยันแบบ shadcn (window.__confirm) — แทน window.confirm ทั้งแอป */}
      <ConfirmHost />

      {/* กล่องเลือกค่ารายช่องเมื่อ merge ชน (window.__resolveConflict) — Phase 3.5 */}
      <ConflictMergeHost />

      {/* ป้ายสถานะ realtime หลุด (PART 95) */}
      <RealtimeStatus />

      {authed && modal && (
        <Suspense fallback={null}>{
        modal.type === 'record' ? null // ฟอร์มยุคเก่า ลบแล้ว (PART 103)
        : modal.type === 'task' ? <TaskModal data={modal.data} onClose={closeModal}
            onDelete={async (task) => {
              setTasks(ts => ts.filter(x => x.id !== task.id)); // optimistic remove
              closeModal();
              try {
                const { error } = await supabase.from('tmk_tasks').update({ deleted_at: new Date().toISOString() }).eq('id', task.id);
                if (error) throw error;
                logAudit({ action: 'delete', entityType: 'task', entityName: task.title, summary: `ลบงาน "${task.title}"`, flowId: task.flow ?? task.flow_id ?? '' });
                if (dataRefresh) await dataRefresh(['tmk_tasks']); else if (dataReload) await dataReload();
                toast('ย้ายงานไปถังขยะแล้ว', 'success', 6000, {
                  label: 'เลิกทำ',
                  onClick: async () => {
                    try {
                      const { error: e2 } = await supabase.from('tmk_tasks').update({ deleted_at: null }).eq('id', task.id);
                      if (e2) throw e2;
                      if (dataRefresh) await dataRefresh(['tmk_tasks']); else if (dataReload) await dataReload();
                      toast('กู้คืนงานแล้ว', 'success');
                    } catch (e) { toast('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
                  },
                });
              } catch (err) {
                console.error('Task delete failed:', err);
                toast('ลบไม่สำเร็จ: ' + err.message, 'error');
                if (dataRefresh) await dataRefresh(['tmk_tasks']); else if (dataReload) await dataReload(); // คืนงานที่ลบ optimistic กลับจาก DB (กันบอร์ดเพี้ยน)
              }
            }}
            onSubmit={async (task) => {
              // แปลงวันที่ฟอร์ม (ISO จาก <input type=date>) → ISO + ไทย (กัน kanban โชว์ ISO ชั่วคราว)
              const isoDate = parseTaskDate(task.date) || todayISO();
              const optimistic = { ...task, date: thaiDate(isoDate) || task.date, dateISO: isoDate };
              // 1. Optimistic local update — เห็นทันที (รูปแบบเดียวกับที่ mapToTMK ให้)
              setTasks(ts => modal.data?.id ? ts.map(x => x.id === task.id ? optimistic : x) : [optimistic, ...ts]);
              closeModal();

              // 2. แปลง task → DB format + บันทึก Supabase
              try {
                const responsibleStr = Array.isArray(task.responsible) ? task.responsible.join(', ') : String(task.responsible || '');
                const channelStr = Array.isArray(task.channel) ? task.channel.join(', ') : String(task.channel || '');
                const dbTask = {
                  id: task.id,
                  date: isoDate,
                  date_end: task.dateEnd || null,  // วันสิ้นสุด (ช่วง)
                  camp: task.camp || null,
                  title: task.title || '',
                  detail: task.detail || '',
                  responsible: responsibleStr,
                  channel: channelStr,
                  status: task.status || 'todo',
                  priority: task.priority || 'medium',
                  reminder_days: Number(task.reminderDays || 1),
                  flow_id: task.flow_id || null, // โครงการที่งานสังกัด (graceful ถ้าคอลัมน์ยังไม่ migrate)
                  tags: Array.isArray(task.tags) ? task.tags : [], // แท็ก (graceful ถ้าคอลัมน์ tags ยังไม่ migrate)
                  subtasks: Array.isArray(task.subtasks) ? task.subtasks : [], // เช็คลิสต์/งานย่อย (graceful · migration 20260730)
                  sort_order: Number(task.sortOrder || 0), // ลำดับการ์ดในคอลัมน์ (graceful · migration 20260730)
                  brand_ids: Array.isArray(task.brandIds) ? task.brandIds : [], // แบรนด์ของงาน (graceful · migration 20260808)
                };
                /* ⚠️ แก้งานจาก popup เขียนทั้งแถวรวม status โดยไม่ guard row_version
                   → A เปิดงานแก้รายละเอียด 3 นาที · ระหว่างนั้น B ลากงานเดียวกันไป "เสร็จ"
                     A กดบันทึก → status กลับเป็น "กำลังทำ" ไม่มี conflict prompt ไม่มี toast
                   ซึ่งขัดกับนโยบายของ optimisticUpdate.js เองที่ระบุ status เป็น field critical
                   เช็คก่อนเขียน: ถ้าสถานะบนเซิร์ฟเวอร์ต่างจากตอนเปิดฟอร์ม ให้ถามผู้ใช้ */
                if (task.id && task.rowVersion != null) {
                  const cur = await supabase.from('tmk_tasks').select('status,row_version').eq('id', task.id).maybeSingle();
                  if (!cur.error && cur.data && String(cur.data.row_version) !== String(task.rowVersion)
                      && String(cur.data.status || '') !== String(dbTask.status || '')) {
                    const choice = await promptConflictResolution({ entity: 'งาน', changedFields: ['status'] });
                    if (choice !== 'overwrite') { dataRefresh?.(['tmk_tasks']); return; }
                  }
                }
                let { error } = await supabase.from('tmk_tasks').upsert(dbTask);
                // graceful: ถ้าคอลัมน์เสริม (flow_id/tags/date_end/subtasks/sort_order/brand_ids) ยังไม่ migrate → ตัดเฉพาะที่ขาดแล้วลองใหม่
                if (error && /(flow_id|tags|date_end|subtasks|sort_order|brand_ids)/.test(error.message || '')) {
                  const retry = { ...dbTask };
                  if (/flow_id/.test(error.message)) delete retry.flow_id;
                  if (/tags/.test(error.message)) delete retry.tags;
                  if (/date_end/.test(error.message)) delete retry.date_end;
                  if (/subtasks/.test(error.message)) delete retry.subtasks;
                  if (/sort_order/.test(error.message)) delete retry.sort_order;
                  if (/brand_ids/.test(error.message)) delete retry.brand_ids;
                  ({ error } = await supabase.from('tmk_tasks').upsert(retry));
                }
                if (error) throw error;
                // รายละเอียดประวัติ: สร้าง = ค่าที่กรอก / แก้ไข = ก่อน→หลัง
                const _stTH = { todo: 'รอทำ', inprogress: 'กำลังทำ', review: 'รอตรวจ', done: 'เสร็จ' };
                const _campName = (id) => (TMK.campaigns.find(c => c.id === id)?.name) || (id ? '-' : 'ไม่มี');
                const _prioTH = { high: 'สูง', medium: 'กลาง', low: 'ต่ำ' };
                const _sub = (t) => (Array.isArray(t?.subtasks) ? t.subtasks : []);
                const _norm = (t) => ({
                  'หัวข้อ': t?.title || '',
                  'วันที่': t?.dateISO || parseTaskDate(t?.date) || t?.date || '',
                  'วันสิ้นสุด': t?.dateEnd || t?.date_end || '—',
                  'สถานะ': _stTH[t?.status] || t?.status || '',
                  'ความสำคัญ': _prioTH[t?.priority] || t?.priority || '—',
                  'แคมเปญ': _campName(t?.camp),
                  'ช่องทาง': (Array.isArray(t?.channel) ? t.channel : String(t?.channel || '').split(',').map(s => s.trim()).filter(Boolean)).join(', ') || 'ไม่มี',
                  'ผู้รับผิดชอบ': (Array.isArray(t?.responsible) ? t.responsible : String(t?.responsible || '').split(',').map(s => s.trim()).filter(Boolean)).join(', ') || '—',
                  'แท็ก': (Array.isArray(t?.tags) ? t.tags : []).join(', ') || '—',
                  'เช็คลิสต์': _sub(t).length ? `${_sub(t).filter(s => s.done).length}/${_sub(t).length}` : '—',
                });
                const _after = _norm(task);
                let _fields = null, _changes = null;
                if (modal.data?.id) {
                  const _before = _norm(modal.data);
                  _changes = Object.keys(_after).filter(k => _before[k] !== _after[k]).map(k => ({ label: k, from: _before[k] || '—', to: _after[k] || '—' }));
                } else {
                  _fields = Object.entries(_after).map(([k, v]) => ({ label: k, value: v }));
                }
                logAudit({ action: modal.data?.id ? 'update' : 'create', entityType: 'task', entityName: task.title, entityId: task.id,
                  summary: `${modal.data?.id ? 'แก้ไข' : 'สร้าง'}งาน "${task.title}"`, fields: _fields, changes: _changes, flowId: task.flow_id ?? task.flow ?? '' });
                // Reload data so calendar/kanban show latest from Supabase
                if (dataRefresh) await dataRefresh(['tmk_tasks']); else if (dataReload) await dataReload();
                toast(t('toastSaved'), 'success');
              } catch (err) {
                console.error('Task save failed:', err);
                toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
              }
            }} />
        : modal.type === 'campaign' ? <CampaignModal data={modal.data} onClose={closeModal} />
        : modal.type === 'adCampaign' ? <AdCampaignModal data={modal.data} onClose={closeModal} />
        : null
      }</Suspense>
      )}
    </>
  );
}
