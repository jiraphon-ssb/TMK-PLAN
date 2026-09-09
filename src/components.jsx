/* ============================================================
   TMK Operation — Shared components, icons, formatters, charts
   ============================================================ */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { TMK } from './data.js';
import { toast } from './lib/appBus.js';
import { fmtBaht } from './lib/money.js';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ClipboardList, Rocket, Target, ShoppingCart, Package, Palette, Megaphone, Lightbulb, Flame, Star,
  Shirt, Box, CalendarDays, Clock, Users, User, Heart, Zap, Briefcase, Folder,
  FileText, Image as LImage, Camera, Video, Music, Mic, PenTool, Brush, Scissors, Truck,
  Store, ShoppingBag, Tag, Tags, Gift, CreditCard, DollarSign, TrendingUp, BarChart3, PieChart,
  Activity, Globe, MapPin, Mail, MessageCircle, MessageSquare, Phone, Send, Bell, Bookmark,
  Flag, Award, Trophy, Crown, Gem, Sparkles, Sun as LSun, Moon as LMoon, Cloud, Leaf,
  Coffee, Smile, ThumbsUp, Eye, Search as LSearch, Settings, Wrench, Hammer, Layers, LayoutGrid,
  List as LList, Kanban, CheckCircle2, Hash, Link as LLink, Lock, Key, Shield, Code, Terminal,
  Database, Server, Smartphone, Monitor, Printer, Headphones, Plane, Car, Home as LHome, Building2,
  Factory, Warehouse, Map as LMap, Compass, Book, GraduationCap, Pencil, Archive, Inbox, Calendar as LCalendar,
  Bug, Wand2, Beaker, Boxes, Sticker, Crosshair, Goal, Handshake, Wallet, Receipt,
} from 'lucide-react';

/* ---------- Image upload helper ---------- */
// อ่านรูป + ย่อขนาด (canvas) → data URL เล็ก ป้องกันรูปใหญ่ทำให้บันทึกพัง/ช้า/เกิน quota
export function readImageCompressed(file, maxSize = 256, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type || '')) return reject(new Error('ไม่ใช่ไฟล์รูป'));
    if (file.size > 15 * 1024 * 1024) return reject(new Error('ไฟล์ใหญ่เกิน 15MB')); // กันอ่านไฟล์ยักษ์เข้าหน่วยความจำ
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width >= height && width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
        else if (height > width && height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch { reject(new Error('ย่อรูปไม่สำเร็จ')); } // ไม่ fallback เป็นไฟล์เต็ม (กันเก็บ data-URL ยักษ์)
      };
      img.onerror = () => { // HEIC ของ iPhone เบราว์เซอร์มักเปิดไม่ได้ — แยกข้อความให้ผู้ใช้แก้เองได้
        const heic = /hei[cf]/i.test(file.type || '') || /\.hei[cf]$/i.test(file.name || '');
        reject(new Error(heic
          ? 'รูปนี้เป็นไฟล์ HEIC ของ iPhone ที่เบราว์เซอร์เปิดไม่ได้ — ลองถ่ายใหม่ หรือตั้งกล้อง iPhone เป็น "Most Compatible" (ตั้งค่า > กล้อง > รูปแบบ)'
          : 'รูปเสียหรือเปิดไม่ได้ — ลองรูปอื่น'));
      };
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- Formatters ---------- */
// formatters — คืน "—" เมื่อค่าไม่ใช่ตัวเลขจริง (กัน NaN/Infinity จากการหารด้วย 0)
const _fin = n => typeof n === 'number' && isFinite(n);
// เงิน — โชว์ค่าจริงเต็ม + สตางค์ 2 ตำแหน่งเสมอ (ไม่ย่อ k/M, ไม่ปัดเต็มบาท) เช่น ฿115,690.79 · ฿44,260.00
// เงินบาท — decimal-aware (โชว์ทศนิยมเฉพาะเมื่อมีเศษสตางค์) · ตัวกลางเดียวใน lib/money.js
export const B  = fmtBaht;
export const Bk = B; // เลิกย่อ k/M — ใช้รูปแบบเต็มเหมือน B (ค่าจริงทุกที่)
export const P  = (n, d=1) => _fin(n) ? n.toFixed(d) + '%' : '—';
export const N  = n => _fin(n) ? Math.round(n).toLocaleString('en-US') : '—'; // จำนวนนับ (ออเดอร์/ตัว) = จำนวนเต็ม
// คอมแพกต์ k/M — ใช้เฉพาะ "ป้ายบนกราฟ" (กันล้นแท่งแคบ) ค่าเต็มดูได้ตอน hover
export const Bc = n => { if (!_fin(n)) return '—'; const a = Math.abs(n), s = n < 0 ? '-' : ''; return a >= 1e6 ? '฿' + s + (a / 1e6).toFixed(1) + 'M' : a >= 1000 ? '฿' + s + Math.round(a / 1000) + 'k' : '฿' + Math.round(a); };

