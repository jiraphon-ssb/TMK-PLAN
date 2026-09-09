/* ============================================================
   saleDashboardChrome.jsx — ชิ้นส่วน UI รอบ ๆ แดชบอร์ดขาย
   แยกมาจาก saleDashboard.jsx (ยกมาทั้งดุ้น ไม่แก้เนื้อใน):
   MultiSelect · DateRangePicker · SectionHead · DashboardSkeleton · ExportBtn
   ============================================================ */
import { Icon, Skel, InfoTip } from './components.jsx';
import { downloadCsv } from './lib/exportCsv.js';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
export { MultiSelect } from './components/MultiSelect.jsx'; // แหล่งเดียวของทั้งแอป (เดิมมีสำเนา 6 ชุด)
// ใช้ DateRangePicker ตัวเดียวกับหน้าออเดอร์/แผนงาน (เดิมสำเนาไว้ที่นี่ และเพี้ยน: ไม่มีข้อความ 'ทุกช่วงเวลา' ตอนยังไม่เลือกช่วง)
export { DateRangePicker } from './saleWidgets.jsx';



/* ============================================================
   KpiCard — การ์ดตัวชี้วัดแบบเดียวกันทั้ง 8 ใบ (รื้อ 22 ส.ค.: 3 ชั้น 3 สไตล์ 10 กล่อง → 2 แถว 8 ใบ)
   หัว+ⓘ · เลขใหญ่ · ชิป ▲▼ เทียบช่วงก่อน (สีตามดี/แย่ · ซ่อนเมื่อไม่มีช่วงก่อน) · บรรทัด 2 = แถบ/กราฟมินิ (children) · บรรทัด 3 = sub
   delta = { txt:'+12%', good:true|false|null } (null = เป็นกลาง เช่น สัดส่วน COD)
   ============================================================ */
