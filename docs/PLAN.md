# PLAN — รื้อ UI/UX รายงานขาย + ภาพรวม CRM (22 ส.ค. 2569)

> แผนที่ user เคาะในแชทแล้ว ("ลุยได้เลยเอาตามที่คุณบอก") · ต่อเนื่องจาก [PLAN-SALES-MERGE.md](PLAN-SALES-MERGE.md) (PART 103)
> สถานะ: ครบตามแผน (รอ user รีวิวของจริง) · ยัง uncommitted ทั้งชุด · commit เมื่อ user สั่งเท่านั้น

## เป้าหมาย
หน้า "ยอดขาย" (รายงานขาย + ภาพรวม CRM) อ่านง่าย ไม่มีปุ่มสลับเกินจำเป็น ทุกตัวเลขมีเทียบเดือนก่อน เกจเป้าแบบเดียวกัน (memory `gauge-kpi-pattern`) และ **component กลางชุดเดียว** ใช้ร่วม 2 หน้า

## ขอบเขต (ทำแล้ว ✓ / กำลังทำ ▶)
- ✓ hero (ยอดรวม + สะสมเทียบเดือนก่อน + แถบช่องทาง | เกจจังหวะทำยอด) · เป้ารายช่องทาง · KPI 8 ใบ
- ✓ แท็บภาพรวม: กราฟรายวัน · ช่องทาง/การชำระ · ลายขายดี/สัดส่วน · แนวโน้มระยะยาว
- ✓ แท็บคนทัก & ปิดการขาย · โฆษณา · สินค้า & พื้นที่
- ✓ **แท็บ ลูกค้า & CRM + หน้าภาพรวม CRM** (22 ส.ค.) — ไฟล์กลาง `src/crmBlocks.jsx`:
  - customerStats / CustomerKpis (8 ใบ ▲▼) · NewOldDailyChart (+เส้น %ซื้อซ้ำ เกณฑ์ 35%) · ChannelNewOldRows · RfmRows+ขนาดออเดอร์ · CrmTeamMini · CrmActivity (จาก tmk_crm_notes ทั้งเดือน) · FollowUpList (เสี่ยงหลุด ≥35 วัน/≥2 ครั้ง · ใหม่รอซื้อซ้ำ 21–45 วัน) · CustomerTable
  - หน้าภาพรวม CRM: เกจเป้า CRM (TargetGauge) · แถวทีม · KPI 8 · กราฟ LINE/โทร + เส้นสายโทร + เส้นประเดือนก่อน · กิจกรรมรายวัน + ปุ่มบันทึก · ควรตามต่อ · RFM · ตารางลูกค้าเดิม (ตัวกรอง/CSV/แบ่งหน้า คงไว้)
  - ตัด: โดนัท CRM เทียบยอดรวม · การ์ด ลูกค้า CRM เดือนนี้ · MetricCard 6 ใบ · การ์ด ยอด CRM/LINE/โทร/เป้า ในแท็บ · sparkline ซื้อซ้ำ
- ✓ **รอบ 2 (user: "ยังเฉยๆ")** — เลิก KPI-grid: วงจรชีวิต 5 ขั้น + เกจซื้อซ้ำ (CustomerHero) · ContactCards · RfmTiles · CrmTeamStrip · hero CRM 3 ช่อง · CallActivityPanel · CohortMatrix · **popup ลูกค้าอันเดียว** (CustomerDrawer → CustomerDetail)

- ✓ **หน้า "สินค้า" (แคตตาล็อก) + Sheet เพิ่ม/แก้ไข** (22 ส.ค. · จาก design-audit 9 ข้อ · ตรวจ web-design-guidelines แล้ว) — [saleCatalog.jsx](../src/saleCatalog.jsx)
  - ตาราง: ชิปสถานะ/ข้อมูลไม่ครบ กดกรอง 1 คลิก · ไซซ์ย่อ "XS–5XL · 9" · ราคาแก้ในช่อง (PriceCell · update เฉพาะคอลัมน์ราคา) · ฿0 = "—" สีเตือน · ⚠ tooltip แทน badge · ตัดถังขยะรายแถว · ป้าย OEM/DFT/กลุ่มพิเศษหลังชื่อ
  - Sheet: หัว = ชื่อลาย · sub = รหัสล็อก (ชิป) + ความครบสด · FormSection/Field กลาง · ราคา ฿ เด่น · สถานะ/งาน/กลุ่มเสื้อ = pills · สี = พิลล์ toggle เหมือนไซซ์ · SKU พับ (หัวโชว์จำนวน/แก้เอง/คัดลอก) · error ใต้ช่อง + aria-describedby · ปุ่มบันทึกบอกเหตุผล
  - ไม่ทำ: รูป · DB/สูตร SKU/รหัสล็อก · autosave ทั้งฟอร์ม

- ✓ **หน้าออเดอร์ + ดู/แก้/เพิ่มออเดอร์** (22 ส.ค. · design-audit 11 ข้อ · ตรวจ web-design-guidelines) — views-orders.jsx · orderDrawer.jsx · orderForm.jsx · ManualSaleSheet.jsx
  - ตาราง: ซ่อน วันที่/งาน/สถานะ/หมายเหตุ default (key hiddenCols-v2) · แถวคั่นวัน (เมื่อเรียงตามวัน) + ยอด/วัน · หัวสรุป จำนวน·ยอด · ชิปช่องทางเรียบ · ตัดลูกศร · ป้ายงาน/ยกเลิก/โน้ตไอคอน ในแถว
  - ฟอร์มกลาง: เงินแถวเดียว (ยอด·ค่าส่ง·จำนวน) + กาง ส่วนลด/VAT/ราคาเสื้อ · `reconcileLines` (รายการ vs ราคาเสื้อ — แก้เตือนผิด) + เทส · บรรทัดสินค้ากระชับ · ชิปสถานะลูกค้าไม่ซ้ำ label · ช่องทางว่าง = ขอบเตือน
  - Sheet ดู/แก้: หัว "แก้ไข SLxxxx" · ปุ่มลง footer เดียว · ตัดเลขออเดอร์/รหัสลูกค้าซ้ำเบอร์/คอลัมน์จับคู่ (→tooltip) · วันที่ไทย
  - เพิ่ม: ปุ่มบันทึก enabled + tooltip เหตุผล · ไม่แตะท่อบันทึก

- ✓ **แก้บั๊ก popup กระพริบ (ทั้งระบบ) + หน้าส่งยอด** (22 ส.ค.) — root cause: `.animate-out` ไม่มี `animation-fill-mode` + `useAnimatedClose` unmount ด้วย setTimeout ที่ยาวกว่า/ถูก throttle → element เด้งกลับ opacity 1 ก่อน unmount
  - แก้: CSS `fill-mode: forwards` + `pointer-events:none` ตอน closed (index.css/sheet/dialog/alert) · hook ผูก `animationend` ปิดทันที (timeout = fallback)
  - หน้าส่งยอด: ชิปสถานะชุด (พร้อม/ติดปัญหา/ไม่มีช่องทาง) · ปุ่มบันทึกใช้ยอด readyRows · RowEditor ใช้ `reconcileLines` · ประวัติยุบเป็นแถบเดียว · upload zone มี hint

- ✓ **หน้าประสิทธิภาพเซลล์ (ส่วนบน)** (22 ส.ค.) — `TeamHero` (ยอดรวม + Δ + แถบโอน/COD เต็มกว้าง | เฉลี่ย/วัน · คาดทั้งเดือน · วันขายดีสุด) · **user ตัดเป้า+ค่าคอมทีมออก** (เกจ/KPI คอมถูกลบ) · KPI 3 ใบผ่าน `KpiCard` + `dObj` · `LeadStrip` · `TrendCard` → `DailySalesChart`

- ✓ **หน้าประสิทธิภาพเซลล์ (ส่วนล่าง)** (22 ส.ค. · user เลือกตัวเลือก A) — `TeamBoard` (SortableTable + cards mode) แทน `SellerCard` grid · `SpDetail` ยอดเด่น + KPI inline + `LeadLine` + `DailySalesChart` + ตารางช่องทางรวม (`.ch-close-row` responsive) · `DeepPanel` โดนัท → แถบช่องทาง

- ✓ **popup ออเดอร์ทั้งวัน (3 หน้า) + ออเดอร์ CRM รายวัน** (22 ส.ค.) — `DaySummaryBar` (แทน `DayTiles`) · `groupLines` รวมไซซ์ · `OrderCard collapsed hideDate` + ชื่อลูกค้า/เซลล์บนแถวย่อ · ชิปกรองโอน/COD + เรียง · ไม่ prefetch attrs แล้ว (กดค่อยดึง)

- ✓ **หน้าบันทึกกิจกรรม (logs)** (22 ส.ค.) — KPI 5 กล่อง → ชิปกรอง (actionG + วันนี้) · ตัวกรองละเอียดพับ (`filtersOpen`) + `activeChips`/`nAdv` · `LogRow` กระชับ (จุดสี severity · ป้าย action ชิดข้อความ · ตัดชื่อท้ายซ้ำ · `fmtClock`)

- ✓ **popup ลูกค้า (CustomerDetail)** (22 ส.ค.) — แถวสถานะเหนือปุ่ม · ปุ่มหลัก/รอง (DropdownMenu) · ยอดซื้อรวมเด่น + 3 ค่ารอง · `FreqChips` โชว์ ×n เสมอ · `OrderCard hideCustomer` (โชว์ลายแทนชื่อซ้ำ)

- ✓ **popup รายละเอียดบันทึกกิจกรรม (LogDetail)** (22 ส.ค.) — หัว action+entity+relTime · การ์ดสรุป · changes/fields เป็นตาราง · JSON พับ (`rawOpen`) + คัดลอก JSON/สรุปทั้งรายการ · ลบ `Row` helper

- ✓ **หน้า "มีอะไรใหม่" (WhatsNewPage)** (22 ส.ค.) — max-width 760 (แก้ `.content-inner{max-width:none}` ทับ) · `splitEntry`/`entryKind`/`ChangeItem` (หัวข้อ+ป้าย+line-clamp+อ่านต่อ) · SHOW_FIRST 5 + ดูทั้งหมด · ค้นหา · merge เวอร์ชันซ้ำ

- ✓ **หน้าโครงการทั้งหมด (flows overview)** (23 ส.ค.) — hero คืบหน้า + ชิป drill · แถบเตือนเลยกำหนด · workload กดได้ (`drillPerson`) · `FlowCard` ปกบาง 44px + ตัวเลขค้าง/เลยกำหนดขึ้นก่อน · grid auto-fill 268px

- ✓ **หน้างานของฉัน (My Tasks)** (23 ส.ค.) — KPI 5 ใบ → hero ค้าง/เสร็จ% + ชิปกรองกดได้ (เลยกำหนด/ครบวันนี้/ใน 7 วัน) · แถบเตือนเลยกำหนดพร้อมชื่องาน · ตัวกรองละเอียดพับ + `activeChips` · กลุ่ม "เสร็จแล้ว" พับไว้

- ✓ **บอร์ดโครงการทั้งชุด (PART 104)** (23 ส.ค.) — รื้อ 4 วิว + หัวบอร์ด + ฟอร์มงาน + ตรรกะกลาง
  - ใหม่ `src/lib/taskFilters.js` (pure + 9 เทส): `dueInfo` (overdue/today/soon/later/done/none · ยึด dateEnd||dateISO) · `taskMatchesQuery` (ชื่อ+รายละเอียด+แท็ก+ผู้รับผิดชอบ) · `filterTasks` · `sortTasks` (manual tie → due) · `taskStats` · `myNameSet` · `isoToday`
  - `plannerFilters.jsx` → แถบเดียว: ค้นหา + ชิปด่วน (ของฉัน/เลยกำหนด/ครบใน 7 วัน · เลขตรงกับผลลัพธ์) + ช่วงวันที่ + ตัวกรองพับ + "แสดง N จาก M งาน"
  - `views-planner.jsx` — memo `base`/`filtered`/`stats` · quick state · myNames จาก TMK.roles/staff
  - Kanban — หัวคอลัมน์ (count + เลยกำหนด) · พับคอลัมน์ (localStorage ต่อโครงการ · CSS grid→flex) · เส้นบอกตำแหน่งวาง · reorder เขียนขนาน · `sortTasks` แทน sortOrder ดิบ
  - TaskCard — เมนู "ย้าย" ทุกจอ (WCAG 2.2 dragging-alternative · เดิม select mobile-only) · แถบซ้ายแดงเมื่อเลยกำหนด · prop `hideDate`
  - Timeline — bucket ตามความเร่งด่วน + แถบสรุป anchor · ตัดการ์ดแคมเปญที่นับจาก DD.tasks (ไม่ตรงตัวกรอง)
  - List — เลือกวิธีเรียง · เมนูย้ายสถานะรายแถว · วันครบกำหนดสีเตือน · พับกลุ่ม · bulk รายงาน fail count
  - Calendar — เปลี่ยนเดือนไม่รีเซ็ตวัน · scrollIntoView ตอนแตะวัน (≤900px) · ชิปงานเสร็จจาง+ขีดฆ่า · ลบโค้ดตาย (`wasDay`, dayRef ที่ไม่ถูกใช้)
  - หัวบอร์ด (`views-flows.jsx`) — สถิติสด + แถบคืบหน้า · ปุ่มหลัก "เพิ่มงาน" · แชร์/ประวัติ/ตั้งค่า → DropdownMenu เดียว
  - `modals-task.jsx` — Cmd/Ctrl+Enter · ปุ่มวันด่วน · error ใต้ช่องชื่องาน (aria-invalid/role=alert)
  - `flowSettingsPage.jsx` — dirty state: ป้าย "ยังไม่ได้บันทึก" + ถามก่อนออก
  - ไอคอน expand/collapse: `up`/`down` (ลูกศรเฉียง = trend) → `chevD`/rotate180/`chevR` ทั้ง planner + mytasks

