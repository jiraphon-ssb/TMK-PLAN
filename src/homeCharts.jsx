/* ============================================================
   homeCharts.jsx — ส่วนที่ "ต้องใช้ recharts" ของหน้าแรก (โหลดแยก · lazy)
   ============================================================
   หน้าแรกคือ first paint ของทั้งแอป — ถ้า import charts.jsx ตรงๆ จะลาก recharts
   (~104 KB gzip) เข้ามาก่อนหน้าจอแรกเสมอ (พังกติกา PART 95)
   → ทุกอย่างที่แตะ charts.jsx ย้ายมาไว้ไฟล์นี้ แล้ว homeView ใช้ React.lazy โหลดทีหลัง
   ============================================================ */
import { GradientSparkline } from './charts.jsx';
import { TargetGauge } from './saleDashboardMerged.jsx';

export function HomeGauge({ mt }) {
  return <TargetGauge mt={mt} title="เป้าเดือนนี้" />;
}

export function HomeSpark({ data }) {
  return <GradientSparkline data={data} height={40} ariaLabel="ยอดรายวันเดือนนี้" />;
}

export default { HomeGauge, HomeSpark };
