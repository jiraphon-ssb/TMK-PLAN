/* ============================================================
   flowCard.jsx — การ์ดโครงการในหน้ารวม (แยกจาก views-flows.jsx)
   - FlowCard ยกมาทั้งดุ้น ไม่แก้เนื้อใน · รับ flow/tasks/onOpen/onSettings เป็น props เหมือนเดิม
   ============================================================ */
import { TMK } from './data.js';
import { Icon, Avatar, FlowIcon } from './components.jsx';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { doneSetOf, flowBrands } from './flowsShared.js';

/* ---- การ์ดโครงการ ---- */
export function FlowCard({ flow, tasks, onOpen, onSettings, today = '' }) {
  // รื้อ 23 ส.ค.: เดิมปก 16:7 กินครึ่งการ์ด ทำให้เห็นได้ 3-6 โครงการ/จอ และตัวเลขงานอยู่ล่างสุด
  // ตอนนี้: แถบสี/ปกบาง + ชื่อ + ตัวเลขที่ใช้ตัดสินใจ (ค้าง · เลยกำหนด) + แถบคืบหน้า
  const doneSet = doneSetOf(flow);
  const total = tasks.length;
  const done = tasks.filter(t => doneSet.has(t.status)).length;
  const openN = total - done;
  const overdue = today ? tasks.filter(t => !doneSet.has(t.status) && (t.dateEnd || t.dateISO || '') && (t.dateEnd || t.dateISO) < today).length : 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const brands = flowBrands(flow);
  const members = (flow.members || []).slice(0, 4);
  const color = flow.color || '#64748b';
  return (
    <Card className="flex flex-col overflow-hidden hover:shadow-md transition-shadow pt-0 gap-0">
      {/* ปกบาง — รูปถ้ามี ไม่งั้นแถบสีโครงการ (สูงคงที่ 44px) */}
      <button type="button" onClick={onOpen} title={flow.name} className="relative block h-11 w-full overflow-hidden text-left">
        {flow.coverUrl
          ? <img src={flow.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
          : <span className="absolute inset-0" style={{ background: `linear-gradient(100deg, ${color} 0%, ${color}b3 100%)` }} />}
        {flow.coverUrl && <span className="absolute inset-0 bg-black/25" />}
      </button>
      <CardContent className="p-3.5 flex-1 flex flex-col gap-2.5">
        {/* ชื่อ + ไอคอน + ป้าย */}
        <button type="button" onClick={onOpen} className="flex items-start gap-2 text-left min-w-0">
          <FlowIcon icon={flow.icon} className="size-5 shrink-0 mt-px" style={{ color }} />
          <span className="min-w-0">
            <span className="block font-bold text-[14.5px] leading-snug line-clamp-2">{flow.name}</span>
            <span className="mt-0.5 flex items-center gap-1.5 flex-wrap">
              {brands.map(b => <Badge key={b.id} variant="outline" className="gap-1 text-[10.5px] py-0"><span className="size-1.5 rounded-full" style={{ background: b.color }} />{b.name}</Badge>)}
              {flow.visibility === 'private' && <Badge variant="secondary" className="gap-1 text-[10.5px] py-0"><Icon name="shield" className="size-3" /> ส่วนตัว</Badge>}
              {flow.shareEnabled && <Badge variant="secondary" className="gap-1 text-[10.5px] py-0"><Icon name="layers" className="size-3" /> แชร์อยู่</Badge>}
              {flow.isGeneral && <Badge variant="secondary" className="text-[10.5px] py-0">ทั่วไป</Badge>}
            </span>
          </span>
        </button>

        {/* ตัวเลขที่ใช้ตัดสินใจ — ค้าง/เลยกำหนด เห็นก่อน แล้วค่อยคืบหน้า */}
        <div className="flex items-center gap-2 flex-wrap text-[12px]">
          {total === 0 ? <span className="text-muted-foreground">ยังไม่มีงาน</span> : (<>
            <span className="font-semibold tabular-nums">{openN} <span className="font-normal text-muted-foreground">ค้าง</span></span>
            {overdue > 0 && <span className="rounded-full px-1.5 py-px font-semibold" style={{ color: 'var(--bad)', background: 'color-mix(in srgb, var(--bad) 12%, transparent)' }}>เลยกำหนด {overdue}</span>}
            <span className="ml-auto tabular-nums text-muted-foreground">{done}/{total} · {pct}%</span>
          </>)}
        </div>
        {total > 0 && <Progress value={pct} className="h-1.5" indicatorColor={overdue > 0 ? 'var(--warn)' : undefined} />}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2.5 border-t border-border/50">
          <div className="flex items-center -space-x-1.5">
            {members.length === 0 ? <span className="text-[11px] text-muted-foreground/60">ไม่มีสมาชิก</span>
              : members.map(m => { const s = (TMK.staff || []).find(x => x.name === m) || { color: '#888' }; return <Avatar key={m} name={m} color={s.color} size={22} />; })}
            {(flow.members || []).length > 4 && <span className="text-[11px] text-muted-foreground ml-2">+{flow.members.length - 4}</span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={onSettings} title="ตั้งค่าโครงการ"><Icon name="system" className="size-3.5" /></Button>
            <Button variant="outline" size="sm" className="h-7" onClick={onOpen}>เปิด <Icon name="chevR" className="size-3.5 ml-0.5" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