- ✓ **หน้าตั้งค่าหลัก (PART 105)** (23 ส.ค.) — shell + ทั่วไป + ถังขยะ + a11y การเรียงลำดับ
  - `views-settings.jsx` รื้อ: เมนูจัดกลุ่ม 4 กลุ่ม + hint + count ต่อแท็บ · ค้นหาการตั้งค่า (กระโดดเข้าแท็บ) · มือถือ = แถบเลื่อนแนวนอน (เดิม flex-col ตลอด) · เดสก์ท็อป sticky
  - `GeneralSettings` รื้อ: การ์ดโปรไฟล์ (ชื่อ/อีเมล/หน้าที่/สิทธิ์/ล็อกกี่หน้า จาก TMK.roles+staff) · ธีมเป็นปุ่มคู่ · ทางลัด 4 ปุ่ม · about ย่อ (ตัดป้าย Supabase/เปิด)
  - `TrashView` รื้อ: ค้นหา + ชิปกรองชนิดพร้อมจำนวน + `relTime` · empty state ย่อ · หมายเหตุเหลือบรรทัดเดียว
  - `RolesView`: ค้นหาชื่อ/อีเมล/หน้าที่ (โชว์เมื่อ > 6 คน)
  - **บั๊กไอคอน**: `name="loader"` (8 จุด) + `name="refreshCcw"` ไม่มีในชุด → ตกเป็น `ICONS.dot` · เพิ่ม `loader` + เปลี่ยนเป็น `refresh`
  - **`Icon` ไม่รับ prop `style`** → rotate chevron ไม่ติด (กระทบ PART 104 ด้วย) · เพิ่ม passthrough แล้ว
  - `components/ReorderButtons.jsx` ใหม่ — ปุ่มขึ้น/ลง (WCAG 2.2 dragging-alternative) แทน drag-handle เดสก์ท็อป + ▲▼ มือถือ ใน ช่องทาง/แบรนด์/แคมเปญ
  - ตัดแบนเนอร์อธิบายหัวข้อซ้ำใน ช่องทาง/แบรนด์/หน้าที่ · ความกว้างเนื้อหาเท่ากันทุกแท็บ (max-w-3xl) · แถวช่องทางโชว์ สี/ค่าธรรมเนียม/มีโฆษณา

- ✓ **เป้า/คอม + สิทธิ์ + คุณภาพข้อมูล (PART 106)** (23 ส.ค.)
  - `components/MoneyInput.jsx` ใหม่ — ช่องเงินมีคอมมา (onChange คืนตัวเลขล้วน เหมือนเดิม) · CSS ซ่อน spinner ของ `input[type=number]` ทั้งระบบ
  - `settingsMonthTargets.jsx` — MoneyInput + พับช่องทางที่ยังไม่ตั้งเป้า + %สัดส่วนต่อช่องทาง + "คัดลอกจากเดือนก่อน" (อ่าน tmk_monthly_history เดือนก่อน)
  - `TargetsView` — MoneyInput ทุกช่องเงิน · คอลัมน์ "คอมที่เป้า" (เป้า × เรต) · "คัดลอกจากเดือนก่อน" (fetchTargets/fetchCrmTargets เดือนก่อน → manualNames)
  - `LockPicker` รื้อ — **สร้างรายการหน้าจาก NAV_DEF** (`useLockSections`) แทน hardcode · แก้บั๊กรายการค้าง: `sales` (ยุบไปตั้งแต่ PART 103) และ `catalog:data` "ส่งยอด & ข้อมูล" (ลบตั้งแต่ PART 102) · UI = แถวหน้า + toggle เข้าได้/ล็อก + subs เยื้อง + ล็อก/ปลดทั้งหมด + สรุปจำนวน · ล็อกหมวด = ตัดคีย์ subs ทิ้ง
  - `views-health.jsx` — matchPct ไม่ปัดขึ้นเป็น 100 เมื่อยังไม่ครบ + sub "1,311/1,313" · container `max-w-5xl` แทน `.content-inner`
  - แก้ข้อความชี้ไปหน้าที่ลบแล้ว: `salePerf.jsx` (empty state) · `views-orders.jsx` (empty state)

- ✓ **ตรวจ+อุดรอยรั่วยอดเงินของระบบยอดขายรวม (PART 107)** (24 ส.ค. · user เคาะกติกา: "ยอดกรอก = ยอดทั้งวันของช่องนั้น" + "ยึดจาก import")
  - **สูตรกลางย้ายไป `_shared/saleFormulas.js`** (ใช้ร่วม FE ↔ edge): `SALE_CHANNELS`/`MANUAL_MP_CHANNELS`/`LEGACY_CHANNEL_IDS`/`isImportedOrder`/`readDailyChannels`/`mpRevByDateOf`/`mpExtraRevenue` · `saleFields.CHANNELS` + `salesOverviewAgg` re-export ต่อ (เลิกประกาศซ้ำ)
  - **P1 ยอด mp กรอกมือหาย** — เดิม `importedRev === 0` เทียบทั้งช่วง → มีออเดอร์ mp ใบเดียวทั้งเดือน ยอดกรอกหายหมด · ใหม่ = per-day: วันมี import จริง (source ≠ shipnity) ยึด import · วันอื่น `max(0, กรอก − ออเดอร์วันนั้น)`
  - **P2 YoY/ไตรมาส ต่ำกว่าจริง** — `fetchYearMergedActuals` บวก mp กรอกมือรายวัน (ดึง tmk_daily_sales ของปีเพิ่ม 1 query)
  - **P3 คนทักรั่วข้ามเดือน** — `channelTable(orders, funnel, manual, crmTeam, opts)` กรอง funnel เองด้วย `{from,to,salespersons,channels}` (จุดเดียว ไม่พึ่ง caller) · saleDashboard ส่ง range/f.salesperson/f.channel ทั้ง mergedTable + prevTable(ช่วงก่อน)
  - **P4 กรองแล้วยอดเกิน** — manual/ad เคารพ `channels` + `allowManual` (false เมื่อกรองมิติที่ยอดกรอกมือไม่มีเจ้าของ: เซลล์/ลูกค้า/ลาย/จังหวัด/ประเภทงาน…)
  - **P5 หน้าหลัก + LINE** — `fetchMergedMonth().days[].mpManual` บวกยอด mp รายวัน · edge `daily-sale-report` ใช้ `mpExtraRevenue` เดียวกัน (AOV หารเฉพาะยอดที่มีออเดอร์จริง) → **bundle ไว้แล้วที่ `dist-edge/daily-sale-report.ts` ยังไม่ deploy (user จะรันเอง)**
  - **P6 ค่าแอดไม่ระบุช่องทาง** — เดิมทิ้งเงียบ · ตอนนี้เข้ายอดค่าแอดรวม/ROAS + แถบเตือนในแท็บโฆษณา (`table.unassignedAd`)
  - เทส: salesOverviewAgg 30 เคส (เพิ่ม 11) + DOM merged 7 เคส (เพิ่ม 2) · รวมทั้งโปรเจกต์ 545 ผ่าน

- ✓ **ทาง 1 — มือถือใช้ได้จริง + ไอคอนเพี้ยน (PART 108)** (24 ส.ค.)
  - วัดของจริง: `MergedChannelTable` sw **441**/390 · `AdsTab` ต่อช่องทาง sw **596**/390 (คอลัมน์ px ตายตัว) → CSS `.ch-row`/`.ad-row` grid responsive (≤700px / ≤860px พับ 2–3 บรรทัด) · หลังแก้ **390/390 ทั้งคู่** · เดสก์ท็อป 1400 แถวเดียวเหมือนเดิม (light+dark)
  - ไอคอน: `left`/`right` (pager ออเดอร์+CRM 4 ปุ่ม) ไม่มีในชุด → `chevL`/`chevR` · `up`/`down` (ลูกศร trend) ที่ใช้เป็น chevron 15 จุด → `chevD` + rotate180 · สแกนทั้ง src แล้วเหลือ 0 ชื่อที่ไม่มีในชุด · ที่ยังใช้ up/down = ชิป ▲▼ ของจริงเท่านั้น
- ✓ **ทาง 2 — เงินครบ + กันพังปีหน้า (PART 108)** (24 ส.ค.)
  - **A1 YoY ปีหน้า**: `LongTermSection` ดึง `fetchYearMergedActuals` ของ **ปีก่อน** ด้วย (คลัง tmk_monthly_history ไม่มีการเขียน actual อีกแล้ว → ปี 2570 จะเทียบกับ 0)
  - **A2 ยุคเก่า**: `readDailyChannels` fallback อ่านคอลัมน์แยก (`LEGACY_REV_COLS`) เมื่อ jsonb ไม่มี (jsonb ชนะ ไม่ซ้ำ) · `mpRevByDateOf` — วัน < `MERGE_CUTOFF` นับ **ทุกช่องทาง** (ยุคนั้นกรอกมือหมด) · ≥ cutoff นับเฉพาะ mp · `MERGE_CUTOFF` ย้ายไป `_shared` แหล่งเดียว
  - **A3 แถว CRM**: `crmMonth` ใช้เดือนของวันสุดท้ายในช่วงเสมอ (เดิมเฉพาะเดือนเต็ม → "30 วันล่าสุด" แถว CRM หายเงียบ) · การเทียบเป้ายังจำกัดที่เดือนเต็มเหมือนเดิม
  - เทส salesOverviewAgg 34 เคส (+4 ยุคเก่า) · รวม 549 ผ่าน · `npm run build:edge` ใหม่แล้ว (ยังไม่ deploy)

- ✓ **ทาง 3 — ลด egress ทั้งระบบ + เก็บกวาด (PART 109)** (24 ส.ค. · user: ไม่เอาปุ่ม CSV)
  - **ตอนเปิดแอป**: ตัด `segments` ออกจาก QUERIES + ตัด `colorMix`/`sizeMix`/`fbMetrics` ออกจาก `DEFERRED` (ทั้ง 4 มี 0 consumer ใน src/) · `DEFERRED` เหลือ `adCamps` · App.jsx `dataEnsure(['adCamps'])`
  - **รายงานขาย**: เลิก `cachedFetchAll('tmk_mp_customers')` ทั้งตาราง (ป้อนแค่ `ltRepeatRate/withPhone/custN` ที่ไม่ได้ render แล้ว — ลบ dead code ด้วย) · คนทักเปลี่ยนจาก `cachedFetchAll('tmk_sales_funnel','*')` → `cachedFetchRange(FUNNEL_SEL, winFrom, winTo, 'date')`
  - `FUNNEL_SEL` ใหม่ใน saleData.js = `date,salesperson,leads,voice,leads_fb_new,leads_fb_old,leads_line_new,leads_line_old` (ครบทุกคอลัมน์ที่ funnelBreakdown/funnelVoices/daySummary อ่าน)
  - **ลบโค้ดตาย**: `saleDashboardTeam.jsx` (SalesLeaderboard 165 บรรทัด) + บล็อก `tab === 'team'` — ไม่มี TabsTrigger มาตั้งแต่ PART 103
  - **เทสกันบั๊ก** `lib/__tests__/dataLoad-egress.test.js` (6 เคส): FUNNEL_SEL ต้องมีครบทุกคอลัมน์ที่ helper อ่าน (ทั้ง jsonb ใหม่ + legacy 4 คอลัมน์ + voice) · ห้ามโป่งเกิน 8 คอลัมน์/ห้ามมี `*` · `mapToTMK` ต้อง null-safe เมื่อไม่มีตารางที่เลิกโหลด
  - **ตรวจแล้วไม่แตะ**: ภาพรวม CRM ยังต้องดึงออเดอร์ทั้งหมด (RFM/ซื้อล่าสุด = ตัวเลข lifetime) · overrides ใช้ cache ร่วมทุกหน้าอยู่แล้ว (1 request/5 นาที)
  - รวม 555 เทสผ่าน · lint 0/0 · build ผ่าน

