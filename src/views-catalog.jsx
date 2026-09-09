/* ============================================================
   views-catalog.jsx — ตัวสลับหน้าย่อยของเมนู Sale (PART 116)
   ============================================================
   เดิมไฟล์นี้ import ทั้ง 5 หน้าตรง ๆ → rolldown รวมเป็นก้อนเดียว 476KB
   เข้าหน้ารายงานขายก็ต้องโหลด CRM + ออเดอร์ + สินค้า + สต็อก มาด้วยทั้งหมด
   → แยกเป็น lazy รายหน้า: โหลดเฉพาะหน้าที่กดเข้าจริง (หน้าอื่นโหลดตอนกดสลับ)
   Suspense อยู่ที่ App.jsx อยู่แล้ว (fallback = PageSkeleton) ไม่ต้องซ้อนอีกชั้น
   ============================================================ */
import { lazyRetry } from './lib/lazyRetry.js';

const SaleDashboard    = lazyRetry(() => import('./saleDashboard.jsx').then(m => ({ default: m.SaleDashboard })), 'saleDashboard');
const CrmView          = lazyRetry(() => import('./saleCrm.jsx').then(m => ({ default: m.CrmView })), 'saleCrm');
const ShirtCatalogView = lazyRetry(() => import('./saleCatalog.jsx').then(m => ({ default: m.ShirtCatalogView })), 'saleCatalog');
const OrdersHub        = lazyRetry(() => import('./views-orders.jsx').then(m => ({ default: m.OrdersHub })), 'views-orders');
const StockView        = lazyRetry(() => import('./views-stock.jsx').then(m => ({ default: m.StockView })), 'views-stock');

export function CatalogView({ sub }) {
  if (sub === 'orders') return <OrdersHub />;
  if (sub === 'shirts') return <ShirtCatalogView />;
  if (sub === 'crm') return <CrmView />;
  if (sub === 'stock') return <StockView />;
  // เน้น sale — sub เก่า (entry/data/submit/io) redirect ไปประสิทธิภาพเซล (route ที่ App.jsx · PART 102)
  return <SaleDashboard />;
}
