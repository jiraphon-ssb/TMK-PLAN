/* ============================================================
   saleFields.js — ค่าคงที่กลางของฟอร์มขาย (PART 81)
   ============================================================
   เดิมประกาศซ้ำ 3 ไฟล์ (views-sale-submit / ManualSaleSheet / views-orders
   DRAWER_CHANNELS·DRAWER_PAYMENTS) → เสี่ยง drift · รวมที่เดียว ทุกฟอร์ม import จากนี่
   ============================================================ */

// ช่องทางขาย — ตรงชื่อที่ funnel/%ปิด join ด้วย string (อย่าแก้ชื่อโดยไม่ดู funnelPlatforms)
// นิยามอยู่ที่ _shared (SALE_CHANNELS) แหล่งเดียวร่วมกับ edge → re-export ต่อ กัน drift
export { SALE_CHANNELS as CHANNELS } from '../../supabase/functions/_shared/saleFormulas.js';
// ช่องมาร์เก็ตเพลส/หน้าร้าน — ไม่มี "คนทัก" (ลูกค้าสั่งเองในแพลตฟอร์ม) → ไม่นับเข้าตัวตั้ง %ปิดการขาย
// ที่เหลือ (FB/LINE/IG/TikTok/โทร/Direct) = ช่องแชท ที่มีการทักก่อนปิดการขาย
// สูตร canonical ร่วมกับ edge (daily-sale-report) → re-export จาก _shared แหล่งเดียว กัน drift (P2-4)
export { MARKETPLACE_CHANNELS, isLeadChannel, isChatOrder } from '../../supabase/functions/_shared/saleFormulas.js';

// ประเภทงาน — ปลีก/DFT ตัดสินจากคำ "DFT" ในหมายเหตุ (isDftNote) · OEM = เลือกตรง
export const JOB_TYPES = ['ปลีก', 'OEM', 'DFT'];

// ค่ามาตรฐาน payment_type ในตาราง orders (payShipnity/paymentKind normalize เข้าชุดนี้)
export const PAYMENT_TYPES = ['โอน', 'COD', 'มาร์เก็ตเพลส', 'ไม่ระบุ'];
// ตัวเลือกการชำระฝั่งใบเสร็จ/คีย์มือ — ไม่มี "มาร์เก็ตเพลส" (ค่านั้นมาจาก import Shopee/Lazada เท่านั้น)
export const RECEIPT_PAYMENTS = ['โอน', 'COD', 'ไม่ระบุ'];

export const CUSTOMER_TYPES = ['ลูกค้าใหม่', 'ลูกค้าเก่า'];