- ✓ **CRM ยกเครื่อง 3 ชุด (PART 110)** (24 ส.ค. · user: "เอาทุกชุดเลย")
  - **ชุด 1**: ปุ่ม "คัดลอกรายงานวันนี้" (เรียก `buildCrmDailyReport` ที่เขียนไว้ตั้งแต่ PART 91 แต่ไม่มี UI เรียก) · แก้ทางตันตอนกด "บันทึกวันนี้" ขณะดูรวมทีม (ล็อกไปเซลล์คนแรก + ข้อความบอกในป็อปอัพ) · จุดแดงเตือนวันนี้ยังไม่กรอก (`todayFilled`) · edge `daily-sale-report` อ่านทีม CRM จาก `tmk_crm_targets` ของเดือน (fallback env `CRM_SELLER`) + รวมบันทึกหลายคน
  - **ชุด 2** (ของจริง): ตารางใหม่ `tmk_crm_contacts` + `lib/crmContacts.js` (pure: `contactStats`/`lastContactMap`/`snoozeMap`/`isDue`/`dueRows`/`contactBadge`/`nextSnoozeISO`/`callsFromContacts` · IO: fetch/save/fetchCustomerContacts) · ContactCards มีปุ่ม รับสาย/ไม่รับ/เลื่อน + ซ่อนคนที่ทำแล้ว (ชิป "ทำแล้ว N") · CustomerDetail มีเมนูบันทึก + ประวัติ 5 ครั้งล่าสุด · ฟอร์มบันทึกประจำวันเติมจำนวนสายอัตโนมัติจาก contacts
  - **ชุด 3**: เป้ากิจกรรม (`calls_target`/`answer_rate_target` ใน `tmk_crm_targets` · UI ในตั้งค่า → เป้า & คอม เฉพาะทีม CRM · แถบความคืบหน้าใน CallActivityPanel) · `cadenceDays()` ทำให้ "รอบติดตาม" ใช้จริง → กลุ่ม "ถึงรอบติดตาม" ในการ์ดควรติดต่อ · `findDuplicateCustomers()` + การ์ด `DuplicateCustomers` (ชี้เป้า ไม่รวมอัตโนมัติ)
  - **migration ที่ user ต้องรันเอง**: `20260824-crm-contacts.sql` · `20260824-crm-activity-targets.sql` (idempotent + VERIFY + ROLLBACK ครบ) · ทุกอย่าง graceful ถ้ายังไม่รัน (ปุ่มบันทึกซ่อน + toast บอกให้รัน)
  - เทส: `crmContacts.test.js` 15 เคส (สถิติสาย · ลิสต์ due/snooze · badge · cadence · ลูกค้าซ้ำ) · รวมทั้งโปรเจกต์ **570 ผ่าน**

- ✓ **ระบบงานติดตามลูกค้า (PART 111)** (24 ส.ค. · ไม่ต้อง migration — ใช้คอลัมน์ tags เดิม)
  - ปัญหาเดิม: `followUp()` เปิดฟอร์มงาน prefill แค่ title/detail/date · `TaskModal` ทิ้ง prefill อื่นทั้งหมด (tags/priority/responsible/channel) · งานที่สร้างไม่ผูกกับลูกค้า → กดซ้ำได้ไม่จำกัด ไม่มีใครรู้ว่ามีงานค้าง
  - `lib/crmFollowUp.js` ใหม่ (pure · 8 เทส): `crmTaskTag`/`customerKeyOfTask` (แท็ก `crm:<key>`) · `customerTasks` · `followUpStatus` (open/overdue/nextDue/lastDone · รองรับ doneIds ของโครงการ) · `addDaysISO` · `buildFollowUpTask` (แท็ก+วัน+ความสำคัญตาม flag/tier+ช่องทางโทร+รายละเอียดลูกค้า)
  - `modals-task.jsx`: งานใหม่รับ prefill ครบ (tags/priority/responsible/channel/camp/brandIds/dateEnd)
  - `saleCrmDetail.jsx`: ปุ่มเป็นเมนู (วันนี้/+3/+7/+14) · แถบ "งานติดตามค้างอยู่ N งาน" + เลยกำหนด (กดเปิดงานได้) · ปุ่มเปลี่ยนสีเมื่อมีงานเลยกำหนด
  - `crmBlocks.ContactCards`: ปุ่ม "+ งาน" ต่อการ์ด · ถ้ามีงานค้างแล้วขึ้นป้าย "มีงานค้าง N" แทนปุ่ม (กันสร้างซ้ำ)
- ✓ **กราฟยอดสะสม: เอาป้ายปลายเส้นออก** (user 24 ส.ค. "รก") — `CumulativeCompare` ลบ label ของ ReferenceDot ทั้ง 2 เส้น + คืน margin ขวา 104px→16px (กราฟกว้างขึ้น) · เลิกใช้ prop `fmtShort`

- ✓ **ระบบสต็อก เฟส 1 — ตั้งต้น + นับ (PART 112)** (24 ส.ค. · ขอบเขตตามที่ user เคาะ · แผนเต็ม `docs/PLAN-STOCK.md`)
  - **สูตรราก**: คงเหลือ = anchor (จำนวนที่นับได้ครั้งล่าสุด) − ที่ขายหลังวันนับ · ของออกไม่เก็บลงตาราง (คิดสดจาก `tmk_mp_skus`) → ยกเลิกใบเสร็จของกลับเข้าเอง · นับใหม่ = ทับ anchor
  - `lib/stockCount.js` (pure · **19 เทส**): `skuKey`/`normSizeStock` (XXL→2XL กัน SKU คนละตัว) · `latestAnchors`/`soldAfter`/`stockBalance`/`stockByDesign`/`designGrid` · `activeDesigns` (คุมเฉพาะลายที่ขายจริง) · `parseStockGrid` (auto-detect long/matrix) · `mergeStockRows`/`matchDesigns`/`pasteToGrid`
  - `lib/stockData.js` — fetch/save (upsert ทีละ 500 แถว) · `sessionsOf` (ประวัติการนับ) · graceful เมื่อยังไม่ migrate
  - `views-stock.jsx` — KPI 4 ใบ · ตารางรายลาย (คงเหลือ/นับได้/ขายหลังนับ/นับล่าสุด/ขาย N วัน) · กางกริดสี×ไซซ์ · **โหมดนับ** (พรีฟิลยอดระบบ + โชว์ส่วนต่างสด + เพิ่มสี/ไซซ์ใหม่ได้) · **นำเข้าตั้งต้น** (ไฟล์/วาง + พรีวิว + แถวที่ข้าม + ลายที่จับคู่ไม่ได้) · ประวัติการนับ
  - เมนู: เพิ่ม `stock` ใต้ "ยอดขาย" (`appNav` + i18n + `views-catalog` route) — LockPicker เห็นเองเพราะ derive จาก NAV_DEF
  - **migration ที่ user ต้องรันเอง**: `20260824-stock-counts.sql` (ยังไม่รัน — หน้าจะขึ้นแถบเตือนพร้อมชื่อไฟล์)
  - บั๊กที่เจอ+แก้ระหว่างทำ: `Number('')` = 0 ทำให้แถว "หัวบล็อกชื่อลาย" ถูกอ่านเป็นแถวข้อมูล · ชื่อลายที่อยู่เหนือหัวตารางไม่ถูกหยิบ

- ✓ **popup ออเดอร์ทั้งวัน — แยกรายคน (PART 113)** (24 ส.ค.) — `DashDayDetail`: ตาราง "คนทักรายคน" (ทัก/ใหม่/ปิดได้(isChatOrder)/%ปิด/ยอด) จาก funnelRows + ออเดอร์ของวัน · กดแถว = `sellerF` กรองทั้ง popup (สรุปวัน + คนทัก + รายการออเดอร์) · ปุ่ม "ดูทั้งหมด" กลับ
- ✓ **ใบสั่งผลิต PO (PART 113)** (24 ส.ค. · ต่อจากสต็อกเฟส 1)
  - migration `20260824-production-orders.sql` — 1 แถว/ใบ · items jsonb `[{design,color,size,qty,received}]` · สถานะ draft→ordered→producing→received|cancelled · `responsible` (แยกรายคน)
  - `lib/productionOrders.js` (pure · **10 เทส**): `nextPoId` (PO-ปีพ.ศ.เดือนวัน-ลำดับ) · `poTotals`/`poSummary` · `incomingBySku` (ของกำลังจะเข้า) · `poPeople` · **`buildReceiveAnchors`** = แปลง "รับเข้า" เป็นจุดอ้างอิงสต็อกใหม่ (ยอดคงเหลือ + ที่รับ) → ใช้สูตร PART 112 ตัวเดียว ไม่มีสูตรที่สอง
  - `views-stock.jsx`: แท็บ คงเหลือ | ใบสั่งผลิต · `PoPanel` (ตัวกรองสถานะ + ชิปผู้รับผิดชอบ + ป้ายเลยกำหนดรับ + แถบคืบหน้า) · `PoSheet` (สร้าง/แก้) · `PoReceiveSheet` (รับเข้า → เขียน anchor + อัปเดต/ปิดใบอัตโนมัติ) · ตารางคงเหลือเพิ่มคอลัมน์ "กำลังจะเข้า"
  - DOM smoke test `__tests__/stockPo-dom.test.jsx` (3 เคส: PoPanel · สถานะยังไม่ migrate · ตารางคนทักรายคน)
  - **migration ที่ user ต้องรันเอง — รวมเป็นไฟล์เดียวแล้ว**: `supabase/migrations/BUNDLE-20260824-crm-stock-po.sql`
    (รวม 5 ไฟล์: 20260821-realtime-targets · 20260824-crm-contacts · crm-activity-targets · stock-counts · production-orders)
    · ไฟล์ย่อยยังเก็บไว้เป็นต้นฉบับ/ประวัติ — **รันแค่ BUNDLE ไฟล์เดียวพอ**
    · ตรวจแล้ว: parse ด้วยไวยากรณ์ Postgres จริง (pg-query-emscripten) 28 statement ผ่าน · idempotent · ไม่มี disable RLS · จดลง tmk_migrations อัตโนมัติ · VERIFY คืน 1 แถว

## Done-when
- lint 0/0 · vitest ผ่าน (มีเทส DOM ของ component ใหม่) · vite build ผ่าน · ดูของจริงผ่าน harness (light/dark)
- ไม่แตะสูตรเงิน: CRM = LINE+โทร ของทีม CRM (D8) · ซื้อซ้ำ/RFM สูตรเดิม · เป้า CRM เดิม · ฟอร์มบันทึกประจำวันเดิม

## Stack
React 19 + Vite · shadcn/ui · recharts · Supabase (อ่านอย่างเดียวในงานนี้ ไม่มี migration)

## ✓ PART 114 — สต็อกยึดสินค้าเป็นแหล่งเดียว + ใช้คอมโพเนนต์กลางให้หมด (24 ส.ค. 69)
- **บั๊กที่เจอจากการตรวจ (ไม่ใช่จาก migration)**: ตัวจับ "ยังไม่ได้รัน migration" ใช้ regex ที่แมตช์แค่ *ชื่อตาราง* → error จริง (RLS/สิทธิ์/constraint) ถูกกลบเป็น "ต้องรัน migration ก่อน" ทั้งที่รันแล้ว
  - `lib/pgError.js` ใหม่ (6 เทส): แยกตามโค้ดจริง 42P01/PGRST205 (ไม่มีตาราง) · 42703/PGRST204 (ไม่มีคอลัมน์) · 42501/PGRST301 (RLS/สิทธิ์) · อื่น = error ธรรมดา + `pgErrorText` แนบโค้ดไปด้วยเสมอ
  - หน้าสต็อกขึ้นแถบแดง + ปุ่มลองใหม่เมื่อโหลดพัง (เดิมเงียบ โชว์หน้าว่าง) · CRM แจ้ง error จริงแทนที่จะเงียบ
- **realtime เป้า**: migration 20260821 เปิดฝั่ง DB ให้แล้ว แต่ไม่มีหน้าไหน subscribe → เพิ่ม `tmk_targets` (salePerf) · `tmk_monthly_history`/`tmk_crm_targets`/`tmk_targets` (saleDashboard) · `useMonthTarget` ฟัง `tmk_monthly_history`
- **ลาย/สี/ไซซ์ = ยึดจากหน้า "สินค้า"** — `lib/productCatalog.js` ใหม่ (9 เทส): merge `tmk_shirt_catalog` (ชนะ) + GOLDEN_DESIGNS (เติมช่องว่าง) · `productMatrix` (สี×ไซซ์เรียงมาตรฐาน) · `stockDesignNames` (แคตตาล็อก ∪ ของที่มีอยู่จริง) · `catalogResolver` (ชื่อ/รหัส → fallback resolver เดิม)
  - CountSheet กางช่องนับจากแคตตาล็อก (สี/ไซซ์ที่ยังไม่เคยขายก็นับได้) · ป้ายเตือนช่องที่ไม่มีในสินค้า · DOM test พิสูจน์ (3XL/แดง ที่ไม่เคยขาย ต้องโผล่)
  - ImportSheet จับคู่ชื่อลายจากแคตตาล็อกก่อน · PoSheet เลือกของจากแคตตาล็อกเหมือนกัน
- **ใช้คอมโพเนนต์ที่มีอยู่ให้หมด** (เลิกทำ UI ซ้ำ): `DesignCombobox`(+prop `items`)/`ColorSelect`/`SizeSelect` · `KpiCard`+`.kpi8` · `SortableTable cards` · `Field` (9 จุด) · `SellerCombobox`+staff · `CardHead` (2 จุด) · `Progress` · shadcn `Select` · `PersonChips`/`FilterChip` ใหม่ใน saleWidgets (ชิปกลาง)
- verify: **626 เทส (57 ไฟล์) เขียว · eslint 0/0 · build ผ่าน** · chunk แทบไม่ขยับ (+0.2KB)

