/* ============================================================
   salesDailyEntry.jsx — ฟอร์มกรอกรายวันฉบับใหม่ (PART 103 · D1/D4/D7/D17)
   ============================================================
   เดิม: ตาราง ช่องทาง × 6 ช่อง (ยอด/ออเดอร์/ค่าแอด/คนทัก/ใหม่/เก่า) ≈ 40 ช่อง/วัน
   ใหม่: **เฉพาะสิ่งที่ระบบไม่รู้เอง** — ค่าแอดต่อช่องทาง + ยอดมาร์เก็ตเพลส + โน้ต + เวลาตอบแชท ≈ 7-9 ช่อง

   ⚠️ ความปลอดภัยข้อมูล:
   - เขียนลง tmk_daily_sales.channels (jsonb) เดิม แต่ **key = ชื่อช่องทางชุด Sale** (Facebook/Shopee/…)
     ส่วน key เก่า (facebook/line_oa/shopee/crm — ตัวเล็ก) **merge คงไว้ ไม่ถูกลบ** → เดือนก่อน cutoff
     ที่อ่านด้วย key เก่ายังได้ค่าเดิมเป๊ะ (ไม่ชนกันเพราะตัวพิมพ์ต่างกัน)
   - ไม่แตะคอลัมน์ยอดเดิม (shopee/tiktok/facebook/…) — ปล่อยค่าที่มีอยู่ไว้อย่างนั้น
   - D4: เดือนไหนมีข้อมูล import มาร์เก็ตเพลสแล้ว → ล็อกช่องยอด mp (import ชนะเสมอ)
   - ยุคเก่า (ก่อน MERGE_CUTOFF) เลือกไม่ได้ตั้งแต่ปฏิทิน (min) — ไม่ต้องรอโดนเตือนตอนกดบันทึก

   UX (รอบแก้ UI/UX 22 ส.ค.): ชิป วันนี้/เมื่อวาน · บันทึกแล้ว parent ปิด sheet + toast (onSaved(date))
   · แจ้ง parent ว่ามีแก้ค้าง (onDirtyChange) → sheet ถามก่อนปิด
   ============================================================ */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { pgErrorText } from './lib/pgError.js';
import { toast, refresh as busRefresh } from './lib/appBus.js';
import { todayISO } from './lib/dateUtils.js';
import { addDays } from './lib/saleTime.js';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from './components.jsx';
import { channelColor } from './charts.jsx';
import { AD_CHANNELS, MANUAL_MP_CHANNELS, isMergedEra, MERGE_CUTOFF } from './lib/salesOverviewAgg.js';
import { readDailyChannels, importedMpRevOfDay } from '../supabase/functions/_shared/saleFormulas.js';

const nn = (v) => Number(v) || 0;
const dayNameOf = (iso) => ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][new Date(iso + 'T00:00:00').getDay()] || '';
const fmt = (n) => '฿' + nn(n).toLocaleString('th-TH');

/* ช่องตัวเลขเงิน — label บน · จุดสีแพลตฟอร์ม · ช่องชิดขวา */
function MoneyField({ label, color, value, onChange, placeholder = '0', inputMode = 'numeric', className = '' }) {
  return (
    <label className={'grid gap-1 ' + className}>
      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">{color && <span className="size-2 rounded-full shrink-0" style={{ background: color }} />}{label}</span>
      <Input type="number" inputMode={inputMode} value={value ?? ''} placeholder={placeholder} className="h-9 text-right" onChange={e => onChange(e.target.value)} />
    </label>
  );
}

