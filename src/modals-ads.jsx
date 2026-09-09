import { useState } from 'react';
import { B, Icon, ColorPicker } from './components.jsx';
import { DatePicker } from '@/components/ui/date-picker';
import { parseTaskDate, thaiDate } from './lib/dateUtils.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Toggle } from '@/components/ui/toggle';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Modal, toast, nn, guardClose, uid, saveRow, MD } from './modals-core.jsx';

export function CampaignModal({ data, onClose }) {
  const palette = ['#0a5aa0', '#ee6a3a', '#6b5ce0', '#2f9e6e', '#c08a3e', '#4a8be0'];
  const [f, setF] = useState(() => data
    ? { ...data, start: data.startISO || parseTaskDate(data.start) || '', end: data.endISO || parseTaskDate(data.end) || '' } // ISO สำหรับ <input type=date>
    : { name: '', color: palette[0], start: '', end: '', channels: [], status: 'upcoming' });
  const [touched, setTouched] = useState(false);
  const set = (k, v) => { setTouched(true); setF(p => ({ ...p, [k]: v })); };
  const toggleCh = id => { setTouched(true); setF(p => ({ ...p, channels: p.channels.includes(id) ? p.channels.filter(x => x !== id) : [...p.channels, id] })); };
  const statuses = [['upcoming', 'กำลังจะมา'], ['live', 'กำลังดำเนินการ'], ['done', 'จบแล้ว']];
  const [busy, setBusy] = useState(false);
  const handleSave = async () => {
    if (busy || !f.name.trim()) return;
    if (f.start && f.end && f.end < f.start) { toast('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', 'error'); return; }
    setBusy(true);
    const row = {
      id: data?.id || uid('c'),
      name: f.name.trim(),
      color: f.color,
      bg: f.color + '22',
      border: f.color + '55',
      start_date: f.start || null,   // ISO จาก <input type=date>
      end_date: f.end || null,
      status: f.status,
      channels: f.channels || [],
    };
    const _cstTH = { live: 'กำลังดำเนินการ', upcoming: 'กำลังจะมา', done: 'จบแล้ว' };
    const ok = await saveRow('tmk_campaigns', row, 'บันทึกแคมเปญ', {
      action: data ? 'update' : 'create', entityType: 'campaign', entityName: row.name,
      summary: `${data ? 'แก้ไข' : 'สร้าง'}แคมเปญ "${row.name}"`,
      fields: [
        { label: 'สถานะ', value: _cstTH[f.status] || f.status },
        { label: 'ช่วงเวลา', value: (f.start || f.end) ? `${thaiDate(f.start) || '?'} - ${thaiDate(f.end) || '?'}` : '—' },
        { label: 'ช่องทาง', value: (f.channels || []).join(', ') || '—' },
      ],
    });
    setBusy(false);
    if (ok) onClose();
  };
  const footer = (<><Button variant="outline" onClick={() => guardClose(touched, onClose)}>ยกเลิก</Button><Button disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกแคมเปญ'}</Button></>);
  return (
    <Modal icon="megaphone" title={data ? 'แก้ไขแคมเปญ' : 'สร้างแคมเปญ'} sub="ตั้งชื่อ ช่วงเวลา และช่องทาง" onClose={onClose} footer={footer} confirmOnClose={touched}>
      <div className="field"><label>ชื่อแคมเปญ</label><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="เช่น Payday Push" /></div>
      <div className="field-row">
        <div className="field"><label>เริ่ม</label><DatePicker value={f.start} onChange={(v) => set('start', v)} /></div>
        <div className="field"><label>สิ้นสุด</label><DatePicker value={f.end} onChange={(v) => set('end', v)} /></div>
      </div>
      <div className="field"><label>สีประจำแคมเปญ</label>
        <ColorPicker value={f.color} onChange={(c) => set('color', c)} presets={palette} />
      </div>
      <div className="field"><label>ช่องทาง (ติ๊กเลือก)</label>
        <div className="chips-pick">
          {MD.channels.map(ch => (
            <Toggle key={ch.id} variant="pill" size="sm" pressed={f.channels.includes(ch.id)} onPressedChange={() => toggleCh(ch.id)}>
              {ch.logoUrl ? (
                <img src={ch.logoUrl} alt="" style={{ width: 16, height: 16, borderRadius: 3, objectFit: 'contain', marginRight: 4 }} />
              ) : (
                <span className="dot-c" style={{ background: ch.hex }}></span>
              )}
              {ch.name}
            </Toggle>
          ))}
        </div>
      </div>
      <div className="field"><label>สถานะ</label>
        <Tabs value={f.status} onValueChange={v => set('status', v)}>
          <TabsList>
            {statuses.map(s => <TabsTrigger key={s[0]} value={s[0]}>{s[1]}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>
    </Modal>
  );
}

/* ============================================================
   Order system (ออเดอร์ + ลูกค้า + ติดตามสถานะ)
   ============================================================ */
// โค้ดออเดอร์: ORD-YYMMDD-XXXX

/* MonthlyTargetModal ลบแล้ว (PART 103) — เป้าย้ายไปตั้งค่า→เป้า/คอม · กลุ่มลูกค้าตัดถาวร */

/* ---------- Ad Campaign modal ---------- */
export function AdCampaignModal({ data, onClose }) {
  const _statusTH = { upcoming: 'รอเริ่ม', live: 'กำลังรัน', paused: 'หยุดชั่วคราว', done: 'เสร็จสิ้น', cancelled: 'ยกเลิก' };
  const [f, setF] = useState(() => data
    ? { ...data, status: _statusTH[data.status] || 'กำลังรัน' } // map internal→ไทย ให้ชิปตรง; status แปลก → default
    : { name: '', platform: 'Facebook', budget: '', startDate: '', endDate: '', goal: 'Conversion', status: 'รอเริ่ม' });
  const [touched, setTouched] = useState(false);
  const set = (k, v) => { setTouched(true); setF(p => ({ ...p, [k]: v })); };
  const platforms = ['Facebook', 'TikTok', 'Shopee', 'Lazada'];
  const goals = ['Awareness', 'Conversion', 'Retargeting'];
  const statuses = ['รอเริ่ม', 'กำลังรัน', 'หยุดชั่วคราว', 'เสร็จสิ้น', 'ยกเลิก'];
  const statusMap = { 'รอเริ่ม': 'upcoming', 'กำลังรัน': 'live', 'หยุดชั่วคราว': 'paused', 'เสร็จสิ้น': 'done', 'ยกเลิก': 'cancelled' };
  const [busy, setBusy] = useState(false);
  const handleSave = async () => {
    if (busy || !f.name.trim()) return;
    if (f.startDate && f.endDate && f.endDate < f.startDate) { toast('วันจบต้องไม่ก่อนวันเริ่ม', 'error'); return; }
    setBusy(true);
    const row = {
      id: data?.id || uid('ac'),
      name: f.name.trim(),
      platform: f.platform,
      budget: nn(f.budget),
      spent: Number(data?.spent) || 0,
      revenue: Number(data?.revenue) || 0,
      roas: Number(data?.roas) || 0,
      acos: Number(data?.acos) || 0,
      status: statusMap[f.status] || 'live',
      start_date: f.startDate || null,
      end_date: f.endDate || null,
      goal: f.goal,
    };
    const ok = await saveRow('tmk_ad_campaigns', row, 'บันทึกแคมเปญแอด', {
      action: data ? 'update' : 'create', entityType: 'ad', entityName: row.name,
      summary: `${data ? 'แก้ไข' : 'สร้าง'}แคมเปญแอด "${row.name}"`,
      fields: [
        { label: 'แพลตฟอร์ม', value: f.platform || '—' },
        { label: 'งบ', value: B(Number(f.budget) || 0) },
        { label: 'เป้าหมาย', value: f.goal || '—' },
        { label: 'ช่วงเวลา', value: (f.startDate || f.endDate) ? `${f.startDate || '?'} - ${f.endDate || '?'}` : '—' },
      ],
    });
    setBusy(false);
    if (ok) onClose();
  };

  const footer = (
    <>
      <Button variant="outline" onClick={() => guardClose(touched, onClose)}>ยกเลิก</Button>
      <Button disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
    </>
  );
  return (
    <Modal icon="zap" title={data ? 'แก้ไขแคมเปญแอด' : 'สร้างแคมเปญแอด'} sub="ตั้งค่าแคมเปญโฆษณา" onClose={onClose} footer={footer} confirmOnClose={touched}>
      <div className="field">
        <label>ชื่อแคมเปญ</label>
        <Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="เช่น Polo Signature — Awareness" />
      </div>

      <div className="field">
        <label>แพลตฟอร์ม</label>
        <ToggleGroup type="single" variant="pill" size="sm" className="chips-pick" value={f.platform} onValueChange={v => v && set('platform', v)}>
          {platforms.map(p => (
            <ToggleGroupItem key={p} value={p}>{p}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="field-row-3">
        <div className="field">
          <label>งบประมาณ (฿)</label>
          <Input type="number" min="0" inputMode="decimal" value={f.budget} onChange={e => set('budget', e.target.value)} placeholder="0" />
        </div>
        <div className="field">
          <label>วันเริ่ม</label>
          <DatePicker value={f.startDate} onChange={(v) => set('startDate', v)} />
        </div>
        <div className="field">
          <label>วันจบ</label>
          <DatePicker value={f.endDate} onChange={(v) => set('endDate', v)} />
        </div>
      </div>

      <div className="field">
        <label>เป้าหมาย</label>
        <ToggleGroup type="single" variant="pill" size="sm" className="chips-pick" value={f.goal} onValueChange={v => v && set('goal', v)}>
          {goals.map(g => (
            <ToggleGroupItem key={g} value={g}>{g}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="field">
        <label>สถานะ</label>
        <ToggleGroup type="single" variant="pill" size="sm" className="chips-pick" value={f.status} onValueChange={v => v && set('status', v)}>
          {statuses.map(s => (
            <ToggleGroupItem key={s} value={s}>{s}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </Modal>
  );
}

/* ---------- Customer Segment modal ---------- */
/* CustomerSegmentModal ลบแล้ว (PART 103) — เป้าย้ายไปตั้งค่า→เป้า/คอม · กลุ่มลูกค้าตัดถาวร */

/* ---------- Historical Entry modal ---------- */


