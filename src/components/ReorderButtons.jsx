/* ============================================================
   ReorderButtons.jsx — ปุ่มเลื่อนขึ้น/ลง (ทางเลือกแทนการลาก) — PART 105
   ============================================================
   เดิมหน้าตั้งค่า (ช่องทาง/แบรนด์/แคมเปญ) เรียงลำดับได้ด้วย "ลาก" อย่างเดียวบนเดสก์ท็อป
   (ปุ่ม ▲▼ ซ่อนไว้เฉพาะจอเล็ก) → คีย์บอร์ด/เมาส์อย่างเดียวทำไม่ได้ = ผิด WCAG 2.2 dragging-alternative
   ============================================================ */
import { Icon } from '../components.jsx';

export function ReorderButtons({ label, index, total, onMove, disabled }) {
  const btn = 'grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors';
  return (
    <div className="flex flex-col shrink-0" onClick={e => e.stopPropagation()}>
      <button type="button" className={btn} disabled={disabled || index === 0} onClick={() => onMove(-1)}
        title={`เลื่อน "${label}" ขึ้น`} aria-label={`เลื่อน ${label} ขึ้น`}>
        <Icon name="chevD" className="size-3.5" style={{ transform: 'rotate(180deg)' }} />
      </button>
      <button type="button" className={btn} disabled={disabled || index === total - 1} onClick={() => onMove(1)}
        title={`เลื่อน "${label}" ลง`} aria-label={`เลื่อน ${label} ลง`}>
        <Icon name="chevD" className="size-3.5" />
      </button>
    </div>
  );
}