## ✓ PART 115–116 — ประวัติ/ผลต่างการนับ + ชุด C (เร็ว/ปลอดภัย) + ชุด D (ใช้งานประจำวัน) · 24 ส.ค. 69
**สต็อก (PART 115)**
- `sessionVariance(counts, skus, sessionId)` (+6 เทส): ระบบคิด ณ วันนับ = anchor ก่อนหน้า − ขายระหว่าง (prev, countDate] · นิยามตรงกับ `stockBalance` (ขายวันเดียวกับวันนับ = ออกก่อนนับ)
- `CountHistory` (SortableTable + cards) + `SessionDetailSheet` (KPI 4 ใบ + ผลต่างราย SKU) · ยกเลิกรอบนับได้ (แอดมิน · confirm + audit + คงเหลือย้อนไป anchor ก่อนหน้า)
- `countedByDesign` → ป้ายสต็อกในหน้าสินค้าอ่านจากการนับจริง (เดิมอ่าน `tmk_products.stock` ของระบบคลังที่ถอดไปแล้ว = โกหก) · ตัวกรองเป็น ใกล้หมด(≤10)/นับได้ 0/ยังไม่เคยนับ

**ชุด C**
- `views-catalog.jsx` → lazy รายหน้า: chunk เมนู Sale 476KB → รายงานขาย 160KB · CRM 108KB · ออเดอร์ 68KB · สต็อก 54KB
- dataContext เลิกโหลด `tmk_products`/`tmk_orders`/`tmk_customers` + `tmk_customer_totals` ตอนเปิดแอป (17→14 query) และเอาออกจาก realtime/poll
- Spotlight ค้นจริง: `tmk_mp_orders`/`tmk_mp_customers` (debounce 250ms · 5 แถว/ประเภท) + ลายจากแคตตาล็อก · ลิงก์นำทางชี้ sub ที่มีอยู่จริง
- **RLS Tier 3**: `supabase/migrations/BUNDLE-rls-tier3.sql` — **รันแล้ว 24 ส.ค. 69** — เขียน/ลบ = admin/editor · audit log แก้ไม่ได้ · ครอบตารางใหม่อัตโนมัติ · ตรวจ parse ด้วย pg-query-emscripten
  - **ไม่รวม Tier 3b** โดยตั้งใจ: "ลบ=admin เท่านั้น" จะทำให้ editor พัง (แก้ออเดอร์/ส่งใบเสร็จซ้ำ/นำเข้าใหม่ ลบแถวตรงหลายจุด) · owner-read ทำครึ่งเดียวแล้ว %ปิดเพี้ยน
- **E2E ชุดแรก (Playwright)**: `e2e/*.public.spec.js` 3 เทสเขียว (ฟอร์มล็อกอิน · ปุ่มล็อกจนกรอกครบ+ยอมรับข้อตกลง · มือถือ 390px ไม่ล้น) + `auth.setup.js`/`money.app.spec.js` รอ `.env.e2e` · CI รันชุด public

**ชุด D**
- ปุ่ม ➕ มือถือในเมนู Sale เลิกเปิดฟอร์มระบบเก่า (กรอกแล้วหาย) → พาไปหน้าที่เพิ่มของจริง
- `OfflineBar` ทุกหน้า (เน็ตหลุด = บอกชัดว่ายังเซฟไม่ได้ · กลับมาแล้ว refresh ให้เอง) + เทส DOM
- หน้าหลัก: โฟกัสวันนี้ใช้ใบสั่งผลิตค้าง/เลยกำหนด แทนออเดอร์ระบบเก่า + ยอด "วันนี้ถึงตอนนี้"
- ตารางในเมนู Sale ตรวจแล้วครอบด้วย `CardTable` ครบ (แปลงเป็นการ์ดบนมือถืออยู่แล้ว) — ไม่ต้องแก้เพิ่ม

verify: **635 เทส เขียว · eslint 0/0 · build ผ่าน · e2e public 3/3**

## ✓ PART 117 — รอบตรวจบั๊ก (self-audit + code-review 4 ชุด) · 24 ส.ค. 69
ผู้ใช้สั่ง "เช็คว่าทำครบจริงไหม ไม่อวยตัวเอง + เช็คบัคทั้งหมด" → รัน /code-review (4 ชุดขนาน) + ตรวจข้ออ้างเองทีละข้อ
**พบบั๊ก 20+ ตัว แก้ครบทุกตัวที่แตะได้** (รายละเอียดในคอมเมนต์โค้ดแต่ละจุด)

จุดที่ "ผมอ้างไว้แล้วไม่จริง" และแก้แล้ว:
- `sessionVariance` ช้า O(rows×counts×skus) — วัดจริง **16 วิ/รอบ · 195 วิ ทั้งตาราง** (1,920 SKU × 12 รอบ × ขาย 8,000 บรรทัด) → ทำดัชนีครั้งเดียว เหลือ **27ms / 200ms** + `allSessionTotals` (คิดทุกรอบครั้งเดียว) + เทสยืนยันค่าตรงกัน
- `fetchStockCounts`/`fetchPurchaseOrders` ไม่ผ่าน cache → ดึงทั้งตารางทุกครั้งที่เข้าหน้า (สวนทางเป้า "ลด egress") → ใช้ `cachedFetchAll` + invalidate หลังเซฟ/ลบ
- Spotlight `.or()` พังถ้าคำค้นมี `,` `(` `)` → sanitize ก่อนยิง
- entry ใน What's New ไปต่อท้ายบล็อก 3.27.0 (ลงวันที่ 18 ส.ค.) → คนที่อ่าน 3.27.0 แล้วจะไม่เห็นของใหม่เลย → แยกเป็น **3.28.0 (24 ส.ค.)** · แถมแก้ไอคอน `chart` 2 จุดที่ไม่มีในชุด (ขึ้นเป็นจุดกลม)
- CI step E2E ที่เพิ่งเพิ่ม จะแดงทุกครั้ง (ไม่มี VITE_SUPABASE_* ใน CI → console.error) → ใส่ env จำลอง

บั๊กเงิน/ข้อมูลที่พบจากรีวิว (ของเก่าที่ค้างมาหลายรอบ):
- `salesDailyEntry`: ฟอร์มอ่าน key ตัวใหญ่ตรง ๆ → เซฟทับค่าแอดยุคเก่า (key ตัวเล็ก) เป็น 0 · `${ym}-31` = วันที่ไม่มีจริง (เดือน 30 วัน/ก.พ.) → เช็ค import ไม่ได้แล้วกลืน error · upsert ไม่คืน `deleted_at`
- `mergedMonth.fetchYearMergedActuals` ไม่ merge override → ยอด 2 ชุดในหน้าเดียว · YoY ปีก่อนใช้ `rec()` แทน `act()` → ปีหน้าเทียบกับ 0
- `%ปิดการขาย` มี 2 สูตรบนจอเดียวกัน → รวมเป็นสูตรเดียว (นับเฉพาะออเดอร์ของเซลล์ที่กรอกคนทัก) + 2 เทสใหม่
- `settingsMonthTargets` กลืน error ตอนอ่าน → เซฟทับเป้า/`meta` เดิมหาย → ล็อกไม่ให้เซฟ + แถบเตือน
- สต็อก: ไม่กรองใบยกเลิก (ของไม่กลับเข้าสต็อก) · กลืน error ยอดขาย (คงเหลือสูงเกินจริงเงียบ ๆ) · รับเข้าย้อนหลังหักซ้ำ · ช่วงข้อมูลไม่พอกับตัวเลือก 90/180 · เลือกวันอนาคตได้ · PO เลขชนกัน/เซฟทับยอดรับเข้า
- CRM: `todayISO` แบบ UTC (00:00–07:00 ลงวันผิด → กดซ้ำได้ไม่จบ) · ดึง contact เฉพาะเดือนที่ดู (snooze ข้ามเดือนหาย) · `cadence`/`owner` ไม่ถูกส่งต่อ · คีย์ลูกค้าใน drawer ไม่ใช้สูตรกลาง · ชิป "ทำแล้ว N" นับผิดกลุ่ม
- งาน/โครงการ: Cmd+Enter ในคอมเมนต์ = เซฟ+ปิดงาน · state พับคอลัมน์ข้ามโครงการ · เปลี่ยนสถานะจากลิสต์ไม่มี OCC · `myNameSet('')` จับพนักงานไม่มีอีเมลเป็น "ฉัน" · ชิป "ใน 7 วัน" นับไม่ตรงตัวกรอง · หน้าแชร์/ทางลัด `sales` ข้ามการล็อกหน้า
- dataContext: realtime ยังชี้ 4 ตารางที่เลิกโหลด → event เดียว = **โหลดใหม่ทั้งแอป**

**ยังไม่แก้ (ตั้งใจ)**: `supabase/functions/daily-sale-report/index.ts` — ยอดมาร์เก็ตเพลสที่กรอกมือถูกรวมใน "อื่นๆ" ของสรุปการชำระ (ถูกตามนิยาม แต่ป้ายอาจชวนงง) · ไฟล์นี้เป็นของ user (ห้าม commit) และต้อง `npm run build:edge` + deploy เอง

verify รอบสุดท้าย: **651 เทส (58 ไฟล์) เขียว · eslint 0/0 · build ผ่าน · e2e public 3/3**

## ✓ PART 118 — เคลียร์หนี้ 5 ข้อ (24 ส.ค. 69)
**หนี้ 5 — สต็อกกรองใบยกเลิก**: `excludeCancelled(skus, orders)` ใน `stockCount.js` (+5 เทส) · เทียบ `source:order_no` (ตาราง `tmk_mp_skus` มีคอลัมน์ `source` อยู่แล้ว แค่ `SKUS_SEL` ไม่ได้ดึง) · แถวเก่าที่ไม่มี source ถอยไปเทียบเลขล้วน

**หนี้ 3 — ลบโค้ดตาย** (รวม ~1,150 บรรทัด · 2 chunk หายจากบันเดิล)
- ลบ `modals-order.jsx` (325) · `modals-catalog.jsx` (379) · `modals-stock.js` — ไม่มีปุ่มไหนเปิดถึงตั้งแต่ PART 35 (ปุ่ม ➕ มือถือชี้ไปหน้าจริงแล้วใน PART 116) → chunk `modals-order` 20KB + `modals-catalog` 24KB หายไป
- `PublicTrackPage.jsx` (112) → เหลือข้อความสั้น ๆ ที่ route `?track=` (ข้อมูลมาจาก `tmk_orders` ที่ตายแล้ว = ค้นยังไงก็ไม่เจอ · เก็บ route ไว้เผื่อลูกค้าถือลิงก์เก่า)
- `mapToTMK`: ตัด section `products`/`orders`/`customers` → คืน `[]` เสมอ + **เทสล็อกไว้** (`mapToTMKMemo.test.js`) กันมีคนเอากลับมา · เทส memo ย้ายไปใช้ `brands` (memoSection แท้)
- `components.jsx` 710 → ~540 บรรทัด: ลบ lot/variant helpers, บาร์โค้ด code128, `stockMeta`, `SIZES`, `SHIRT_COLORS` (ทั้งหมด 0 ผู้ใช้) · ⚠️ ตอนตัดพลาดโดนบล็อก `ICONS`/`Icon` ไปด้วย — กู้คืนจาก HEAD แล้วใส่การแก้ของเซสชันกลับ (prop `style` + ไอคอน `loader`) · สแกนยืนยัน: ไอคอนที่ถูกเรียก 56 ตัว มีครบในชุด 63 ตัว

**หนี้ 2 — ตรรกะ UI ที่เคยพลาด ย้ายออกมาเทส**: `lib/uiLogic.js` ใหม่ (+12 เทส) — `bestWeekday` (เคสไม่มีวันจันทร์) · `dueCounts` (ชิปต้องนับตรงตัวกรอง) · `channelRows` (ช่องที่ทักแต่ปิด 0 ต้องไม่หาย) · `safeSearchTerm` · `mergeReceivedItems` (ห้ามย้อนยอดรับเข้า) · `plusDaysISO` (เวลาท้องถิ่น)
+ `__tests__/uiRegression-dom.test.jsx` (+4): pภาพ localStorage ต่อโครงการ · เป้าเดือนโหลดพลาด = ล็อกเซฟ + แถบเตือน · OfflineBar · Cmd+Enter ในช่อง `data-no-form-submit` ต้องไม่บันทึก+ปิดฟอร์ม

**หนี้ 1 — เทสของจริง**: ยังต้องรอ user ล็อกอิน · เขียน `e2e/money.app.spec.js` ครบเช็คลิสต์ 9 เคส (สต็อก/ประวัติ/PO/รายงาน %ปิดตรงกัน/CRM/สินค้า/โครงการ/มือถือ 390px) รอแค่ `.env.e2e`

**หนี้ 4 — RLS Tier 3b**: ไม่ทำตามที่ตกลง (ต้องรวบ `.delete()` 34 จุดใน 13 ไฟล์เป็น RPC ก่อน — งานใหญ่ · Tier 3 ที่รอ user รันปิดช่องหลักไปแล้ว)

verify: **675 เทส (60 ไฟล์) เขียว · eslint 0/0 · build ผ่าน · e2e public 3/3**

## ✓ PART 119 — สิทธิ์: ปิดช่องเงิน + Tier 3b แบบแคบ (24 ส.ค. 69)
คำถาม user: "ควรเพิ่มยศอีกไหม" → ตอบ **ไม่ต้องเพิ่มยศ** (ทีม <10 คน · มี `locked_sections` ล็อกรายหน้าอยู่แล้วซึ่งละเอียดกว่ายศ)
สิ่งที่ขาดจริงคือ 2 แกนที่ยศเดียวคุมไม่ได้ → ปิดด้วยการกั้นเฉพาะจุด ไม่ใช่เพิ่ม taxonomy

