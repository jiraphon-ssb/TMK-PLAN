/* ============================================================
   OfflineBar — แถบเตือน "เน็ตหลุด" (PART 116)
   ============================================================
   ปัญหาเดิม: เน็ตหลุดแล้วหน้าเว็บดูปกติทุกอย่าง — กดบันทึกถึงจะรู้ว่าไม่ผ่าน
   (ตัวชี้ ออนไลน์/ออฟไลน์ มีแค่ในหน้าหลัก และไม่อัปเดตตามจริงเพราะอ่านครั้งเดียวตอน render)
   ตอนนี้: แถบค้างใต้หัวทุกหน้า + พอเน็ตกลับมาแจ้งและดึงข้อมูลใหม่ให้เอง
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components.jsx';
import { toast, refresh } from '../lib/appBus.js';

export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

export function OfflineBar() {
  const online = useOnline();
  const wasOffline = useRef(false);   // ref ไม่ใช่ state — กัน re-render ซ้ำจากการ setState ใน effect

  useEffect(() => {
    if (!online) { wasOffline.current = true; return; }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    toast('กลับมาออนไลน์แล้ว — กำลังดึงข้อมูลล่าสุด', 'success');
    try { refresh(); } catch { /* provider ยังไม่พร้อม = ข้าม */ }
  }, [online]);

  if (online) return null;
  return (
    <div role="status" aria-live="polite"
      className="row" style={{
        gap: 8, alignItems: 'center', padding: '8px 16px',
        background: 'var(--warn-soft, color-mix(in srgb, var(--warn) 14%, transparent))',
        borderBottom: '1px solid var(--line)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600,
      }}>
      <Icon name="alertTriangle" style={{ color: 'var(--warn)' }} />
      เน็ตหลุด — ตอนนี้ยังบันทึกไม่ได้ ข้อมูลที่พิมพ์ค้างไว้ในฟอร์มยังอยู่ ไม่ต้องปิดหน้า
      <span className="cap" style={{ color: 'var(--ink-4)', marginLeft: 'auto' }}>ระบบจะดึงข้อมูลใหม่ให้เองเมื่อเน็ตกลับมา</span>
    </div>
  );
}
