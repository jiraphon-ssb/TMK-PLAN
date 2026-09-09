/* ============================================================
   saleDashboardModals.jsx — popup ของรายงานขาย
   แยกมาจาก saleDashboard.jsx (ยกมาทั้งดุ้น ไม่แก้เนื้อใน): DrillModal · DashDayDetail
   ============================================================ */
import { useMemo } from 'react';
import { N } from './components.jsx';
import { SideSheet } from './modals-core.jsx';
import { MetricCard, HBars } from './charts.jsx';
import { compute } from './lib/saleAgg.js';
import { baht } from './lib/saleDashboardHelpers.js';
import { DayDetailSheet } from './dayDetailSheet.jsx';
import { CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';


// ---------- drill-down modal ----------
export function DrillModal({ drill, orders, skus, eff, onClose }) {
  const { dim, value } = drill;
  const f2 = { ...eff, [dim]: [value] };
  const f2Key = JSON.stringify(f2); // key ตามค่าจริงของ filter (f2 เป็น object ใหม่ทุก render)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ตั้งใจ memo ตาม f2Key (ค่าจริง) ไม่ใช่ตัว object f2 ที่สร้างใหม่ทุก render
  const A = useMemo(() => compute(orders, skus, f2), [orders, skus, f2Key]);
  const k = A.kpi;
  return <SideSheet size="lg" icon="grid" title={`${dim === 'channel' ? 'ช่องทาง' : dim === 'design' ? 'ลาย' : dim}: ${value}`} sub={`${baht(k.sales)} · ${N(k.orders)} ออเดอร์ · ${N(k.qty)} ตัว`} onClose={onClose} footer={<Button variant="outline" onClick={onClose}>ปิด</Button>}>
    <div className="metric-grid" style={{ marginBottom: 14 }}>
      <MetricCard label="ยอดขาย" value={baht(k.sales)} tone="var(--accent)" />
      <MetricCard label="ออเดอร์" value={N(k.orders)} />
      <MetricCard label="ตัว" value={N(k.qty)} />
      <MetricCard label="AOV" value={baht(k.aov)} />
    </div>
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <div><CardTitle className="m-0 text-base font-semibold mb-[10px]">ลายเด่น</CardTitle><HBars data={A.byDesign.slice(0, 8).map(d => ({ label: d.key, value: d.qty }))} height={180} unit="ตัว" /></div>
      <div><CardTitle className="m-0 text-base font-semibold mb-[10px]">สี & ไซซ์</CardTitle>
        <div className="cap" style={{ color: 'var(--ink-3)', marginBottom: 4 }}>สี</div><HBars data={A.byColor.slice(0, 6).map(c => ({ label: c.key, value: c.qty }))} height={120} unit="ตัว" />
      </div>
    </div>
  </SideSheet>;
}

// CustomerDrawer ย้ายไปเป็นของกลางใน customerDrawer.jsx (PART 88) — ประวัติซื้อเป็นแถวย่อกดขยาย
// popup วัน (คลิกแถวตารางโอน/COD หรือคลิกแท่งกราฟรายวัน)
// PART 117: เนื้อในย้ายไป dayDetailSheet.jsx (ตัวกลางตัวเดียว ใช้ร่วมกับ popup "ออเดอร์ทั้งวัน" ของหน้าประสิทธิภาพเซล)
// เดิมสองที่นี้เป็นคนละคอมโพเนนต์ ฟีเจอร์ไม่เท่ากัน (ที่นี่มีกรองโอน/COD+เรียง แต่ไม่มีตารางช่องทาง/เสียงลูกค้า)
export function DashDayDetail({ dateISO, ords, skus, funnelRows, onPickCustomer, onChangeDate }) {
  return <DayDetailSheet dateISO={dateISO} orders={ords} skus={skus} funnelRows={funnelRows} onPickCustomer={onPickCustomer} onChangeDate={onChangeDate} />;
}