**(1) หน้า "เป้า & คอมมิชชั่น" → แอดมินเท่านั้น** — เดิม `need: 'edit'` = เซลล์ตั้งเป้า/เรตคอมตัวเองได้ (ช่องเงินตรง ๆ)
- `views-settings.jsx`: tab `need: 'admin'` + เนื้อแท็บ `_isAdmin && <TargetsView />`
- ซ่อนปุ่มลัด "ไปตั้งเป้า" ใน hero ของรายงานขายสำหรับ non-admin (กดแล้วเจอหน้าว่าง)
- **เทสล็อกกติกา** (`roleAccess.test.js` อ่านไฟล์จริง 3 เคส) กันแก้กลับเงียบ ๆ

**(2) `20260824-rls-tier3b-narrow.sql`** — **รันแล้ว 24 ส.ค. 69** — ทำเฉพาะที่ล็อกได้จริง
- §1 **ลบ = admin** 6 ตารางที่ไม่มี flow ของ editor ลบเลย: `tmk_stock_counts` (ปุ่มกั้น isAdmin อยู่แล้ว) · `tmk_production_orders` · `tmk_crm_contacts` (ยังไม่มีปุ่มลบ) · `tmk_monthly_history` · `tmk_daily_sales` (ใช้ soft-delete) · `tmk_crm_targets`
- §2 **เขียน = admin** 4 ตารางเงิน: `tmk_targets` · `tmk_crm_targets` · `tmk_monthly_history` · `tmk_settings` — แยก policy เป็น insert/update/delete เพื่อ **ไม่แตะการอ่าน** (ทุกคนยังเห็นเป้าเหมือนเดิม)
- ตรวจ: parse ด้วย pg-query-emscripten ทั้งไฟล์ + แยก parse SQL ใน `execute format(...)` ทีละก้อน · ไม่มี disable RLS/drop/truncate · VERIFY 4 บรรทัด + ROLLBACK เฉพาะไฟล์นี้
- **ไม่ทำ Tier 3b ตัวเต็ม**: §2 เดิม (ลบ=admin ทุกตาราง) พัง `.delete()` 34 จุดของ editor · §3 (owner-read) ทำ %ปิดเพี้ยนเพราะรายงานขายโชว์ทั้งทีม

**ที่เสนอแต่ user ยังไม่เอา**: แฟล็ก `see_team` (ให้ viewer ดูทั้งทีมได้โดยไม่ต้องเป็น admin — พี่ทัช/CEO)

## ✓ PART 120 — เดินเครื่องจริงบนเบราว์เซอร์ (24 ส.ค. 69)
user ล็อกอินให้ด้วยบัญชี **FAH (admin@tmk.co · ไม่ใช่แอดมิน · locked: settings/logs/flows/sales/catalog:report/catalog:shirts)** → ไล่กดของจริงทุกหน้าที่แก้

**พิสูจน์ว่าทำงานจริง**
- สต็อก: KPI 4 ใบ · ตารางเรียงได้ · ตัวเลือก 90/180 วัน/1 ปี · 26 ลาย "ยังไม่นับ"
- นับสต็อก: หัวข้อ "ลาย (จากสินค้า)" · เลือก **สิริกานต์ · JSK111** (รหัสจาก tmk_shirt_catalog ไม่ใช่ GOLDEN) → กางช่องนับ **27 ช่อง = 3 สี × 9 ไซซ์ ตามแคตตาล็อก** (รวมไซซ์ที่ไม่เคยขาย) + แถวเพิ่มสี/ไซซ์เป็น dropdown
- ใบสั่งผลิต: เลข PO-690824-001 · SellerCombobox "เลือกคนดูแลใบนี้" · DesignCombobox ลิสต์แคตตาล็อกจริง (กนก JKN111 · กระเป๋าผ้า CB1 · ของแถม GIFT)
- ประสิทธิภาพเซล: ช่องทางโชว์ครบ — Phone "ทัก 2 · ปิด 33" ขึ้นป้าย **ทัก?** (over flag ทำงาน)
- มือถือ 375px: overflow = **0** ทั้ง 5 หน้า (หน้าหลัก/CRM/ประสิทธิภาพเซล/ออเดอร์/สต็อก) · console error = 0

**บั๊กที่เจอจากการกดจริง (แก้แล้วทั้ง 3)**
1. **emoji 👋 ที่รายงานว่าลบแล้ว จริง ๆ ลบไม่ติด** (ใช้ `.replace()` โดยไม่ assert) → ลบจริงพร้อม assert
2. **เมนู "ตั้งค่า" ใน dropdown โผล่ให้คนที่ถูกล็อกหน้านี้** — กดแล้วเงียบ ไม่มีอะไรเกิดขึ้น (อีกจุดในแอปแสดงล็อกอยู่แล้ว) → `disabled` + ไอคอนกุญแจ + ป้าย "ถูกล็อก"
3. **ปุ่ม ➕ มือถือในเมนู Sale เป็นปุ่มหลอก** — PART 116 แก้จาก "เปิดฟอร์มยุคเก่า" เป็น "พาไปหน้านั้น" แต่กดบนหน้าเดิม = ไม่เกิดอะไร → ซ่อนใน Sale ไปเลย (ทุกหน้ามีปุ่มเพิ่มของตัวเองบนมือถืออยู่แล้ว) เหลือ FAB = สร้างงานใหม่อย่างเดียว

**ยังไม่ได้ทดสอบ (ตั้งใจ)**: การกด "รับสาย/ไม่รับ/เลื่อน" ใน CRM — เขียนลง `tmk_crm_contacts` จริงและไม่มีปุ่มลบใน UI → ไม่กดเพื่อไม่ให้ข้อมูลจริงเปื้อน

### รอบสอง — บัญชีแอดมิน (tmktestweb@workspace.co)
- **%ปิดการขาย รวมสูตรสำเร็จ (พิสูจน์ด้วยเลขจริง)**: การ์ด KPI = **17%** (ปิด 461 / 2,790 คนทัก) · บรรทัดรวมในตาราง "ยอดต่อช่องทาง" = **ทัก 2,790 → ปิด 17%** ตรงกันเป๊ะ (ก่อนแก้เป็นคนละเลข) · Phone ทัก 2 ปิด 33 ขึ้นป้าย "กรอกไม่ครบ"
- **ตั้งค่า → เป้า & คอมมิชชั่น**: แอดมินเปิดได้ · เป้าเดือนโหลดค่าจริง (เป้าช่องทางรวม ฿930,000 · งบแอด ฿160,500) · ไม่มีแถบ error → guard ตอนอ่านพลาดไม่ false-positive
- **หน้าสินค้า**: 47 รายการ · ตัวกรอง "สต็อก" ไม่โผล่เพราะยังไม่มีข้อมูลนับ (ตรงตามที่ออกแบบ)
- **บอร์ดโครงการ**: พับคอลัมน์ที่โครงการ A (`tmk-kb-collapsed-__general__ = ["todo"]`) → สลับไป Artist flow **ไม่มีคอลัมน์ไหนติดพับมา** = fix per-project ทำงาน
- **popup วันรายละเอียด**: ตาราง "คนทักรายคน · 2 คน" (TUKTA ปิดได้ 8 ฿5,599 · FAH 3 ฿847) + ปุ่มเลื่อนวัน ✓ (PART 113)

**ยังไม่ได้ทดสอบ (ต้องเขียนข้อมูลจริง — รอ user อนุญาต)**
- วงจรสต็อกเต็ม: นับ → บันทึก → คงเหลือ/ป้ายในหน้าสินค้า → ประวัติการนับ + คอลัมน์ผลต่าง → ยกเลิกรอบ
- บันทึกการติดต่อ CRM (รับสาย/ไม่รับ/เลื่อน) — ไม่มีปุ่มลบใน UI

## ✓ PART 121 — กู้ข้อมูลยุคก่อนรวมระบบ (24 ส.ค. 69)
user: "ยอดเดือน พ.ค./มิ.ย. หายไปไหน" → ตรวจฐานข้อมูลจริง (query อ่านอย่างเดียวผ่าน session ที่ user ล็อกอิน)

**ผลตรวจ**: `tmk_daily_sales` 84 แถว **เริ่ม 1 มิ.ย. 69** (ไม่มี พ.ค. — user ยืนยัน "ระบบเริ่ม มิ.ย.") · `tmk_orders`/`tmk_customers` ยุคเก่า = **0 แถว** · `tmk_mp_orders` เริ่ม 15 ก.ค.
โครงข้อมูลยุคเก่า: `channels: { facebook|shopee|tiktok|crm: { ad, rev, ord, inq, newC, oldC } }` + คอลัมน์แยก

**3 สาเหตุที่ทำให้มองไม่เห็น (แก้ครบ)**
1. `LEGACY_CHANNEL_IDS` ไม่มี `crm` → ยอดช่องนี้ถูกทิ้งทุกจุด (รายงาน + edge LINE) — **มิ.ย. ฿113,749 · ก.ค. ฿70,095** → map `crm → Phone` + เพิ่มใน `LEGACY_REV_COLS` (เทสยืนยันยอด 30 มิ.ย. = ฿24,297.47 ตรงหน้าจอ user)
2. ขอบปฏิทินมาจาก `tmk_mp_orders` อย่างเดียว → เลือกย้อนก่อน 15 ก.ค. ไม่ได้ → `mergeBounds()` (+3 เทส) รวมขอบจาก orders ∪ daily ∪ funnel
3. `readDailyChannels` อ่านแค่ `ad`/`rev` → เพิ่ม `stats` (ord/inq/newC/oldC) + `manualExtraStats()` (+6 เทส) กันนับซ้ำ: วันที่มี**ออเดอร์จริง** (ใบเสร็จ Shipnity ก็นับ ไม่ใช่แค่ไฟล์ import) ใช้ของจริง · วันที่มีแถว funnel ใช้ของ funnel · **ตั้งแต่ 1 ส.ค. ไม่เอาที่กรอกมาใช้เลย** (ฟอร์มเก่าเขียน ord/inq ค้างไว้ = เบิ้ล)

**ผลลัพธ์จริงบนหน้าจอ (ช่วง 1 มิ.ย.–24 ส.ค.)**: ยอด **฿2,474,839** (เดิมดูได้แค่ ส.ค. ฿590,927) · Phone ฿201,839 (CRM ยุคเก่ากลับมา) · ออเดอร์ 4,761 · คนทัก 12,492 · %ปิด 25% — **การ์ด KPI กับตารางช่องทางตรงกันทุกตัว**

**บั๊กที่เจอระหว่างทาง (แก้แล้ว)**
- `CountUp` ค้างเลขเก่าถาวรเมื่อแท็บถูกซ่อน (rAF ไม่ทำงาน) → เพิ่ม guard: hidden = ตั้งค่าจริงทันที + timeout snap
- KPI ออเดอร์/ลูกค้าใหม่/คนทัก/%ปิด ยังใช้เฉพาะออเดอร์รายใบ ขณะที่ตารางรวมยุคเก่า → ผูกให้ใช้ชุดเดียวกันเมื่อช่วงคาบยุคเก่า
- แถบอธิบาย "ยุคก่อนรวมระบบ N วัน" ใต้หัวข้อตัวชี้วัดหลัก

⚠️ **แก้ที่ `_shared/saleFormulas.js` → รายงาน LINE ใช้ร่วม** ต้อง `npm run build:edge` + paste ใหม่ (ยอดในไลน์จะขยับตามยอด CRM ที่เคยหาย)

verify: **700 เทส (60 ไฟล์) เขียว · eslint 0/0 · build ผ่าน · ตรวจบนเบราว์เซอร์จริงด้วยบัญชีแอดมิน**

## ✓ PART 122 — รื้อหน้าแรก (1 ก.ย. 69)
user เลือกจากเมนูงานถัดไป: "รื้อหน้าแรก เอาให้สุด ๆ" → เอาครบทั้ง 4 บล็อกที่เสนอ

**ปัญหาเดิม** (ของเก่าไม่ได้ว่างเปล่า — มี โฟกัสวันนี้ / สรุปเมื่อวาน / แคมเปญ / ทีมวันนี้ อยู่แล้ว)
1. ตัวเลขเงินมีแค่ "เมื่อวาน" — ไม่มียอดวันนี้ ไม่มีเป้าเดือน ทั้งที่ `buildPerf` + `useMonthTarget` + `fetchMergedMonth` พร้อมใช้
2. แคมเปญกินคอลัมน์ขวาทั้งคอลัมน์ (พื้นที่ดีที่สุดให้กับสิ่งที่ไม่ใช่เส้นเงิน)
3. "ต้องทำวันนี้" มีแค่ 2 แหล่ง (งานค้าง + ใบสั่งผลิต)
4. ทีมวันนี้ = presence ล้วน ไม่มียอดรายคน