export function KpiCard({ label, tip, value, valueColor, delta, children, sub, tone = 'var(--accent)', index }) {
  return (
    <div className="metric-card metric-anim kpi-card" style={{ '--i': index ?? 0, borderLeft: `3px solid ${tone}` }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <div className="eyebrow row" style={{ gap: 4, minWidth: 0 }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>{tip && <InfoTip text={tip} />}</div>
        {delta && (
          <span className="kpi-delta num" style={{ color: delta.good == null ? 'var(--ink-3)' : delta.good ? 'var(--good)' : 'var(--bad)', background: delta.good == null ? 'var(--surface-3)' : delta.good ? 'var(--good-soft)' : 'var(--bad-soft)' }} title={delta.title || 'เทียบช่วงก่อน'}>
            {delta.dir != null && <Icon name={delta.dir >= 0 ? 'up' : 'down'} size={11} />}{delta.txt}
          </span>
        )}
      </div>
      <div className="num kpi-val" style={{ color: valueColor }}>{value}</div>
      <div className="kpi-viz">{children || <div style={{ height: 7 }} />}</div>
      <div className="cap kpi-sub" style={{ color: 'var(--ink-4)' }}>{sub || '\u00a0'}</div>
    </div>
  );
}

// หัวข้อ section — สไตล์เดียวกับหัวข้อการ์ดกราฟ (ชื่อหนา + คำอธิบายจาง)
export function SectionHead({ title, sub, right }) {
  return (
    <div className="row" style={{ alignItems: 'baseline', gap: 8, flexWrap: 'wrap', margin: '4px 0 -2px' }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.1px' }}>{title}</h3>
      {sub && <span className="cap" style={{ color: 'var(--ink-4)' }}>{sub}</span>}
      {right && <span className="ml-auto self-center">{right}</span>}
    </div>
  );
}

/* Skeleton ตรง layout แดชบอร์ดจริง: แถบกรอง + hero (ยอด+กราฟ | การ์ดช่องทาง) + KPI4 sparkline + insight + เจาะลึก + แท็บ + กราฟเทรนด์ */
export function DashboardSkeleton() {
  const bar = (i) => `${28 + ((i * 41) % 64)}%`;
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {/* แถบควบคุม: ช่วงเวลา + ตัวกรอง + hint */}
      <Card style={{ padding: '11px 14px' }}>
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Skel w={186} h={30} r={8} />
          <span className="h-5 w-px bg-[var(--line)]" />
          <Skel w={92} h={30} r={8} />
          <Skel w={150} h={11} />
        </div>
      </Card>

      {/* Hero bento: ยอดขายรวม + area chart (ซ้าย) · การ์ดช่องทาง 4 (ขวา) */}
      <Card className="p-[22px]">
        <div className="hero-bento">
          <div className="hero-total">
            <Skel w={120} h={16} />
            <Skel w={236} h={44} r={10} style={{ margin: '12px 0 2px' }} />
            <div className="hero-chartwrap"><Skel w="100%" h="100%" r={10} style={{ minHeight: 92 }} /></div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}><Skel w="54%" h={10} /></div>
          </div>
          <div className="hero-chgrid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={'ch-card' + (i === 0 ? ' lead' : '')} style={{ cursor: 'default' }}>
                <Skel w={i === 0 ? 40 : 34} h={i === 0 ? 40 : 34} r={10} />
                <div className="ch-meta" style={{ flex: 1 }}>
                  <Skel w="52%" h={10} />
                  <Skel w="74%" h={17} r={7} style={{ marginTop: 8 }} />
                  <Skel w="46%" h={9} style={{ marginTop: 8 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ตัวชี้วัดหลัก: 4 KPI มี sparkline */}
      <Skel w={110} h={13} style={{ marginTop: 2 }} />
      <div className="kpi4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="metric-card">
            <Skel w="42%" h={9} />
            <Skel w="58%" h={24} r={8} style={{ margin: '10px 0' }} />
            <Skel w="100%" h={26} r={6} />
            <Skel w="72%" h={9} style={{ marginTop: 9 }} />
          </div>
        ))}
      </div>

      {/* insight strip: 4 pills */}
      <div className="insight-strip">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="insight-pill"><Skel w={18} h={18} r={6} /><div style={{ flex: 1 }}><Skel w="68%" h={12} /><Skel w="48%" h={9} style={{ marginTop: 6 }} /></div></div>
        ))}
      </div>

      {/* เจาะลึก: 4 metric */}
      <Skel w={80} h={13} style={{ marginTop: 2 }} />
      <div className="metric-grid">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="metric-card"><Skel w="56%" h={10} /><Skel w="70%" h={22} r={7} style={{ marginTop: 10 }} /><Skel w="48%" h={9} style={{ marginTop: 8 }} /></div>)}
      </div>

      {/* แท็บ 7 อัน */}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>{Array.from({ length: 7 }).map((_, i) => <Skel key={i} w={i % 2 ? 78 : 58} h={30} r={8} />)}</div>

      {/* กราฟเทรนด์ + toolbar */}
      <Card className="p-[22px]" style={{ minHeight: 270 }}>
        <div className="row between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 10 }}><Skel w={200} h={14} /><Skel w={230} h={28} r={8} /></div>
        <div className="row" style={{ alignItems: 'flex-end', gap: 7, height: 200 }}>
          {Array.from({ length: 24 }).map((_, i) => <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', height: '100%' }}><Skel w="100%" h={bar(i)} r={4} /></div>)}
        </div>
      </Card>
    </div>
  );
}

// ปุ่มส่งออก CSV (ดาวน์โหลดไฟล์ฝั่งเบราว์เซอร์ — ไม่เขียนกลับ Sheet/DB)
export function ExportBtn({ filename, rows, columns }) {
  return (
    <Button variant="outline" size="sm" className="h-8 gap-1.5 font-normal" disabled={!rows || !rows.length}
      onClick={() => downloadCsv(filename, rows, columns)} title="ส่งออกตามตัวกรองปัจจุบัน">
      <Icon name="external" /> CSV
    </Button>
  );
}