export function SalesDailyEntry({ onSaved, onDirtyChange }) {
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ad, setAd] = useState({});          // { channel: ค่าแอด }
  const [mpRev, setMpRev] = useState({});    // { channel: ยอดที่กรอก }
  const [mpOrd, setMpOrd] = useState({});   // { channel: จำนวนออเดอร์ที่กรอก } — เก็บที่ channels[ch].ord
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const [baseRow, setBaseRow] = useState(null);
  const [snap, setSnap] = useState('');      // snapshot ค่าตอนโหลด → เทียบว่ามีแก้ค้างไหม
  const [mpImported, setMpImported] = useState({}); // { channel: ยอดจาก import เดือนนี้ } → ล็อกช่อง
  /* อ่านแถวเดิมของวันนั้นไม่สำเร็จ → ห้ามเซฟเด็ดขาด
     เพราะ save() merge จาก baseRow — ถ้า baseRow เป็น null เพราะ "อ่านพลาด" (ไม่ใช่ "ยังไม่มีแถว")
     การเซฟจะเขียนทับคอลัมน์ channels ทั้งก้อน = ยอดมาร์เก็ตเพลส/ค่าแอดช่องอื่น/note ของวันนั้นหายถาวร
     (แพทเทิร์นเดียวกับ settingsMonthTargets.jsx ที่ล็อกฟอร์มเมื่ออ่านเป้าไม่สำเร็จ) */
  const [loadErr, setLoadErr] = useState('');

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const { data, error: rowErr } = await supabase.from('tmk_daily_sales').select('*').eq('id', 'd-' + d).maybeSingle();
      if (rowErr) {
        // ห้ามทำเป็น "ยังไม่มีข้อมูล" — ต่างกันคนละเรื่องกับเซฟทับของเดิมหาย
        setLoadErr(pgErrorText(rowErr));
        setBaseRow(null); setAd({}); setMpRev({}); setMpOrd({}); setNote(''); setReply(''); setSnap('');
        return;
      }
      setLoadErr('');
      setBaseRow(data || null);
      /* อ่านผ่าน readDailyChannels (ตัวอ่านเดียวกับรายงาน/edge) — เดิมอ่าน key ตัวใหญ่ตรง ๆ
         ทำให้ค่ายุคเก่าที่เก็บ key ตัวเล็ก (facebook/shopee…) ไม่ขึ้นในฟอร์ม พอกดเซฟทับ
         ค่าแอดเดิมของวันนั้นจะถูกกลบเป็น 0 ถาวร (รายงานอ่าน key ตัวใหญ่ก่อนเสมอ) */
      const canon = readDailyChannels(data || {});
      const a = {}, m = {};
      AD_CHANNELS.forEach(ch => { if (nn(canon.ad[ch])) a[ch] = String(nn(canon.ad[ch])); });
      MANUAL_MP_CHANNELS.forEach(ch => { if (nn(canon.mpRev[ch])) m[ch] = String(nn(canon.mpRev[ch])); });
      const od = {};
      MANUAL_MP_CHANNELS.forEach(ch => { const v = nn(canon.stats?.[ch]?.ord); if (v) od[ch] = String(v); });
      const nt = data?.note || '', rp = data?.avg_reply_minutes ? String(data.avg_reply_minutes) : '';
      setAd(a); setMpRev(m); setMpOrd(od); setNote(nt); setReply(rp);
      setSnap(JSON.stringify([a, m, od, nt, rp]));
      /* D4: "วันนี้ + ช่องทางนี้" มีไฟล์นำเข้าแล้วหรือยัง
         ⚠️ ต้องเช็ค **รายวัน** ให้ตรงกับสูตรกลาง — mpExtraRevenue/manualExtraStats กันนับซ้ำด้วย
            hasImport ต่อ (ช่องทาง × วัน) ไม่ใช่ต่อเดือน
         เดิมเช็คทั้งเดือนแล้วล็อกช่องทั้งเดือน → import ครอบ 1–15 ก.ย. ทำให้วันที่ 20 กรอกยอดไม่ได้เลย
         ทั้งที่สูตรพร้อมรับ → ยอดวันนั้นค้าง ฿0 ถาวร
         ผลพลอยได้: ยิงวันเดียวจาก DatePicker = ไม่มีทางเกิด '2026-04-31' (error 22008) อีก */
      const { data: mpo, error: mpErr } = await supabase.from('tmk_mp_orders')
        .select('channel,sales,source,status').eq('order_date', d);
      if (mpErr) { setMpImported(null); }   // null = ไม่รู้สถานะ import (UI เตือนแทนที่จะบอกว่า "ไม่มี")
      else setMpImported(importedMpRevOfDay(mpo));   // กติกาเดียวกับ hasImport ในสูตรกลาง (มีเทส)
    } catch (e) { setLoadErr(e?.message || 'อ่านข้อมูลของวันนี้ไม่สำเร็จ'); setBaseRow(null); }
    finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลด async ตอนเปลี่ยนวัน (pattern ปกติ)
  useEffect(() => { load(date); }, [date, load]);

  // มีแก้ค้างไหม → แจ้ง parent (sheet ถามก่อนปิด)
  const dirty = useMemo(() => !loading && snap !== '' && JSON.stringify([ad, mpRev, mpOrd, note, reply]) !== snap, [loading, snap, ad, mpRev, mpOrd, note, reply]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const impUnknown = mpImported === null;   // อ่านสถานะ "นำเข้าแล้ว" ไม่ได้ → ต้องบอก ไม่ใช่เงียบ
  const legacy = !isMergedEra(date); // กันไว้ (ปฏิทินล็อก min แล้ว — เผื่อพิมพ์เอง)
  const adTotal = AD_CHANNELS.reduce((a, ch) => a + nn(ad[ch]), 0);
  const mpTotal = MANUAL_MP_CHANNELS.reduce((a, ch) => a + nn(mpRev[ch]), 0);
  const mpOrdTotal = MANUAL_MP_CHANNELS.reduce((a, ch) => a + nn(mpOrd[ch]), 0);

  const save = async () => {
    if (legacy) { toast('วันที่ก่อน 1 ส.ค. 2569 เป็นข้อมูลยุคเก่า — แก้จากฟอร์มนี้ไม่ได้', 'warn'); return; }
    // อ่านของเดิมไม่สำเร็จ = ไม่รู้ว่ามีอะไรอยู่ → เซฟตอนนี้เท่ากับลบของเดิมทิ้ง
    if (loadErr) { toast('ยังโหลดข้อมูลของวันนี้ไม่สำเร็จ — กดโหลดใหม่ก่อนบันทึก (กันเขียนทับของเดิม)', 'error'); return; }
    if (saving) return;
    setSaving(true);
    try {
      const prev = (baseRow && typeof baseRow.channels === 'object' && baseRow.channels) || {};
      const next = { ...prev };  // merge — key เก่าตัวเล็กคงอยู่ครบ (ไม่ทำข้อมูลเดิมหาย)
      AD_CHANNELS.forEach(ch => { next[ch] = { ...(next[ch] || {}), ad: nn(ad[ch]) }; });
      /* ord = จำนวนออเดอร์ของมาร์เก็ตเพลสวันนั้น (ท่อ jsonb รองรับอยู่แล้วตั้งแต่ยุคเก่า)
         กติกากันนับซ้ำอยู่ที่ manualExtraStats: วันไหนมีไฟล์นำเข้าของช่องนั้นแล้ว จะไม่เอาที่กรอกมาบวก */
      MANUAL_MP_CHANNELS.forEach(ch => { next[ch] = { ...(next[ch] || {}), rev: nn(mpRev[ch]), ord: nn(mpOrd[ch]) }; });
      const { error } = await supabase.from('tmk_daily_sales').upsert({
        id: 'd-' + date, date, day_name: dayNameOf(date),
        channels: next, ad_spend: adTotal,
        avg_reply_minutes: nn(reply), note: note || '',
        deleted_at: null,   // วันที่เคยถูกลบ (soft-delete) ต้องกลับมาใช้ได้ ไม่งั้นเซฟผ่านแต่ไม่มีใครอ่านเจอ
      });
      if (error) throw error;
      const fields = [{ label: 'ค่าแอดรวม', value: fmt(adTotal) }];
      MANUAL_MP_CHANNELS.forEach(ch => { if (nn(mpRev[ch])) fields.push({ label: `ยอด ${ch}`, value: fmt(mpRev[ch]) }); });
      MANUAL_MP_CHANNELS.forEach(ch => { if (nn(mpOrd[ch])) fields.push({ label: `ออเดอร์ ${ch}`, value: String(nn(mpOrd[ch])) }); });
      logAudit({ action: 'update', entityType: 'daily', entityName: date, summary: `บันทึกค่าแอด/ยอดมาร์เก็ตเพลส ${date}`, fields });
      busRefresh(['tmk_daily_sales']);
      setSnap(JSON.stringify([ad, mpRev, mpOrd, note, reply])); // เคลียร์สถานะแก้ค้างก่อน parent ปิด sheet
      onSaved?.(date);
    } catch (e) {
      toast('บันทึกไม่สำเร็จ: ' + (e?.message || ''), 'error');
    } finally { setSaving(false); }
  };

  const yesterday = addDays(today, -1);
  // ชิปลัดวันที่ (ฟังก์ชัน render ธรรมดา — ไม่ประกาศ component ใน render กัน remount ทุกครั้ง)
  const dateChip = (iso, label) => (
    <button type="button" key={iso} onClick={() => setDate(iso)} disabled={loading} aria-pressed={date === iso}
      className={'h-8 rounded-full px-3 text-xs font-medium border transition-colors ' + (date === iso ? 'bg-[var(--accent)] text-white border-transparent' : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50')}>{label}</button>
  );

  return (
    <div className="grid gap-4">
      {/* วันที่: ชิปลัด วันนี้/เมื่อวาน + ปฏิทิน (ล็อกตั้งแต่ยุคใหม่ ถึงวันนี้) */}
      <div className="flex items-center gap-2 flex-wrap">
        {dateChip(today, 'วันนี้')}
        {dateChip(yesterday, 'เมื่อวาน')}
        <div className="w-[172px] shrink-0 ml-auto"><DatePicker value={date} onChange={(v) => v && setDate(v)} min={MERGE_CUTOFF} max={today} clearable={false} className="h-8" /></div>
      </div>
      {/* อ่านของเดิมไม่สำเร็จ → เตือนชัด + ล็อกปุ่มบันทึก (กันเซฟทับแล้วยอดวันนั้นหายถาวร) */}
      {loadErr && (
        <div role="alert" className="rounded-lg border px-3 py-2.5 text-xs grid gap-1.5"
          style={{ color: 'var(--bad)', background: 'color-mix(in srgb, var(--bad) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--bad) 35%, transparent)' }}>
          <b>โหลดข้อมูลของวันนี้ไม่สำเร็จ — บันทึกไม่ได้</b>
          <span style={{ color: 'var(--ink-3)' }}>{loadErr}</span>
          <span style={{ color: 'var(--ink-3)' }}>ถ้าบันทึกทับตอนนี้ ยอดมาร์เก็ตเพลส/ค่าแอดที่เคยกรอกไว้ของวันนี้จะหายถาวร</span>
          <button type="button" className="justify-self-start underline decoration-dotted" onClick={() => load(date)}>โหลดใหม่</button>
        </div>
      )}
      {legacy && <div className="rounded-lg border px-3 py-2 text-xs" style={{ color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 10%, transparent)' }}>วันที่ก่อน 1 ส.ค. 2569 เป็นข้อมูลยุคเก่า — ดูได้อย่างเดียว</div>}

      {loading ? <div className="grid gap-3"><Skeleton className="h-[132px] w-full rounded-xl" /><Skeleton className="h-[88px] w-full rounded-xl" /><Skeleton className="h-[88px] w-full rounded-xl" /></div> : (
        <fieldset disabled={legacy} className="grid gap-4 min-w-0 disabled:opacity-60">
          {/* ค่าแอด — กริด 2 คอลัมน์ label บนช่อง (อ่านไล่ง่าย ไม่กระจัด) */}
          <div className="rounded-xl border p-3">
            <div className="flex items-baseline justify-between gap-2 mb-2.5">
              <span className="text-sm font-semibold">ค่าแอด (บาท)</span>
              {adTotal > 0 && <span className="num text-xs text-muted-foreground">รวม <b className="text-foreground font-semibold">{fmt(adTotal)}</b></span>}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              {AD_CHANNELS.map(ch => <MoneyField key={ch} label={ch} color={channelColor(ch)} value={ad[ch]} onChange={v => setAd(p => ({ ...p, [ch]: v }))} />)}
            </div>
          </div>

          {/* ยอดมาร์เก็ตเพลส */}
          <div className="rounded-xl border p-3">
            <div className="flex items-baseline justify-between gap-2 mb-2.5">
              <span className="text-sm font-semibold">ยอดขายมาร์เก็ตเพลส (บาท)</span>
              {(mpTotal > 0 || mpOrdTotal > 0) && <span className="num text-xs text-muted-foreground">รวม <b className="text-foreground font-semibold">{fmt(mpTotal)}</b>{mpOrdTotal > 0 ? <> · <b className="text-foreground font-semibold">{mpOrdTotal}</b> ออเดอร์</> : null}</span>}
            </div>
            {impUnknown && (
              <div className="text-xs mb-2" style={{ color: 'var(--warn)' }}>
                <Icon name="alertTriangle" className="inline size-3.5 mr-1" />
                ตรวจไม่ได้ว่าวันนี้มีไฟล์นำเข้าแล้วหรือยัง — ถ้ามีไฟล์นำเข้าของวันนี้อยู่แล้ว ยอดที่กรอกจะไม่ถูกใช้
              </div>
            )}
            {/* ยอด + จำนวนออเดอร์ คู่กันต่อช่องทาง — จำนวนใช้ตอนที่ยังไม่มีไฟล์นำเข้าของวันนั้น
                (ถ้ามีไฟล์นำเข้าแล้ว ระบบใช้ของจริงทั้งยอดและจำนวน · ช่องจะถูกล็อก) */}
            <div className="grid gap-2.5">
              {MANUAL_MP_CHANNELS.map(ch => {
                // ล็อกเมื่อ "มีแถวนำเข้า" ไม่ใช่เมื่อยอด > 0 (ตรงกับ hasImport ในสูตรกลาง)
                const imp = mpImported?.[ch];
                const locked = (imp?.rows || 0) > 0;
                return (
                  <div key={ch} className="grid grid-cols-2 gap-x-3 items-end">
                    {locked
                      ? <div className="grid gap-1 col-span-2">
                          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5"><span className="size-2 rounded-full shrink-0" style={{ background: channelColor(ch) }} />{ch}</span>
                          <span className="h-9 flex items-center justify-end gap-1.5 px-2.5 text-xs rounded-md border bg-muted/40 text-muted-foreground num" title="วันนี้มีข้อมูลนำเข้าของช่องทางนี้แล้ว — ระบบใช้ยอดและจำนวนออเดอร์จากไฟล์ที่นำเข้า"><Icon name="lock" size={12} /> นำเข้าแล้ว {fmt(imp?.rev || 0)}</span>
                        </div>
                      : <>
                          <MoneyField label={ch} color={channelColor(ch)} value={mpRev[ch]} onChange={v => setMpRev(p => ({ ...p, [ch]: v }))} />
                          <MoneyField label="จำนวนออเดอร์" value={mpOrd[ch]} placeholder="—" onChange={v => setMpOrd(p => ({ ...p, [ch]: v }))} />
                        </>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* อื่นๆ — ตอบแชท + โน้ต */}
          <div className="rounded-xl border p-3 grid gap-2.5">
            <span className="text-sm font-semibold">อื่นๆ</span>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <MoneyField label="ตอบแชทเฉลี่ย (นาที)" value={reply} onChange={setReply} />
              <label className="grid gap-1 col-span-2">
                <span className="text-[11px] text-muted-foreground">โน้ตวันนี้</span>
                <Input value={note} placeholder="เช่น ไลฟ์เย็น 1 รอบ, Flash Sale" className="h-9" onChange={e => setNote(e.target.value)} />
              </label>
            </div>
          </div>
        </fieldset>
      )}

      {/* บันทึก — ปุ่มใหญ่ท้ายฟอร์ม · ติ่งบอกเมื่อมีแก้ค้าง */}
      {/* loadErr = อ่านของเดิมไม่ได้ → ล็อกปุ่มด้วย ไม่ใช่กันแค่ใน save() (กันกดแล้วเจอ toast อย่างเดียว) */}
      <Button className="w-full h-10" onClick={save} disabled={saving || loading || legacy || !dirty || !!loadErr}>
        {saving ? 'กำลังบันทึก…' : dirty ? 'บันทึก' : 'ไม่มีอะไรเปลี่ยน'}
      </Button>
    </div>
  );
}