**โครงใหม่** (`src/homeView.jsx` — แยกออกจาก views-1.jsx ที่เหลือแค่ TeamTodayCard/CampaignsCard)
- แถวเงิน: **ยอดวันนี้** (เลข 44px + Δ เทียบเฉลี่ย 7 วัน + สปาร์คไลน์รายวัน + ออเดอร์/คนทัก/%ปิด) | **เกจเป้าเดือน** (`TargetGauge` ตัวเดียวกับรายงานขาย)
- แถวงาน: **ต้องทำวันนี้** (5 แหล่ง เรียง bad→warn→info) | **อันดับเซลล์เดือนนี้** (%เป้า + ยอดวันนี้รายคน)
- แถวล่าง: ทีมวันนี้ | แคมเปญ (ย่อลง)

**กติกาเลขที่ต้องจำ** — หน้าแรกห้ามคำนวณเงินเอง
- ยอด/ออเดอร์ **ทั้งบริษัท** → `fetchMergedMonth` (channelTable) = สูตรเดียวกับรายงานขาย · **รวมยอดมาร์เก็ตเพลสกรอกมือ** ซึ่งผลรวม `buildPerf` รายคนไม่มี
- ยอด **รายคน** (อันดับเซลล์/คนทัก/%ปิด) → `buildPerf` = สูตรเดียวกับประสิทธิภาพเซล
- เอา 2 ฝั่งมาสลับกันเมื่อไหร่ = หน้าแรก ≠ รายงานขาย (มีเทส DOM ล็อกไว้)

**ตรรกะใหม่ = `src/lib/homeAgg.js`** (pure · 28 เทส): `teamDaily` · `todayPulse` (ค่าที่ไม่มีข้อมูลคืน null ไม่ใช่ 0 — กัน "▼ -100%" ตอนวันที่ 1) · `monthPace` · `sellerRank` (ตัดแถว "ไม่ระบุเซลล์") · `buildTodos` · `missingFunnelYesterday` (เช็ค**เมื่อวาน** ไม่ใช่วันนี้ — คนทักกรอกตอนจบวัน ถ้าเช็ควันนี้จะเตือนผิดทุกเช้า) · `countNoSeller`

**perf — regression ที่เจอและแก้แล้ว** (วัดด้วย git worktree เทียบ HEAD)
| | index (gzip) | vendor-charts preload |
|---|---|---|
| ก่อน | 369.9 KB (93.4) | ไม่โหลด |
| หลังรื้อ (พลาด) | 519.3 KB (136.0) | **+104 KB** |
| หลังแก้ | 416.1 KB (105.5) | ไม่โหลด |
- สาเหตุ: หน้าแรก static-import `charts.jsx` (→ recharts) และ `saleDashboardMerged.jsx` ทั้งที่ App.jsx โหลดหน้าแรกแบบ static = เข้า first paint (พัง PART 95)
- แก้: `useMonthTarget` แยกไป `src/lib/monthTarget.js` (ไม่มี charts · saleDashboardMerged re-export ต่อ) · เกจ/สปาร์คไลน์ย้ายไป `src/homeCharts.jsx` แล้ว `lazy()` · ใบสั่งผลิต/สต็อกเป็น dynamic import ใน effect · ตัวเลขฮีโร่เลิกใช้ `CountUp` (ไม่ต้องรอ chunk กราฟ + เลี่ยงบั๊ก rAF ตอนแท็บซ่อน)
- สต็อกหมด/ติดลบ โหลดตอน `requestIdleCallback` (ต้องดึงยอดขายตั้งแต่วันนับล่าสุด = ก้อนใหญ่)

verify: **739 เทส (63 ไฟล์) เขียว · eslint 0/0 · build ผ่าน** · `src/__tests__/homeView-dom.test.jsx` (6 เทส) เรนเดอร์หน้าจริง

## ✓ PART 123 — ขึ้นเดือนใหม่แล้วไม่พัง (1 ก.ย. 69)
user: "กดไรไม่ได้เลย · เลื่อนเดือนใหม่แล้วข้อมูลอะไรไม่เปลี่ยน · เดือนเก่าต้องอยู่ครบ · ใช้ได้ถึงปลายปี"
ตรวจตอนวันที่ 1 ของเดือนพอดี = เคสที่แย่ที่สุด · พิสูจน์ด้วยการรันโค้ดจริง ไม่ได้เดา

**A1 · รายงานขายเปิดมาว่างทั้งหน้าทุกวันที่ 1**
`presetRange('month','2026-09-01')` → `{from:'2026-09-01', to:'2026-09-01'}` = วันเดียว ยังไม่มีออเดอร์
→ หลัง bounds โหลดเสร็จ ถ้า `bnd.max < ต้นเดือนปัจจุบัน` **และผู้ใช้ยังไม่ได้เลือกช่วงเอง** → ถอยไป preset `d30` + แถบ role=status บอก "…ยังไม่มีข้อมูล — กำลังแสดง 30 วันล่าสุด" (กดปิดได้)

**A2 · หน้าแรก "เมื่อวาน / เฉลี่ย 7 วัน" ขึ้น "—" ทุกวันที่ 1** (บั๊กที่สร้างเองใน PART 122)
`todayPulse` เดิมอิง index ในเดือน → ข้ามขอบเดือนไม่ได้
→ เขียนใหม่ให้อิง **วันที่จริง**: `dailySeries(mmCur, ymCur, mmPrev, ymPrev, leadsByIso)` ต่อ 2 เดือนเป็นเส้นเดียว แล้ว `todayPulse(series, todayIso)` เลือกหน้าต่าง 7 วันปฏิทิน (วันที่ขาดหายไม่ถูกดึงมาปน)
→ `useHomeMoney` ดึง `fetchMergedMonth(prevMonth)` เพิ่ม**เฉพาะวันที่ 1–8** ของเดือน (หลังจากนั้นไม่ต้อง)

**A3 · หน้าแรกเตือนผิด "ยังไม่กรอกคนทัก" ทั้งทีม ทุกวันที่ 1** (บั๊กที่สร้างเอง)
เมื่อวาน = 31 ส.ค. แต่ funnel ที่ดึงมาเป็นของ ก.ย. เท่านั้น → `missingFunnelYesterday` คืนทุกคน
→ funnel ดึงจาก `min(ต้นเดือน, เมื่อวาน)` เสมอ + ใช้ **เป้าของเดือนที่เมื่อวานสังกัด** ตัดสิน (`targetsForYesterday`) · มีเทส DOM ล็อกว่า `gte <= เมื่อวาน`

**A4 · เป้าทั้งระบบกลายเป็น 0 ทุกวันที่ 1**
`tmk_targets` / `tmk_crm_targets` / `tmk_monthly_history` เก็บเป็นแถวรายเดือน อ่านด้วย `.eq('month', …)` ไม่มีการสืบทอด
→ เกจเป้าเดือนดับ · %เป้ารายคนหาย · **ค่าคอมทุกคน 0** · **ทีม CRM ว่าง** (ทีม CRM = คนที่มีเป้า CRM เดือนนั้น)
→ **ไม่สืบทอดเงียบ ๆ** (เป็นเส้นเงิน เสี่ยงเกิน) — เพิ่มแถว `target-gap` ใน "ต้องทำวันนี้" เตือน**เฉพาะแอดมิน** พร้อมพาไป ตั้งค่า → เป้า/คอม ที่มีปุ่ม "คัดลอกจากเดือนก่อน" อยู่แล้ว
→ แก้ `copyPrevPeople` ที่ลอกแค่ `sales_target`/`commission_rate`/`crm_target` — เพิ่ม `calls_target`/`answer_rate_target` ที่ตกหล่นทุกเดือน

**B1 · หน้า CRM ค้างเดือนเก่าถาวร**
`usePersistedState('tmk-crm-month', เดือนปัจจุบัน)` — ค่า default ใช้แค่ครั้งแรก พอเขียน localStorage แล้วไม่มีวันขยับ
→ hook ใหม่ `usePersistedMonth(key)` เก็บคู่ `{m, at}` · `at` ไม่ใช่เดือนปัจจุบัน = ค้าง ทิ้ง · ยังเลือกย้อนเดือนได้ตามปกติภายในเดือนนั้น · ค่ารูปแบบเก่า (สตริงล้วน) ไม่พัง

**C · ข้อมูลเดือนเก่า — ตรวจแล้วปลอดภัย ไม่ต้องแก้**
`tmk_daily_sales` โหลดย้อน 37 เดือน (ถึง ~2029) · ไม่มีโค้ดเขียนทับ `actual` ใน `tmk_monthly_history` · หน้าตั้งค่าเป้าล็อกฟอร์มถ้าอ่านค่าเดิมไม่สำเร็จ · ปฏิทินย้อนถึงวันแรกที่มีข้อมูลจริง (`mergeBounds`)

**ยังไม่ได้ตรวจ**: ค่าคอมรอบตัด 26→25 ช่วงคาบเกี่ยว · แท็บที่เปิดค้างข้ามเที่ยงคืนข้ามเดือน (`curMonth()` ไม่มีอะไร trigger re-render)

verify: **756 เทส (64 ไฟล์) เขียว · eslint 0/0 · build ผ่าน · playwright public 3/3** · index 421 KB (gzip 107) · vendor-charts ยังไม่เข้า first paint

### PART 123b — รอบไล่บั๊กย้ำ (1 ก.ย. 69)
user: "เช็คบัคย้ำต่อ เช็คอะไรแปลก ๆ มาด้วย"

**🔴 เดือน = UTC ปนกับ วัน = เวลาเครื่อง** (หนักสุด · อยู่ในเส้นเงิน)
`salePerfAgg.curMonth()` และ `MonthPicker.curYm()` ใช้ `toISOString()` (UTC) แต่ `todayISO()`/`getDate()` ใช้เวลาเครื่อง
พิสูจน์ที่ 2026-08-31T23:00Z (= 1 ก.ย. 06:00 ไทย): `local=2026-09-01 · curMonth=2026-08 · getDate=1`
ผลใน `buildPerf`: `dim=31 (ส.ค.)` คู่กับ `daysPassed=1` → **projected = ยอดทั้งเดือน × 31** · pace ขึ้น "นำเป้า" ทุกคน · salePerf เปิดมาเป็นเดือนก่อน · `MonthPicker max={curMonth()}` ล็อกไม่ให้เลือกเดือนปัจจุบัน · หน้าแรกโหลดเดือนก่อนมาแปะป้าย "เดือนนี้"
เกิดทุกวันที่ 1 ช่วง 00:00–07:00 → แก้ทั้ง 3 จุดให้ใช้เวลาเครื่อง (+ `receiptParse` ที่เตือน "วันที่เป็นอนาคต" ผิดด้วยเหตุเดียวกัน)
เทส `lib/__tests__/timeLocal.test.js` ล็อก invariant **`curMonth() === todayISO().slice(0,7)`** ที่ 4 ช่วงเวลา (ขอบเดือน · ขอบปี · เคสปกติ) — ต้องรันด้วย `TZ=Asia/Bangkok` ถึงจะจับได้

**🟠 "อ่านเป้าไม่ได้" ถูกกลืนเป็น "ไม่มีเป้า"** (บั๊กที่ PART 123 สร้างขึ้นเอง)
`fetchTargets` คืน `[]` ทั้งตอนไม่มีแถวและตอน error → คำเตือนใหม่ "ยังไม่ได้ตั้งเป้าเดือนนี้" เด้งผิดเวลา RLS/เน็ตพลาด และแอดมินอาจไปกดคัดลอกเป้าทับของจริง
→ เพิ่ม `fetchTargetsResult()` คืน `{rows, error}` (ตัวเดิม delegate ต่อ ไม่กระทบผู้เรียกอื่น) · หน้าแรกเตือนเฉพาะเมื่อ `targetsReadOk`
→ เทส DOM ผ่าน mutation check แล้ว (ถอด guard ออก = เทสแดงทันที)

**🟡 cleanup ของ requestIdleCallback ผิดคู่** — เบราว์เซอร์ที่มี `requestIdleCallback` แต่ไม่มี `cancelIdleCallback` จะไปเรียก `clearTimeout` กับ handle คนละชนิด = ไม่ถูกยกเลิกจริง

**ตรวจแล้วไม่มีปัญหา**: `addEventListener` ทุกจุดมี cleanup ครบ (7 จุด) · ไม่มี TODO/FIXME ค้าง · localStorage key ไม่ชนกัน · ไม่มี `.single()` ที่เสี่ยง null · `usePersistedState` ไม่มีที่ไหนใช้ default จากเวลาปัจจุบันอีกแล้ว · `dailyFromDate`/`shiftISO` ที่ใช้ UTC เป็นการใช้แบบ round-trip ถูกต้อง (ไม่ใช่บั๊ก)

verify: **762 เทส (65 ไฟล์) เขียวทั้ง TZ=UTC และ TZ=Asia/Bangkok · eslint 0/0 · build ผ่าน · playwright 3/3**

### PART 123c — %ปิดสูตรเดียวทั้งระบบ + เตือนเป้าให้ทันรอบคอม (1 ก.ย. 69)
user เลือกจากรายงานสำรวจ: "1-2 ก่อน"