/* ---------- InfoTip — ปุ่ม ⓘ กด/ชี้แล้วเด้งคำอธิบาย (ใช้ได้ทั้งเมาส์และแตะมือถือ) ---------- */
export function InfoTip({ text, label, align = 'left' }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <button type="button" title={text} aria-label={label ? `คำอธิบาย: ${label}` : 'คำอธิบาย'} aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(o => !o); }}
        style={{ border: 'none', background: 'none', padding: 0, marginLeft: 4, cursor: 'pointer', color: open ? 'var(--accent)' : 'var(--ink-4)', fontSize: '0.95em', lineHeight: 1, display: 'inline-flex' }}>ⓘ</button>
      {open && (
        <>
          <span onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 200 }}></span>
          <span role="tooltip" onClick={(e) => e.stopPropagation()}
            style={{ position: 'absolute', zIndex: 201, top: 'calc(100% + 6px)', [align === 'right' ? 'right' : 'left']: 0, width: 230, maxWidth: '72vw', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', padding: '9px 11px', borderRadius: 'var(--r-sm)', fontSize: 'var(--fs-cap)', fontWeight: 400, lineHeight: 1.55, textAlign: 'left', whiteSpace: 'normal', boxShadow: 'var(--sh-pop, 0 8px 28px rgba(0,0,0,.18))' }}>{text}</span>
        </>
      )}
    </span>
  );
}

/* ป้าย "แหล่งข้อมูล" ต่อหน้า (KPI-1) — บอกว่า KPI ในหน้านั้นมาจากแหล่งไหนตาม metric contract (docs/implementation/04)
   kind='truth' = operational/การเงินจริง (computeMonth · net · เดือนปฏิทิน) · kind='analytics' = ออเดอร์นำเข้า (saleAgg · ตัดยกเลิก · order_date)
   align ส่งต่อให้ InfoTip (กันหลุดขอบขวา) */
