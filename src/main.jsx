import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// กันจอ error ตอน deploy ใหม่ระหว่างเปิดแอปค้าง — chunk เดิมหาย (hash เปลี่ยน) → โหลดหน้าใหม่ดึง chunk ล่าสุด
// guard ด้วย sessionStorage กัน reload วนถ้าโหลดไม่ได้จริง (เน็ตหลุด)
/* ⚠️ reload = ล้าง state ในหน่วยความจำทั้งหมด — ของที่เซลล์พิมพ์ค้างในฟอร์ม (ใบเสร็จที่ parse ไว้ /
   ManualSaleSheet / ฟอร์มออเดอร์) หายหมด จึงต้องทำเฉพาะกรณีที่ reload แก้ปัญหาได้จริง
   เคสที่ reload ช่วย = deploy ใหม่แล้ว chunk เก่าหาย (hash เปลี่ยน)
   เคสที่ reload ไม่ช่วยและทำร้ายผู้ใช้ = เน็ตหลุด/กระตุก ซึ่งโยน error ข้อความเดียวกันเป๊ะ
     → เช็ค navigator.onLine ก่อน · ออฟไลน์ = ปล่อยให้ OfflineBar บอกผู้ใช้
       (ซึ่งเขียนไว้เองว่า "ข้อมูลที่พิมพ์ค้างไว้ในฟอร์มยังอยู่ ไม่ต้องปิดหน้า" — ต้องไม่โกหก)
   guard: เดิมล้าง flag ทุกครั้งที่ event `load` ยิง ซึ่งเกิดหลัง reload ทุกรอบ → กันวนไม่ได้เลย
     ตอนนี้ล้างเมื่อ "อยู่รอดมาได้พักหนึ่ง" แทน (30 วิ = ผ่านช่วงโหลด chunk แรก ๆ ไปแล้ว)
   คีย์ต้องตรงกับ lazyRetry.js เพื่อไม่ให้ทั้งสองทางต่างคนต่าง reload */
const CHUNK_RELOAD_KEY = 'tmk-chunkreload:boot';
/* ⚠️ ถ้า sessionStorage ใช้ไม่ได้ (Safari private / ตั้งค่าบล็อก site data) flag จะเขียนไม่ติดทุกครั้ง
   → deploy ใหม่ + chunk 404 = reload ลูปไม่จบ ซึ่งแย่กว่าจอขาว
   จึงต้องมี guard ในหน่วยความจำคู่ไปด้วย (อยู่ได้ตลอดอายุหน้า = พอสำหรับกันลูป) */
let chunkReloadedInMemory = false;
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  if (navigator.onLine === false) return;   // ออฟไลน์ → reload ก็ได้ chunk เดิมไม่มา แถมล้างฟอร์มทิ้ง
  if (chunkReloadedInMemory) return;
  chunkReloadedInMemory = true;
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
  } catch { /* storage ใช้ไม่ได้ → พึ่ง guard ในหน่วยความจำแทน */ }
  window.location.reload();
});
window.addEventListener('load', () => {
  setTimeout(() => { try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* ignore */ } }, 30000);
});

// PART 95: ดัก error แบบ async (promise rejection / error นอก React render) ที่เดิมเงียบหมด
// → log ไว้ (throttle กัน spam) เพื่อให้ debug ได้ · ไม่ reload/รบกวนผู้ใช้ · ErrorBoundary จัดการ render error แยก
let _lastGlobalLog = 0;
const logGlobal = (label, detail) => {
  const now = Date.now();
  if (now - _lastGlobalLog < 1000) return; // throttle: อย่างมาก 1 log/วินาที
  _lastGlobalLog = now;
  console.error(`[global] ${label}:`, detail);
};
window.addEventListener('unhandledrejection', (e) => { logGlobal('unhandled promise rejection', e.reason); });
window.addEventListener('error', (e) => { if (e?.message) logGlobal('uncaught error', e.error || e.message); });

// PWA: ลงทะเบียน service worker (offline shell) — เฉพาะ production build เท่านั้น
// dev ไม่ลง (กัน SW ไปแคช HMR/โมดูลสด แล้ว dev ค้าง) · เช็ค support ก่อน · รอ load event กันแย่ง bandwidth ตอนเปิดแอป
// logic update: ไม่ reload อัตโนมัติ/ไม่เด้ง prompt รบกวน user — SW ใหม่ skipWaiting เองแล้วมีผลรอบเปิดหน้าถัดไป
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('[sw] register failed:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