**1) %ปิดการขายใช้คนละสูตร 2 หน้า**
`salesOverviewAgg.channelTable` (รายงานขาย) นับตัวเศษเฉพาะออเดอร์ช่องแชทของ **เซลล์ที่กรอกคนทัก**
`salePerfAgg.buildPerf.team` (ประสิทธิภาพเซล + หน้าแรก) นับ **ทุกออเดอร์ช่องแชท**
พิสูจน์: TUKTA กรอกคนทัก 40 ปิด 10 · FAH ไม่กรอกเลยแต่มีออเดอร์แชท 10 → รายงาน 25% · perf 50%
เหตุผลที่สูตรรายงานถูก: ตัวส่วนมีแค่คนที่กรอก ถ้าตัวเศษนับคนที่ไม่กรอกด้วย = คนละกลุ่มกัน (และ v3.27 ตัดสินไว้แล้ว แค่ยังไม่ตามไปแก้ perf)
→ เพิ่ม `chatClosedOf(rows, funnel)` ใน `salePerfAgg.js` (fallback = รวมทั้งหมด เมื่อไม่มีใครกรอกคนทักเลย · ตรงกับ channelTable)
→ ใช้ทั้งใน `buildPerf.team` และ `salePerf.teamView` (ที่รวมใหม่หลังกรองบนจอ)
→ `lib/__tests__/closeRateParity.test.js` (5 เทส) บังคับให้สองสูตร**ต้องได้เลขเท่ากัน** ตลอดไป
⚠️ **ตัวเลข %ปิดบนหน้าประสิทธิภาพเซลจะลดลงจากเดิม** — ของเดิมสูงเกินจริง ไม่ใช่ของใหม่ต่ำผิด

**2) ค่าคอมเป็น 0 ตั้งแต่วันที่ 26 ไม่ใช่วันที่ 1**
`commissionCycleSheet` ดึง `fetchTargets(currentCycleEndMonth(today, cutoff))` → ตั้งแต่วันที่ 26 รอบไปจบเดือนหน้า
ถ้าเดือนนั้นยังไม่มีเป้า → `buildCycleRows(orders, {})` → `comm = 0` ทุกคน (พิสูจน์: มีเป้า 12,000/7,500 → ไม่มีเป้า 0/0)
คำเตือนที่ PART 123 ใส่ไว้ขึ้นวันที่ 1 = **สายไป 5–6 วัน**
→ หน้าแรกเช็คเป้าของ "เดือนที่รอบคอมจะไปจบ" ด้วย (`cycleEndMonthSafe` อ่านวันตัดจาก `tmk_settings`) · แถวเตือนบอกทั้งสองเดือนในแถวเดียว
→ ป๊อปอัพค่าคอม: ถ้าทั้งรอบไม่มีใครมีเป้า ขึ้นแถบเหลืองบนสุด "ค่าคอมรอบนี้ยังเป็น 0 ทั้งกระดาน · ยอดขายถูกต้องแล้วแต่คำนวณคอมไม่ได้" + ปุ่มไปตั้งเป้า (เดิมมีแต่บรรทัด 11px ท้ายป๊อปอัพ)

**บั๊กที่เทสจับได้ระหว่างทาง (ของที่เพิ่งเขียนเอง)**
เอา query วันตัดรอบไปใส่ใน `Promise.all` ก้อนเดียวกับยอดขาย → ถ้า `tmk_settings` พลาด (คอลัมน์ยังไม่ migrate/RLS) **ทั้งหน้าตกลง catch แล้วยอดขายหายหมด**
→ แยกเป็น `cycleEndMonthSafe()` ที่กันพังทุกชั้น · **กติกา: query ของเสริมห้ามอยู่ใน Promise.all เดียวกับข้อมูลหลัก**
→ เทส `หน้าแรก · ทนต่อ query เสริมที่พัง` ผ่าน mutation check (ใส่โค้ดเปราะกลับ = แดง 4 เคส)

verify: **772 เทส (66 ไฟล์) เขียวทั้ง TZ=UTC และ TZ=Asia/Bangkok · eslint 0/0 · build ผ่าน · playwright 3/3**

### PART 123d — เก็บกวาด + ของเล็ก (1 ก.ย. 69)
user: "ข้อ 4-5"

**⚠️ ข้อ 4 ที่ผมรายงานไว้ ผิด — ไม่ใช่โค้ดตาย 7 ไฟล์ มีแค่ 1**
| ไฟล์ | ความจริงหลังตรวจลึก |
|---|---|
| `realtime/{entityStore,eventDedup,featureFlags,presenceManager,topicBuilder}.js` | **primitive ที่ตั้งใจสร้างไว้** ตาม `docs/implementation/REALTIME-C2-PLAN.md` ซึ่งอ้างถึงตรง ๆ ว่า "(มีแล้ว·tested)" · header เขียน "ยังไม่ wire" — ลบ = ทิ้งงานที่วางแผนไว้ |
| `lib/aiExtract.js` | edge function `supabase/functions/ai-extract/` มีอยู่จริง + `docs/PLAN-STOCK.md:52` วางไว้ใช้ตอนรับของจากโรงงาน — โค้ดมาก่อน UI |
| `src/modals.jsx` | ตายจริง (13 บรรทัด · ไม่มีใคร import) → **ลบแล้ว** |

→ แทนที่จะลบ: เขียน `src/realtime/README.md` แยกชัดว่าอันไหน wired อันไหนรอ Phase 2/3 + ปักหมาย `⚠️ ยังไม่ wire … อย่าลบเพราะ "ไม่มีใคร import"` บน header ทั้ง 5 ไฟล์
เพราะเครื่องมือหา dead code (และผมเอง) จะรายงานว่ามันตายทุกครั้ง
**เทส 31 เคสในโฟลเดอร์นั้นคุมโค้ดที่ยังไม่ถูกรันจริง — ตั้งใจให้เป็นแบบนั้น ไม่ลบเพื่อให้เลขสวย**

**ข้อ 5a · คำตอบเก่าทับคำตอบใหม่ (race)** — `useHomeMoney` ไม่มี guard · realtime ยิง reload ซ้อนกันแล้วรอบที่ตอบช้ากว่าเขียนทับยอดล่าสุดเงียบ ๆ
→ `seqRef` นับรอบ ยอมรับเฉพาะรอบล่าสุด + เพิ่ม seq ตอน unmount (กัน setState หลัง unmount ด้วยตัวเดียวกัน)
→ เทส `reload ซ้อนกัน` (รอบแรกช้า 400ms ให้เลขเก่า · รอบสองเร็วให้เลขใหม่) — **เทสแดงจริงก่อนแก้** ไม่ใช่เทสผ่านฟรี
   บทเรียนระหว่างทาง: เวอร์ชันแรกของเทสผ่านทั้งที่ยังไม่แก้ เพราะ `waitFor` กินเวลาจนรอบแรกจบไปก่อนจะยิงรอบสอง → ต้องจับ `reload` แบบ sync หลัง `render()`

**ข้อ 5b · `select('*')` บน `tmk_sales_funnel`** → เปลี่ยนเป็น `FUNNEL_SEL` เฉพาะ **4 จุดที่อ่านอย่างเดียว** (homeView · salePerf ×2 · mergedMonth)
ตรวจก่อนแก้: ฝั่งอ่านแตะแค่ `date/salesperson/leads/voice` (+ legacy cols) = อยู่ใน FUNNEL_SEL ครบ · `r.note` ที่เห็นใน salesOverviewAgg เป็นของ `tmk_daily_sales` คนละตาราง
**ไม่แตะ 3 จุดใน `views-sale-submit.jsx`** — เป็นฟอร์มที่อ่านมาแล้วเขียนกลับ ถ้า select แคบไปเสี่ยง upsert ทับคอลัมน์ที่ไม่ได้ดึงมา

**ข้อ 5c · touch target — ผมวัดผิดมาตรฐาน ไม่ต้องแก้**
`h-7` = 28px สูง กว้างตามข้อความ → เกิน **24×24 CSS px ของ WCAG 2.2 AA (Target Size Minimum)** ซึ่งเป็นเกณฑ์ของเว็บ
เลข 44px ที่ผมอ้างคือ Apple HIG สำหรับแอป native · แอปนี้ใช้ `h-7`/`h-8` รวม 54 จุดทั้งระบบ แก้เฉพาะหน้าแรกจะหลุดสไตล์เปล่า ๆ

**ข้อ 5d · `fetchMergedMonth` คืน null สำหรับเดือนก่อน 1 ส.ค. 69** — moot แล้ว cutoff อยู่ในอดีตถาวร เดือนก่อนหน้าจากนี้ไปเป็นยุคใหม่ตลอด ไม่ต้องแก้

verify: **773 เทส (66 ไฟล์) เขียวทั้ง TZ=UTC และ TZ=Asia/Bangkok · eslint 0/0 · build ผ่าน · playwright 3/3**

### PART 123e — ถังขยะลบยอดเงินถาวรได้ (1 ก.ย. 69)
user: "ข้อสามต่อเลย"

**ปัญหา**: `TRASH_TABLES` มี `tmk_daily_sales` → ปุ่ม "ลบถาวร" hard-delete ยอดขาย/ค่าแอด/คนทักทั้งวัน
- ฝั่งเว็บเช็คแค่ `guardEdit()` ขณะที่ policy ฝั่ง DB (Tier 3b) ตั้ง `delete = admin` ไว้แล้ว → editor กดแล้วเจอ error RLS งง ๆ แทนที่จะถูกกันตั้งแต่แรก
- ข้อความยืนยันเดิม: `ลบถาวร "2026-06-30"? ลบแล้วกู้คืนไม่ได้อีก` — ไม่บอกว่านั่นคือเงินทั้งวัน
- **ต้องเก็บ soft-delete/restore ไว้** — "ลบวัน" จากหน้ากรอกยอดเป็น soft-delete แล้วกรอกใหม่ได้จริง (`modals-sale.jsx:270` · `salesDailyEntry.jsx:119`) ตัดออกจากถังขยะไม่ได้

**แก้**: แยก config ออกเป็น `src/lib/trashTables.js` (pure · 9 เทส)
- `adminOnly` / `money` ต่อแถว → `needsAdminToPurge(meta)` (ไม่รู้จัก = ต้องแอดมิน · ปลอดภัยไว้ก่อน) · `purgeWarning(meta, name)` บอกว่ากำลังทำลายอะไร
- ตัด `tmk_products` / `tmk_customer_segments` ออก (ตารางยุคเก่า 0 การอ้างอิง · เลิกโหลดตั้งแต่ PART 116/109) → 9 → 7 query ต่อการเปิดหน้า
  ⚠️ ถ้าเคยมีแถว soft-deleted ในสองตารางนั้น จะเข้าไม่ถึงจากถังขยะอีก — ยอมรับได้เพราะฟีเจอร์ถูกถอดไปหมดแล้ว กู้มาก็ไม่มีที่แสดง
- เลิกกลืน error: เดิม `if (r.error) return;` ทำให้หมวดที่อ่านไม่ได้หายเงียบ → ถังขยะว่างเพราะ error ดูเหมือน "ไม่มีของ" · ตอนนี้เก็บชื่อหมวดที่พลาดมาขึ้นแถบเตือน + ปุ่มลองใหม่

**แก้คอมเมนต์ migration ที่เขียนผิด** — `20260824-rls-tier3b-narrow.sql` บรรทัด 18 เขียนว่า
`tmk_daily_sales … ไม่มีจุดลบใน FE เลย` ซึ่ง**ไม่จริง** (ผมเขียนเองตอนทำ Tier 3b โดยไม่ได้ตรวจถังขยะ)
→ แก้ข้อความให้ตรงความจริง + ระบุว่าเป็นการแก้คำอธิบายวันที่ 1 ก.ย. · **ไม่แตะบรรทัด SQL แม้แต่บรรทัดเดียว** (ไฟล์รันไปแล้ว)

verify: **782 เทส (67 ไฟล์) เขียวทั้ง TZ=UTC และ TZ=Asia/Bangkok · eslint 0/0 · build ผ่าน · playwright 3/3**

### PART 123f — ปิดรูที่เหลือของ race guard (2 ก.ย. 69)
เจอตอน user แจ้งว่ารัน SQL แล้ว → ระหว่างตรวจว่ามี SQL ใหม่ไหม (ไม่มี — วันนั้นแตะแค่บรรทัดคอมเมนต์)
อ่านไฟล์ `homeView.jsx` ซ้ำแล้วเจอว่า guard ที่ตั้งใจใส่ไว้ใน PART 123d **ไม่ได้ถูกใส่จริง**

**เหตุ**: สคริปต์แก้ไฟล์ใช้ `str.replace()` โดย**ไม่มี assert** และ pattern ย่อหน้าไม่ตรง
(`"    catch { setSt(..."` แต่ของจริงคือ `"    } catch { setSt(..."`) → แทนที่เงียบ ๆ ไม่เกิดอะไรขึ้น เทสก็ไม่ได้คุมจุดนั้น
**กติกาใหม่: ทุก `str.replace()` ที่แก้ซอร์สต้องมี `assert pattern in s` เสมอ**

**บั๊กจริงที่รูนั้นเปิดไว้**: รอบโหลดที่ "พังและตอบช้า" จะเข้า `catch` แล้ว `setSt(ค่าว่าง)` ทับผลของรอบใหม่ที่สำเร็จไปแล้ว
→ หน้าแรกกลายเป็น **฿0 · เมื่อวาน — · %ปิด —** ทั้งที่ข้อมูลมาครบ (พิสูจน์ด้วยเทส: รอบแรก reject ที่ 400ms · รอบสองสำเร็จทันที)
→ ใส่ `if (!fresh()) return;` ใน catch + เติม `targetsReadOk: false` / `noCycleTarget: false` ที่ตกไป
→ mutation check: ถอด guard ออก = เทสแดงทันที