export function SourceBadge({ kind = 'truth', align = 'left', className = '' }) {
  const m = kind === 'truth'
    ? { label: 'ยอดจริง (การเงิน)', cls: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
        tip: 'แหล่งข้อมูล: ยอดขายที่ทีมกรอกรายวัน/รายเดือน (operational) = ตัวเลขการเงินจริง · เป็นยอด net (หลังหักคืน/ยกเลิก) · นับตามเดือนปฏิทิน' }
    : { label: 'วิเคราะห์จากออเดอร์', cls: 'text-sky-600 dark:text-sky-400 border-sky-500/30 bg-sky-500/10',
        /* ⚠️ ต้องบอกด้วยว่ารวม "ยอด/จำนวนออเดอร์มาร์เก็ตเพลสที่กรอกมือ"
           เดิมเขียนว่ามาจากออเดอร์ล้วน ซึ่งไม่จริงสำหรับแถว Shopee/TikTok ในวันที่ยังไม่มีไฟล์นำเข้า
           (KPI ออเดอร์ 282 = ออเดอร์จริง 137 + ที่กรอกมือ 145 — คนอ่านว่าเลขผิด) */
        tip: 'แหล่งข้อมูล: ออเดอร์ที่นำเข้า (tmk_mp_orders · ตัดที่ยกเลิก) นับตามวันที่ออเดอร์ในช่วงที่เลือก + ยอดและจำนวนออเดอร์มาร์เก็ตเพลสที่กรอกมือของวันที่ยังไม่มีไฟล์นำเข้า — ใช้วิเคราะห์เชิงปฏิบัติการ ไม่ใช่ยอดการเงินทางการ' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${m.cls} ${className}`}>
      แหล่ง: {m.label}<InfoTip text={m.tip} label={m.label} align={align} />
    </span>
  );
}

/* Lot/variant helpers (ระบบสินค้า-ล็อต ยุคเก่า) ลบถาวร PART 118 — ไม่มีหน้าไหนใช้แล้วตั้งแต่ถอด section คลัง */

/* ---------- Order status pipeline (ออเดอร์ + ติดตามสถานะ) ---------- */
// ลำดับสถานะ: สร้าง → พิมพ์ → นับเช็ค → แพ็ค → รอขนส่ง → ส่งแล้ว (+ ยกเลิก แยก)
export const ORDER_STATUSES = [
  { id: 'pending',  label: 'รอยืนยัน', color: 'var(--ink-3)' },
  { id: 'printing', label: 'รอพิมพ์',  color: 'var(--accent)' },
  { id: 'checking', label: 'นับเช็ค',  color: 'var(--info)' },
  { id: 'packing',  label: 'แพ็ค',     color: 'var(--accent-2)' },
  { id: 'shipping', label: 'รอขนส่ง',  color: 'var(--warn)' },
  { id: 'shipped',  label: 'ส่งแล้ว',  color: 'var(--good)' },
];
const ORDER_CANCELLED = { id: 'cancelled', label: 'ยกเลิก', color: 'var(--bad)' };
export const orderStatusMeta = (id) => ORDER_STATUSES.find(s => s.id === id) || (id === 'cancelled' ? ORDER_CANCELLED : ORDER_STATUSES[0]);
export const orderStatusIndex = (id) => { const i = ORDER_STATUSES.findIndex(s => s.id === id); return i < 0 ? 0 : i; };

/* ---------- Code128 barcode (สำหรับป้ายสินค้า) ---------- */
// ตาราง pattern มาตรฐาน Code128 (107 ค่า: 0–105 + STOP), แต่ละค่า = ความกว้างแท่ง/ช่อง 6 หลัก (STOP=7)
/* ---------- Icons (lucide-style, 24 grid, currentColor stroke) ---------- */
export const ICONS = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5',
  sales: 'M3 3v18h18M7 14l3-4 3 3 5-7',
  planner: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18M8 3v4M16 3v4',
  catalog: 'M3.5 8 12 3l8.5 5v8L12 21l-8.5-5zM3.5 8 12 13l8.5-5M12 13v8',
  system: 'M12 3 4 6v5c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6zM9.5 12l1.8 1.8 3.4-3.6',
  search: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-4.3-4.3',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  archive: 'M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8M2 4h20v4H2zM10 12h4',
  tag: 'M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.41l8.7 8.71a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42zM7.5 7.5h.01',
  checkCheck: 'M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16',
  plus: 'M12 5v14M5 12h14',
  image: 'M4 4 L20 4 L20 20 L4 20 ZM4 16 L9 11 L13 15 L16 12 L20 16M9 9 m-1.3 0 a1.3 1.3 0 1 0 2.6 0 a1.3 1.3 0 1 0 -2.6 0',
  sun: 'M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8',
  chevR: 'M9 6l6 6-6 6',
  chevL: 'M15 6l-6 6 6 6',
  chevD: 'M6 9l6 6 6-6',
  star: 'M12 2.6l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.9l-5.6 2.97 1.07-6.27L2.9 9.2l6.3-.9z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  x: 'M6 6l12 12M18 6 6 18',
  target: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  up: 'M7 17 17 7M9 7h8v8',
  down: 'M7 7l10 10M17 9v8H9',
  wallet: 'M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 7h17M16 12h5v4h-5a2 2 0 0 1 0-4',
  bag: 'M6 8h12l1 12H5zM9 8V6a3 3 0 0 1 6 0v2',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.8M16 4.2a4 4 0 0 1 0 7.6',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  userPlus: 'M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19 8v6M22 11h-6',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1M10 6l9-3v18l-9-3M19 9a3 3 0 0 1 0 6',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  store: 'M4 9h16M5 9l1-4h12l1 4M5 9v10h14V9M9 19v-5h6v5',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18',
  listChecks: 'M11 6h10M11 12h10M11 18h10M3 6l1.5 1.5L7 4M3 17l1.5 1.5L7 15',
  chat: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  smile: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  reply: 'M9 17l-6-5 6-5M3 12h10a6 6 0 0 1 6 6v2',
  route: 'M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 13V9a3 3 0 0 1 3-3h6M18 11v4a3 3 0 0 1-3 3H9',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  clock: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
  shield: 'M12 3 4 6v5c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6',
  dot: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM13 13h7v7h-7zM4 13h7v7H4z',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  pencil: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  filter: 'M3 5h18l-7 8v6l-4-2v-4z',
  calendarDays: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01',
  flame: 'M12 3s5 4 5 9a5 5 0 0 1-10 0c0-1.5.7-2.8 1.5-3.5C8.5 10 9 11 10 11c0-2.5 2-3 2-8',
  arrowR: 'M5 12h14M13 6l6 6-6 6',
  external: 'M14 4h6v6M20 4l-9 9M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 4v4h-4',
  loader: 'M12 3a9 9 0 1 0 9 9',   // วงแหวนโหลด (หมุนด้วย class animate-spin)
  check: 'M5 12l5 5L20 6',
  circle: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 4v3M21 5h-3',
  help: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
  lightbulb: 'M9 18h6M10 21h4M8.5 14a5 5 0 1 1 7 0c-.7.7-1.5 1.3-1.5 2.5h-4c0-1.2-.8-1.8-1.5-2.5',
  alertTriangle: 'M12 3 2 20h20zM12 9v5M12 17h.01',
  upload: 'M12 15V4M8 8l4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
};

export function Icon({ name, className, style }) {   // style: ใช้หมุน chevron (ไม่มี chevU ในชุด) — เดิม prop นี้ถูกทิ้ง = หมุนไม่ติด
  const d = ICONS[name] || ICONS.dot;
  return (
    <svg className={`ico ${className || ''}`} style={style} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}

/* ---------- ColorPicker: เลือกสีอิสระ (presets + สีล่าสุด + เลือกอิสระ native + กรอก hex + คัดลอก) ---------- */
const DEFAULT_SWATCHES = ['#6b5ce0', '#4a8be0', '#18a0ab', '#06c755', '#2f9e6e', '#c08a3e', '#ee6a3a', '#ec4899', '#cf4d5c', '#0a5aa0', '#64748b', '#000000'];
const RECENT_COLORS_KEY = 'tmk-recent-colors';
const loadRecentColors = () => { try { return (JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) || '[]') || []).filter(x => /^#[0-9a-fA-F]{6}$/.test(x)).slice(0, 8); } catch { return []; } };
export function ColorPicker({ value, onChange, presets = DEFAULT_SWATCHES, size = 'md' }) {
  const v = value || '#6b5ce0';
  const sw = size === 'sm' ? 'size-6' : 'size-7';
  const [hex, setHex] = useState(v);
  const [recent, setRecent] = useState(loadRecentColors);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync ช่อง hex ตาม prop value ที่เปลี่ยนจากภายนอก (รื้อเป็น derived state เสี่ยงกว่าประโยชน์)
  useEffect(() => { setHex(v); }, [v]);
  const recordRecent = (c) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(c)) return;
    setRecent(prev => { const next = [c.toLowerCase(), ...prev.filter(x => x.toLowerCase() !== c.toLowerCase())].slice(0, 8); try { localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(next)); } catch { /* ignore */ } return next; });
  };
  const pick = (c) => { onChange(c); recordRecent(c); };
  const commitHex = (raw) => {
    let s = String(raw || '').trim();
    if (s && s[0] !== '#') s = '#' + s;
    setHex(s);
    if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(s)) { onChange(s); if (s.length === 7) recordRecent(s); }
  };
  const copyHex = async () => { try { await navigator.clipboard.writeText(v); toast('คัดลอกโค้ดสีแล้ว', 'success'); } catch { /* ignore */ } };
  const isOn = (c) => (v || '').toLowerCase() === c.toLowerCase();
  const recentShown = recent.filter(c => !presets.some(p => p.toLowerCase() === c.toLowerCase()));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(c => (
          <button key={c} type="button" title={c} aria-label={`สี ${c}`}
            className={`${sw} rounded-full flex items-center justify-center transition-all ${isOn(c) ? 'ring-2 ring-offset-2 ring-ring' : 'hover:scale-110'}`}
            onClick={() => pick(c)} style={{ background: c }}>
            {isOn(c) && <Icon name="check" className="size-3.5 text-white" />}
          </button>
        ))}
        {/* เลือกอิสระ (native color input ซ่อนอยู่หลังวงสีรุ้ง) */}
        <label className={`${sw} rounded-full cursor-pointer relative overflow-hidden ring-1 ring-border flex items-center justify-center`} title="เลือกสีอิสระ"
          style={{ background: 'conic-gradient(from 0deg, #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)' }}>
          <Icon name="plus" className="size-3.5 text-white drop-shadow" />
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#6b5ce0'} onChange={e => pick(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
      </div>
      {recentShown.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground mr-0.5">ล่าสุด</span>
          {recentShown.map(c => (
            <button key={c} type="button" title={c} aria-label={`สีล่าสุด ${c}`} onClick={() => pick(c)}
              className={`size-5 rounded-full ring-1 ring-border transition-transform hover:scale-110 ${isOn(c) ? 'ring-2 ring-ring' : ''}`} style={{ background: c }} />
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="size-7 rounded-md border shrink-0" style={{ background: v }} />
        <input value={hex} onChange={e => commitHex(e.target.value)} placeholder="#6b5ce0" spellCheck={false}
          className="h-8 w-28 rounded-md border bg-background px-2 text-sm font-mono uppercase focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        <button type="button" onClick={copyHex} title="คัดลอกโค้ดสี" aria-label="คัดลอกโค้ดสี"
          className="h-8 px-2 rounded-md border bg-background text-muted-foreground hover:text-foreground hover:bg-muted flex items-center"><Icon name="external" className="size-3.5" /></button>
      </div>
    </div>
  );
}

/* ---------- ไอคอนโครงการ (lucide) — เลือกได้เยอะ + รองรับอีโมจิเก่า (back-compat) ---------- */
const FLOW_ICON_MAP = {
  ClipboardList, Rocket, Target, ShoppingCart, Package, Palette, Megaphone, Lightbulb, Flame, Star,
  Shirt, Box, CalendarDays, Clock, Users, User, Heart, Zap, Briefcase, Folder,
  FileText, Image: LImage, Camera, Video, Music, Mic, PenTool, Brush, Scissors, Truck,
  Store, ShoppingBag, Tag, Tags, Gift, CreditCard, DollarSign, TrendingUp, BarChart3, PieChart,
  Activity, Globe, MapPin, Mail, MessageCircle, MessageSquare, Phone, Send, Bell, Bookmark,
  Flag, Award, Trophy, Crown, Gem, Sparkles, Sun: LSun, Moon: LMoon, Cloud, Leaf,
  Coffee, Smile, ThumbsUp, Eye, Search: LSearch, Settings, Wrench, Hammer, Layers, LayoutGrid,
  List: LList, Kanban, CheckCircle2, Hash, Link: LLink, Lock, Key, Shield, Code, Terminal,
  Database, Server, Smartphone, Monitor, Printer, Headphones, Plane, Car, Home: LHome, Building2,
  Factory, Warehouse, Map: LMap, Compass, Book, GraduationCap, Pencil, Archive, Inbox, Calendar: LCalendar,
  Bug, Wand2, Beaker, Boxes, Sticker, Crosshair, Goal, Handshake, Wallet, Receipt,
};
const FLOW_ICON_NAMES = Object.keys(FLOW_ICON_MAP);
// แสดงไอคอนโครงการ: ชื่อ lucide → component · อีโมจิเก่า → text · ว่าง → default
export function FlowIcon({ icon, className = 'size-5', style }) {
  const C = FLOW_ICON_MAP[icon];
  if (C) return <C className={className} style={style} />;
  if (icon) return <span className={className} style={{ ...style, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontSize: '1em' }}>{icon}</span>;
  return <ClipboardList className={className} style={style} />;
}
// ตัวเลือกไอคอน — ค้นหาได้ + grid (lucide ~110 แบบ)
export function IconPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const names = FLOW_ICON_NAMES.filter(n => !q || n.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-col gap-2">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาไอคอน… (พิมพ์อังกฤษ เช่น rocket, cart)" spellCheck={false}
        className="h-8 w-full rounded-md border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
      <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 max-h-48 overflow-y-auto rounded-md border p-2">
        {names.map(n => { const C = FLOW_ICON_MAP[n]; return (
          <button key={n} type="button" title={n} onClick={() => onChange(n)}
            className={`size-9 rounded-md flex items-center justify-center transition-all ${value === n ? 'bg-primary text-primary-foreground ring-2 ring-ring' : 'hover:bg-muted text-foreground'}`}>
            <C className="size-5" />
          </button>
        ); })}
        {names.length === 0 && <span className="col-span-full text-xs text-muted-foreground text-center py-3">ไม่พบไอคอน</span>}
      </div>
    </div>
  );
}

/* ---------- หัวการ์ด: ไอคอนชิปมุมมน + ชื่อ + คำอธิบาย (ใช้ซ้ำทั้งแอป) ---------- */
export function CardHead({ icon, title, sub, right, className = '' }) {
  return (
    <div className={`row between ${className}`} style={{ alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div className="row" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
        {icon && <span className="grid size-9 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex-none"><Icon name={icon} /></span>}
        <div style={{ minWidth: 0 }}>
          <div className="text-base font-semibold" style={{ lineHeight: 1.25 }}>{title}</div>
          {sub && <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

/* ---------- Status helpers ---------- */
export function paceStatus(p) {
  if (p >= 95) return { c: 'var(--good)', cls: 'chip-good', label: 'ทันเป้า' };
  if (p >= 80) return { c: 'var(--warn)', cls: 'chip-warn', label: 'ตามเป้าช้า' };
  return { c: 'var(--bad)', cls: 'chip-bad', label: 'หลุดเป้า' };
}

/* ---------- Threshold colors (เกณฑ์เดียวกันทุกหน้า — เลิกฝัง ternary inline) ---------- */
// ROAS: ≥3 ดี / ≥2 เฝ้าระวัง / น้อยกว่า แย่
export const roasColor = r => r == null ? 'var(--ink-3)' : r >= 3 ? 'var(--good)' : r >= 2 ? 'var(--warn)' : 'var(--bad)';
// ACOS: ≤เพดาน ดี / ≤40% เฝ้าระวัง / เกิน แย่ (เพดาน default 25%)
export const acosColor = (a, ceil = 25) => a == null ? 'var(--ink-3)' : a <= ceil ? 'var(--good)' : a <= 40 ? 'var(--warn)' : 'var(--bad)';
// %เป้า: ใช้เกณฑ์เดียวกับ paceStatus เพื่อให้สีในตาราง/วงแหวน/การ์ดตรงกัน
export const targetColor = p => p == null ? 'var(--ink-3)' : p >= 95 ? 'var(--good)' : p >= 80 ? 'var(--warn)' : 'var(--bad)';

/* ---------- useCountUp ---------- */
export function useCountUp(target, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start;
    const step = t => {
      if (!start) start = t;
      const p = Math.min((t - start) / ms, 1);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/* ---------- Avatar ---------- */
export function Avatar({ name, color, size = 28 }) {
  const safe = String(name || '?');
  const initials = safe.length <= 2 ? safe.toUpperCase() : safe.slice(0, 2).toUpperCase();
  return <span className="avatar" style={{ background: color || 'var(--ink-3)', width: size, height: size, fontSize: size * 0.42 }}>{initials}</span>;
}

/* ---------- PersonAvatar — avatar คน (อักษรย่อ + สีประจำตัว) · สีดึงจาก staff/roles · ใช้ทั้งแอปให้สม่ำเสมอ ---------- */
const _AV_PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6'];
const _hashColor = (s) => { let h = 0; const str = String(s || ''); for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return _AV_PALETTE[h % _AV_PALETTE.length]; };
// ชื่อ → สีประจำตัว: staff.color → roles.color → hash คงที่ (คนนอกระบบก็มีสีเดิมเสมอ)
function personColor(name) {
  const n = String(name || '').trim();
  if (!n) return 'var(--ink-3)';
  const s = (TMK.staff || []).find(x => x.name === n) || (TMK.roles || []).find(x => x.name === n);
  return (s && s.color) || _hashColor(n);
}
// color = override (เช่น สีตามแพลตฟอร์มของลูกค้า) · ไม่ส่ง = สีประจำตัวจาก staff/roles (คน)
export function PersonAvatar({ name, size = 28, className, color }) {
  const safe = String(name || '?');
  const initials = safe.length <= 2 ? safe.toUpperCase() : safe.slice(0, 2).toUpperCase();
  return <span className={'avatar' + (className ? ' ' + className : '')} style={{ background: color || personColor(name), width: size, height: size, fontSize: size * 0.42 }}>{initials}</span>;
}

/* ---------- User icon (แทนรูปโปรไฟล์) ---------- */
export function UserIcon({ size = 34, radius }) {
  const s = Math.round(size * 0.56);
  return (
    <span style={{ width: size, height: size, borderRadius: radius ?? (size >= 56 ? 18 : '50%'), background: 'var(--surface-3)', color: 'var(--ink-3)', display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}>
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />
      </svg>
    </span>
  );
}

/* ---------- ProgressRing ---------- */
export function Ring({ pct, size = 76, stroke = 8, color = 'var(--accent)', track = 'var(--surface-3)', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const safePct = (typeof pct === 'number' && isFinite(pct)) ? pct : 0; // กัน NaN
  const off = c - (Math.min(safePct, 100) / 100) * c;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s var(--ease)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

/* ---------- Bars (vertical) ---------- */
export function Bars({ data, h = 150, color = 'var(--accent)', labelKey = 'm', valueKey = 'rev', fmt = Bk }) {
  // กัน NaN/Infinity: ถ้าข้อมูลว่างหรือทุกค่าเป็น 0 → max = 1 (บาร์สูง 0 ไม่พัง)
  const _rawMax = data.length ? Math.max(...data.map(d => (Number(d[valueKey]) || 0) + (Number(d.proj) || 0))) : 0;
  const max = _rawMax > 0 ? _rawMax : 1;
  const safeH = (v) => { const x = ((Number(v) || 0) / max) * (h - 28); return isFinite(x) && x > 0 ? x : 0; };
  const [hi, setHi] = useState(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 6, height: h, fontFamily: 'var(--font)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', color: 'var(--ink-4)', fontSize: 9, paddingTop: 8, paddingBottom: 22, lineHeight: 1, whiteSpace: 'nowrap' }}>
        {[max, max / 2, 0].map((v, i) => <span key={i}>{Bc(v)}</span>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: h, paddingTop: 8 }}>
      {data.map((d, i) => {
        const main = safeH(d[valueKey]);
        const proj = safeH(d.proj);
        const aVal = Number(d[valueKey]) || 0, pVal = Number(d.proj) || 0;
        return (
          <div key={i}
               onPointerEnter={() => setHi(i)} onPointerDown={() => setHi(i)}
               onPointerLeave={() => setHi(null)}
               style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end', cursor: 'default', touchAction: 'manipulation' }}>
            {hi === i && (
              <div style={{ position: 'absolute', bottom: 'calc(100% - 14px)', left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', color: 'var(--paper)', padding: '7px 11px', borderRadius: 8, fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10, textAlign: 'left', lineHeight: 1.45, boxShadow: '0 6px 20px rgba(0,0,0,.25)' }}>
                <div style={{ opacity: 0.75, fontWeight: 600, fontSize: 11 }}>{d[labelKey]}</div>
                <div style={{ fontWeight: 700 }}>ทำได้ : {fmt(aVal)}</div>
                {pVal > 0 && <div style={{ opacity: 0.55, fontWeight: 600 }}>คาดการณ์ : {fmt(pVal)}</div>}
              </div>
            )}
            <div style={{ width: '100%', maxWidth: 46, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: h - 28 }}>
              {proj > 0 && <div style={{ height: proj, background: color, opacity: 0.28, borderRadius: '6px 6px 0 0' }} />}
              <div style={{ height: main, background: color, borderRadius: proj > 0 ? 0 : '6px 6px 0 0' }} />
            </div>
            <div className="cap" style={{ color: 'var(--ink-3)' }}>{d[labelKey]}</div>
          </div>
        );
      })}
      </div>
    </div>
  );
}


/* (เดิมมี PageLoading แบบวงกลมหมุน — เลิกใช้แล้ว เปลี่ยนเป็น Skeleton ทุกหน้า) */


/* ---- ถอด useMinSplash ออกแล้ว — เดิมบังคับให้เห็นจอโหลดขั้นต่ำ 5.5 วิ แม้ข้อมูลจะมาใน <1 วิ
   ตอนนี้ App.jsx โชว์จอโหลด "เท่าที่โหลดจริง" ---- */

/* ---- คุมจังหวะ skeleton: โผล่หลัง active ค้างเกิน delayMs (กันกระพริบตอน cache มาไว)
   + เมื่อโผล่แล้วอยู่อย่างน้อย minMs (กัน skeleton วาบหายเร็วเกินจนตาไม่ทัน) ---- */
export function useDelayedFlag(active, delayMs = 120, minMs = 300) {
  const [on, setOn] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (active && !on) { // กำลังโหลด & ยังไม่โชว์ → ตั้งเวลาโผล่หลัง delay
      const t = setTimeout(() => { shownAt.current = Date.now(); setOn(true); }, delayMs);
      return () => clearTimeout(t);
    }
    if (!active && on) { // ข้อมูลมาแล้ว & กำลังโชว์ → อยู่ต่อจนครบ minMs
      const left = minMs - (Date.now() - shownAt.current);
      if (left <= 0) { setOn(false); return; }
      const t = setTimeout(() => setOn(false), left);
      return () => clearTimeout(t);
    }
  }, [active, on, delayMs, minMs]);
  return on;
}

/* ---- ถอด useBeat/useBeatOn ออกแล้ว — เดิมโชว์ skeleton "หลอก" 320-350ms ทุกครั้งที่เข้าหน้า/สลับหน้าย่อย
   ทั้งที่ข้อมูลอยู่ใน TMK singleton แล้ว = ไม่มีการโหลดจริง → รู้สึกว่า "เหมือนรีโหลดใหม่ทุกครั้ง"
   มาตรฐานเดียวของแอป = useDelayedFlag: โชว์ skeleton เฉพาะตอนโหลดจริงเกิน 120ms ---- */

/* ---- การ์ดกริดจำลอง (overview โครงการ / รายการการ์ด) ---- */
export function CardGridSkeleton({ cards = 6, header = true }) {
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {header && <div className="row between" style={{ marginBottom: 2 }}><Skel w={180} h={20} /><Skel w={120} h={34} r={10} /></div>}
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="card" style={{ padding: 0, overflow: 'hidden', opacity: Math.max(0.4, 1 - i * 0.06) }}>
            <Skel w="100%" h={80} r={0} />
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <Skel w="62%" h={15} />
              <Skel w="40%" h={11} />
              <Skel w="100%" h={8} r={4} style={{ marginTop: 4 }} />
              <div className="row" style={{ gap: 6, marginTop: 4 }}>{Array.from({ length: 3 }).map((_, j) => <Skel key={j} w={22} h={22} r={11} />)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- ฉลองทะลุเป้ายอดขาย (อลังการสุด · ยอดวิ่งนับ · ไม่พึ่ง dep · CSS confetti + portal) ---- */
const CONFETTI_COLORS = ['#f5a623', '#ffd86b', '#4f46e5', '#16a34a', '#ec4899', '#06b6d4', '#ef4444', '#8b5cf6'];
const CELEBRATE_HEADLINES = ['🎉 ทะลุเป้าแล้ว!', '🔥 ทุบเป้ากระจุย!', '🏆 ปังไม่ไหวแล้ว!', '🚀 พุ่งทะลุเป้า!', '🥳 โหดมากกก!'];
/* สุ่มครั้งเดียวตอน mount ผ่าน useState lazy init (เดิมสุ่มในเนื้อ render) */
const pickHeadline = () => CELEBRATE_HEADLINES[Math.floor(Math.random() * CELEBRATE_HEADLINES.length)];
const makeConfetti = () => Array.from({ length: 130 }, (_, i) => ({
  left: Math.random() * 100,
  dur: 2.6 + Math.random() * 2.6,
  delay: (i % 2 ? 0 : 1.2) + Math.random() * 0.9,
  size: 7 + Math.random() * 10,
}));
export function CelebrationOverlay({ amount = 0, target = 0, onClose }) {
  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shown = useCountUp(amount, 1700); // ยอดวิ่งนับช้าๆ ให้เห็นพุ่งเข้าหาเป้า
  const [headline] = useState(pickHeadline);
  const [confetti] = useState(makeConfetti); // ตำแหน่ง/จังหวะเศษกระดาษ คงที่ตลอดอายุ overlay
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => onClose && onClose(), 200); // เล่น fade-out ก่อน unmount
  }, [onClose]);
  useEffect(() => {
    const t = setTimeout(close, 8000);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [close]);
  if (typeof document === 'undefined') return null;
  const over = Math.max(0, amount - target);
  const fillPct = target > 0 ? Math.min((shown / target) * 100, 100) : 100;
  const livePct = target > 0 ? (shown / target) * 100 : 100;
  const crossed = target > 0 && shown >= target;
  const pieces = reduce ? [] : confetti;
  return createPortal(
    <div className={'celebrate-overlay' + (closing ? ' celebrate-out' : '')} role="dialog" aria-modal="true" aria-label="ฉลองทะลุเป้ายอดขาย" onClick={close}>
      <div className="celebrate-confetti" aria-hidden="true">
        {pieces.map((p, i) => (
          <span key={i} style={{ left: p.left + '%', width: p.size, height: p.size * 0.6, background: CONFETTI_COLORS[i % CONFETTI_COLORS.length], animationDuration: p.dur + 's', animationDelay: p.delay + 's', borderRadius: i % 3 === 0 ? '50%' : '2px' }} />
        ))}
      </div>
      <div className={'celebrate-card' + (crossed ? ' celebrate-card-crossed' : '')} onClick={e => e.stopPropagation()}>
        <div className="celebrate-glow" aria-hidden="true" />
        <div className="celebrate-ribbon celebrate-ribbon-l" aria-hidden="true" />
        <div className="celebrate-ribbon celebrate-ribbon-r" aria-hidden="true" />
        <div className="celebrate-trophy"><Trophy size={50} strokeWidth={1.6} /></div>
        <div className="celebrate-spark celebrate-spark-l" aria-hidden="true"><Sparkles size={22} /></div>
        <div className="celebrate-spark celebrate-spark-r" aria-hidden="true"><Sparkles size={16} /></div>
        <div className="celebrate-title">{headline}</div>
        <div className={'celebrate-amount' + (crossed ? ' celebrate-amount-hot' : '')}>{B(shown)}</div>
        {/* แถบยอดวิ่งเข้าหาเป้า + จุดเป้า + ข้ามเป้าแฟลช */}
        {target > 0 && (
          <div className="celebrate-track" aria-hidden="true">
            <div className="celebrate-fill" style={{ width: fillPct + '%' }} />
            <div className="celebrate-target-mark" title="เป้า" />
          </div>
        )}
        <div className="celebrate-sub">{crossed ? `ทะลุเป้า ${B(over)} (+${P(target > 0 ? (over / target) * 100 : 0, 0)})` : `กำลังพุ่งเข้าเป้า… ${P(livePct, 0)}`}</div>
        <button className="celebrate-close" onClick={close} autoFocus>เยี่ยมไปเลย! 🙌</button>
      </div>
    </div>,
    document.body
  );
}

/* ---- Skeleton primitives: บล็อก shimmer + ตารางจำลอง (ใช้ตอนดึงข้อมูลจริง) ---- */
export function Skel({ w = '100%', h = 14, r = 8, style }) {
  // shadcn <Skeleton> (shimmer .skel) — ขนาด/รัศมีส่งผ่าน inline style (ทับ rounded-md ของ base)
  return <Skeleton style={{ width: w, height: h, borderRadius: r, ...style }} />;
}
// ตารางจำลอง: หัวตาราง + แถว (จางลงเรื่อยๆ ให้รู้สึกว่ามีของอยู่)
export function SkelTable({ cols = 6, rows = 8 }) {
  const widths = ['46%', '70%', '60%', '80%', '54%', '66%', '50%', '74%'];
  return (
    <div style={{ display: 'grid', gap: 11 }}>
      <div className="row" style={{ gap: 14 }}>{Array.from({ length: cols }).map((_, i) => <div key={i} style={{ flex: 1 }}><Skel w={widths[i % widths.length]} h={11} /></div>)}</div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="row" style={{ gap: 14, opacity: Math.max(0.32, 1 - r * 0.075) }}>
          {Array.from({ length: cols }).map((_, i) => <div key={i} style={{ flex: 1 }}><Skel w={i === 0 ? '85%' : widths[(i + r) % widths.length]} h={13} /></div>)}
        </div>
      ))}
    </div>
  );
}

/* ---- Skeleton กลาง (ใช้ตอนยังไม่รู้ layout: lazy-chunk Suspense / หน้ารอง) — การ์ด KPI + ตาราง ---- */
export function PageSkeleton() {
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card" style={{ flex: '1 1 180px' }}><Skel w="55%" h={10} /><Skel w="72%" h={24} style={{ marginTop: 10 }} /></div>)}
      </div>
      <div className="card" style={{ minHeight: 240 }}><Skel w={160} h={13} style={{ marginBottom: 18 }} /><SkelTable cols={6} rows={6} /></div>
    </div>
  );
}
