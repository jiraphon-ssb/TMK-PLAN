/* ============================================================
   TMK Operation — What's New (หน้าเต็มในเมนูโปรไฟล์)
   ============================================================
   - ไม่มีปุ่มลอย (FAB) แล้ว — changelog เป็น "หน้า" เข้าจากเมนูโปรไฟล์ใน sidebar
   - UpdateBanner (แถบ poll เวอร์ชันใหม่) ยังคงไว้
   - จุดแดง "ยังไม่อ่าน" sync ข้าม component ด้วย CustomEvent (useUnseenVersion)
   ============================================================ */
import { useState, useEffect } from 'react';
import { APP_VERSION } from './appVersion.js';   // ห้าม import changelog.js ที่นี่ — ไฟล์นี้อยู่ใน entry chunk
import { Icon } from './components.jsx';

/* ---------- แถบ "มีเวอร์ชันใหม่" (แบบ A — นุ่ม) ----------
   เช็ค version.json บนเซิร์ฟเวอร์ทุก ~3 นาที + ตอนกลับมาที่แท็บ
   ถ้าเวอร์ชันที่ deploy ≠ เวอร์ชันที่รันอยู่ → เด้งแถบบนสุด กดอัปเดตเอง (ไม่บังคับ reload)
   กดปิด = ปิดเลย "ต่อเวอร์ชันนั้น" (จำใน localStorage) — ไม่เด้งซ้ำกวนใจ · เด้งใหม่เฉพาะมี deploy เวอร์ชันใหม่กว่า */
const UPD_DISMISS_KEY = 'tmk-update-dismissed';
export function UpdateBanner() {
  const [newVer, setNewVer] = useState(null);
  const [dismissedVer, setDismissedVer] = useState(() => { try { return localStorage.getItem(UPD_DISMISS_KEY) || ''; } catch { return ''; } });
  useEffect(() => {
    let alive = true;
    const base = import.meta.env.BASE_URL || '/';
    const check = async () => {
      try {
        const res = await fetch(`${base}version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive || !data || !data.version) return;
        if (data.version !== APP_VERSION) {
          setNewVer(data.version); // เด้งเฉพาะเมื่อยังไม่เคยกดปิดเวอร์ชันนี้ (เช็คตอน render)
        } else {
          setNewVer(null); // เซิร์ฟเวอร์ตรงกับที่รันแล้ว → เคลียร์แถบ (กันค้างกรณี rollback)
        }
      } catch { /* ออฟไลน์/หาไฟล์ไม่เจอ → เงียบ */ }
    };
    check();
    const id = setInterval(() => { if (document.visibilityState === 'visible') check(); }, 180000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  if (!newVer || newVer === dismissedVer) return null;
  const dismiss = () => { setDismissedVer(newVer); try { localStorage.setItem(UPD_DISMISS_KEY, newVer); } catch { /* ignore */ } };
  return (
    <div className="update-banner" role="alert">
      <span className="update-banner-ico">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="22 4 22 10 16 10" />
          <path d="M19.5 15a8.5 8.5 0 1 1-2-9L22 10" />
        </svg>
      </span>
      <div className="update-banner-txt">
        <div className="update-banner-title">มีเวอร์ชันใหม่ <span className="update-banner-ver">v{newVer}</span></div>
        <div className="update-banner-sub">อัปเดตเพื่อรับฟีเจอร์ล่าสุด + แก้บั๊ก</div>
      </div>
      <button className="update-banner-cta" onClick={() => window.location.reload()}>อัปเดต</button>
      <button className="update-banner-x" onClick={dismiss} aria-label="ภายหลัง"><Icon name="x" /></button>
    </div>
  );
}

const SEEN_KEY = 'tmk-seen-version';
const SEEN_EVT = 'tmk-version-seen';
const getSeen = () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } };

// ทำเครื่องหมาย "อ่านแล้ว" + แจ้งทุก component (จุดแดงหายพร้อมกัน)
export function markVersionSeen() {
  try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(SEEN_EVT)); } catch { /* ignore */ }
}

// hook: มีเวอร์ชันใหม่ที่ยังไม่อ่านหรือยัง (sync ข้าม component ด้วย CustomEvent + storage)
export function useUnseenVersion() {
  const [unseen, setUnseen] = useState(() => getSeen() !== APP_VERSION);
  useEffect(() => {
    const refresh = () => setUnseen(getSeen() !== APP_VERSION);
    window.addEventListener(SEEN_EVT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(SEEN_EVT, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  return unseen;
}

// หน้าเต็ม "มีอะไรใหม่" (section whatsnew · ทุกคนเข้าได้) — timeline release-notes + mark seen ตอนเปิด
// PART 101: รื้อ UI ใหม่ — เส้น timeline + จุดไล่รุ่น · รุ่นล่าสุดขอบ accent · แถวฟีเจอร์เป็น icon chip · คอลัมน์อ่านกลางหน้า
/* ---- แยกหัวข้อ/รายละเอียดจากข้อความ changelog (รูปแบบที่ใช้จริง: "หัวข้อ: รายละเอียด · รายละเอียด") ---- */