**เทสเก่าเผยตัวเองว่า mock ไม่ครบ (เพราะวันที่ข้ามไป 2 ก.ย.)**
`homeView-dom.test.jsx` mock แค่ `fetchTargets` แต่โค้ดเปลี่ยนไปใช้ `fetchTargetsResult` แล้ว
วันที่ 1 เทสผ่านโดยบังเอิญ — เพราะ "เมื่อวาน" อยู่เดือนก่อน โค้ดเลยไปเรียก `fetchTargets(pm)` ที่ mock ไว้
พอขึ้นวันที่ 2 เส้นทางเปลี่ยน → เทสแดง → เติม mock `fetchTargetsResult` ให้ครบ
**บทเรียน: เทสที่ผลลัพธ์ขึ้นกับ "วันนี้เป็นวันที่เท่าไร" ผ่านวันนี้ไม่ได้แปลว่าผ่านพรุ่งนี้**

เก็บกวาด: ลบ state `cycleTargetsReadOk` ที่ตั้งไว้แต่ไม่มีใครอ่าน (`noCycleTarget` คุมเคส error อยู่แล้ว)

verify: **783 เทส (67 ไฟล์) เขียวทั้ง TZ=UTC และ TZ=Asia/Bangkok · eslint 0/0 · build ผ่าน · playwright 3/3**

### PART 123g — เทส race ที่ flaky (2 ก.ย. 69)
เจอตอนรัน `eslint && vitest && build` ต่อกัน: เทสแดง 1 ตัว แต่รันเดี่ยว ๆ 5 รอบเขียวหมด
**เหตุ**: เทส race ที่เพิ่งเขียนพึ่ง `setTimeout(400ms/500ms)` — พอ CPU ถูกแย่ง timer เลื่อน ลำดับสลับ
เทส flaky แย่กว่าเทสแดงชัด ๆ เพราะทำให้เลิกเชื่อเกตทั้งชุด
**แก้**: เลิกพึ่งเวลาเดิน → กัน promise ของรอบแรกไว้ในมือ (`deferredMergedMonth`) แล้วปล่อย/โยน error เองหลังรอบสองจบ = ลำดับแน่นอนทุกเครื่อง
verify: รันเดี่ยว 3 รอบเขียว · รันพร้อม eslint+build เขียว · mutation check (ถอด `fresh()` ทั้ง 2 จุด = แดง)

### ✓ PART 124 — รอบไล่บั๊กใหญ่ด้วยบอต 4 ตัว + แก้ทั้งหมด (2 ก.ย. 69)
user: "เช็คบัคให้หน่อยทั้งหมด รันบอตแยกกันหาได้ รายงานก่อน" → "เริ่มแก้ได้เลย"

แยกบอต 4 ตัวไล่คนละโซน (สิทธิ์หน้าประสิทธิภาพเซล · หน้าแรก · ความถูกต้องเลขเงินข้ามหน้า · ความเสี่ยงข้ามระบบ)
เจอรวม ~40 จุด · **พิสูจน์ด้วยการรันโค้ดจริงก่อนแก้ทุกข้อที่พิสูจน์ได้** ไม่เชื่อรายงานบอตดิบ ๆ

**🔴 แก้ครบ 8 ข้อ**
1. `salesDailyEntry.jsx` — อ่านแถวเดิมพลาด → `baseRow=null` → เซฟทับ `channels` jsonb = **ยอด mp/ค่าแอด/note ของวันนั้นหายถาวร**
   → จับ error จริง + `loadErr` + **ล็อกปุ่มบันทึก** + แถบเตือน + ปุ่มโหลดใหม่ (แพทเทิร์นจาก `settingsMonthTargets`)
2. `mergedMonth.js` — ไม่เช็ค `oR.error` (cachedFetchRange คืน `{error}` ไม่ throw) → หน้าแรก/เกจโชว์ "฿0 · 0%" อย่างมั่นใจ → `if (oR?.error) return null`
3. `saleDashboard.jsx:665` — guard `(leadView || funnelClose)` แต่ข้างในอ้าง `funnelClose.pct` → null deref = **รายงานขายจอขาว**ช่วงยุคเก่า
4. **override ย้ายวันที่ → เงินหาย** — ทุก query กรอง `order_date` ดิบก่อน merge
   (เคสจริงแคบกว่าที่บอตบอก: การแก้อัปเดตแถวจริงด้วย เงินหายเฉพาะตอน re-import มาร์เก็ตเพลสทับกลับ)
   → `strayOverrideOrderNos()` + `fetchOrdersByNos()` ใน `saleData.js` (4 เทส) ดึงใบที่ "วันที่ใหม่อยู่ในช่วงแต่วันดิบไม่อยู่"
   + **กรองซ้ำด้วยวันที่หลัง merge** (กันใบที่ย้ายออกไปลงผิดวัน) · ต่อสายที่ mergedMonth · homeView · salePerf
   (saleDashboard ปลอดภัยอยู่แล้วเพราะ `compute()` re-filter ให้)
5. `homeAgg.todayPulse` — เฉลี่ย 7 วันหารด้วย "จำนวนวันที่มีออเดอร์" → สูงเกินจริง 17% → นับ 7 วันปฏิทิน วันที่ขายไม่ได้ = 0 · clamp ด้วยวันแรกที่มีข้อมูล
6. `homeAgg.dailySeries` — วันที่ "มีแต่คนทัก ไม่มีออเดอร์" ไม่มีแถว → **คนทักวันนี้ = 0** (วันที่ทัก 40 ปิด 0 = วันที่ต้องรู้ที่สุด) → เติมแถวให้
7. **หน้าแรกไม่เช็ค `locked_sections`** — หน้าหลักล็อกไม่ได้ แต่ PART 122 ย้ายยอดบริษัท + %เป้ารายคนมาไว้ → ล็อกหน้ายอดขายเสียเปล่า
   → `homeMoneyVisibility()` (5 เทส) · ล็อก `catalog:report` ซ่อนเงินบริษัท · `catalog:perf` ซ่อนอันดับเซลล์
8. `salePerf.teamCmp` — ตัวตั้งเป็นยอดทีม ตัวหารเป็นยอดตัวเอง → editor เห็น **▲ +1,400%** → เพิ่ม `perfAllPrev`

**🟠 กลุ่ม "อ่านไม่ได้ ≠ ไม่มีข้อมูล" — ไล่ปิดทั้งระบบ**
`views-sale-submit` (ฟอร์มคนทัก: ล็อกบันทึก + แถบเตือน · **race guard** กันสลับเซลล์แล้วทับข้อมูลกัน) ·
`salePerf` (แถบแดง + ปุ่มลองใหม่ · race guard กันสลับเดือนแล้วเลขเป็นของอีกเดือน) ·
`saleDashboard` (ค่าแอด/ยอด mp) · `commissionCycleSheet` (race guard + แถบเตือน) · `saleCrm` (orders กับ profiles มาตรฐานเดียวกัน) ·
`saleData.getDateBounds` (**เลิกแคชผลที่ล้มเหลว** — เดิมค้าง 5 นาที + ทำให้ดาวน์โหลดทั้งตาราง) ·
`monthTarget` + `homeView` (เลิกชวนคัดลอกเป้าทับของจริง · เลิกฟ้องทั้งทีมว่าไม่กรอกคนทัก)

**🟠 สูตรเงินที่ไม่ตรงกัน**
การ์ด KPI %ปิด/คนทัก: trim ชื่อ + กรองคนทักตามช่องทาง + คืน null แทน 0% (เดิม 20% กับ 12% พร้อมกันบนจอเดียว) ·
hero "รวมมาร์เก็ตเพลส" ใช้ `manualExtra` (เดิมเกินจริง 7 เท่า) ·
**TikTok** ใช้ `isLeadChannel` เป็นนิยามเดียว (เดิมแถวโชว์ `—` แต่ยอดบวกเข้าแถวรวม · mutation check ผ่าน) ·
ตัว/ออเดอร์ ใช้ออเดอร์รายใบเป็นตัวส่วน · Δ%ปิด คืน null แทน ▼100%

**🟡 ปิดครบ** — clipboard toast (writeText คืน Promise) · "คัดลอกสรุป" ใช้ชุดเดียวกับการ์ด · ป้ายออนไลน์มี listener จริง ·
`monthTarget` เลิกโหลดซ้ำ 2 รอบ (ผูกทั้ง visibilitychange+focus) · tooltip สปาร์คไลน์ตรงความจริง ·
`buildTodos` ไม่ชี้ไปหน้าที่ถูกล็อก (3 เทส) · งานจากโครงการ private/archived ไม่โผล่หน้าแรก ·
`useDayTick` แท็บค้างข้ามเที่ยงคืนแล้วขยับเอง · `canEditReceipt` ใช้วันไทย · ลิ้นชักออเดอร์: ลบ 0 แถวไม่บอก "สำเร็จ" + viewer ไม่เห็นปุ่มลบ

**บทเรียน**
- 🔴 ห้าในแปดข้อเป็นคลาสเดียวกัน (**"อ่านไม่ได้" ถูกกลืนเป็น "ไม่มีข้อมูล"**) — เคยจดกติกาไว้แล้วแต่แก้แค่จุดที่เจอ ไม่ได้ไล่ทั้งระบบ
- เทส 2 ตัวที่เขียนไว้เอง **ล็อกพฤติกรรมที่เป็นบั๊ก** — ต้องแก้ค่าคาดหวังพร้อมคอมเมนต์อธิบายกติกาใหม่
- เทส DOM ที่เขียนคุม guard ของ funnel **ไม่ discriminate** (ถอด guard แล้วยังเขียว) → ถอดออก ไม่เก็บเทสที่พิสูจน์อะไรไม่ได้

verify: **806 เทส (68 ไฟล์) เขียวทั้ง TZ=UTC และ TZ=Asia/Bangkok · eslint 0/0 · build ผ่าน · playwright 3/3**

### ✓ PART 125 — ย้ายการ์ดเข้าคอลัมน์ที่สร้างเองไม่ได้ (2 ก.ย. 69)
user แจ้ง: "ย้ายการ์ด แล้วการ์ดในโครงการไม่ยอมไป" พร้อม error
`new row for relation "tmk_tasks" violates check constraint "tmk_tasks_status_check"`

**ต้นตอ — อยู่ที่ schema ไม่ใช่ UI**
`SETUP-ALL.sql:72` ล็อก `tmk_tasks.status` ไว้ตั้งแต่วันแรก:
`check (status in ('todo','inprogress','review','done'))`
แต่ `flowSettingsPage.addStatus` สร้างคอลัมน์ใหม่ด้วย id สุ่ม `'st_' + random` → DB ปฏิเสธทุกครั้ง
ไม่มี migration ไหนเคยคลาย constraint นี้เลย (ค้นทั้งโฟลเดอร์แล้ว)

**ทำไมดูเหมือนบั๊ก UI**: บอร์ดขยับการ์ดก่อน (optimistic) → DB ปฏิเสธ → `refresh(['tmk_tasks'])`
ดึงของจริงกลับ → การ์ดเด้งกลับที่เดิม · กระทบทุกทางที่เขียน status (Kanban · รายการ · ปฏิทิน)
**ข้อมูลไม่เสียหาย** — ถูกปฏิเสธตั้งแต่ต้น ไม่มีอะไรเขียนครึ่ง ๆ

**แก้** — `20260902-tasks-custom-status.sql` (user เลือกทาง "คลาย constraint" · **รันแล้ว ยืนยันใช้งานได้**)
- `drop constraint tmk_tasks_status_check` → `check (status is not null and length(btrim(status)) between 1 and 64)`
- **ไม่ใช้ regex `st_%`** เพราะจะผูก DB เข้ากับวิธีตั้ง id ของโค้ด — เปลี่ยนวิธีตั้ง id เมื่อไหร่พังเงียบอีกรอบ
- VERIFY block ทดสอบเขียนค่า `st_test1` จริงแล้ว rollback ทิ้ง · ROLLBACK block เตือนว่าต้องย้ายงานกลับก่อน

**พ่วง — ทำให้ error อ่านรู้เรื่อง** (เผื่อ environment อื่นยังไม่ได้รัน)
`lib/pgError.js` เพิ่ม `isTaskStatusLocked()` + `TASK_STATUS_MIGRATION` · `needsMigration()` รู้จักเคสนี้
ข้อความเปลี่ยนจาก Postgres ดิบ → "ย้ายเข้าคอลัมน์สถานะที่สร้างเองไม่ได้ — ต้องรัน … ก่อน"
ใช้ที่ทั้ง 3 ทางย้ายงาน (`plannerKanban` · `plannerList` · `plannerCalendar` — ทั้งสามเคยโชว์ error ดิบเป็นอังกฤษ)

**บทเรียน** (จดลง memory: `user-defined-values-no-check`)
ค่าที่ **ผู้ใช้นิยามเอง** ห้ามล็อกด้วย CHECK ที่ระบุรายการค่า — ตอนเพิ่มฟีเจอร์ "สร้างเองได้" ต้องไปดู schema ของคอลัมน์นั้นเสมอ

verify: **844 เทส (69 ไฟล์) เขียวทั้ง 2 TZ · eslint 0/0 · build ผ่าน · playwright 3/3 · SQL parse ผ่าน · user ลากการ์ดจริงแล้วใช้งานได้**
