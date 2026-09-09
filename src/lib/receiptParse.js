/* ============================================================
   receiptParse.js — อ่านใบเสร็จรับเงิน Shipnity (PDF ดิจิทัล) ด้วย pdf.js ล้วน
   ============================================================
   ไม่ใช้ AI/network — parser ออกแบบให้ "ทนใบต่างแบบ" (เป้า ~100 ผันแปร):
   - ตำแหน่งไม่ตายตัว: ทุก threshold คิดตามสัดส่วนหน้ากระดาษ (SC = กว้างจริง/612)
     + คอลัมน์ขวา derive จากตำแหน่ง label จริง ("เลขที่เอกสาร") ไม่ใช่ค่า hardcode
   - label หลายภาษา/หลายคำ (ไทย+อังกฤษ synonym ต่อ field) ผ่าน labelKey แบบ fuzzy
   - วันที่หลายรูป: DD/MM/YYYY (พ.ศ./ค.ศ.) · YYYY-MM-DD · "2 ก.ค. 2569" (เดือนไทยย่อ/เต็ม)
   - เลขไทย ๐-๙ → อารบิกทุกจุดตัวเลข · จุลภาคพันหลัก
   - ไฟล์สแกน/รูป (ไม่มี text layer) / ล็อครหัส → error ข้อความชัด ไม่เงียบ
   - ช่องทางติดต่อไม่รู้จัก → warning + เก็บโทเคน (เพิ่ม pattern จากใบจริงได้เรื่อยๆ)
   - deterministic: field ที่หาไม่เจอ → ใส่ชื่อลง warnings ไม่มีการเดา
   ข้อจริงจากไฟล์ Shipnity ที่รองรับ:
   - ตัวอักษรไทยแตกเป็นชิ้นย่อย → ต่อกลับตามบรรทัด (y±tol) + เว้นวรรคตามช่องว่าง x จริง
   - ฟอนต์ map วรรณยุกต์บางตัวเป็น \u0000 (เช่น "ที่" → "ที\0") → strip ก่อน match label
   - สระอำ decomposed (นิคหิต ํ + า) → ำ · ช่องว่างปลอมกลางคำ → ลบตามกติกาสระ/วรรณยุกต์
   - แต่ละรายการ = หลายบรรทัด y ซ้อน (รหัส/ชื่อ+ตัวเลข/วันที่ผลิต) → จับกลุ่มด้วย y ใกล้สุด
   - บางหน้ามีป้ายจัดส่ง (ผู้ส่ง/ผู้รับ) เหนือใบ → อ่านเฉพาะใต้หัว "ใบเสร็จรับเงิน"
   ใช้:  const receipts = await parseReceiptPdf(file)   // 1 ไฟล์ → หลายใบได้ (PDF รวมหลายหน้า)
   - แยกใบ: หน้าไหนมี "เลขที่เอกสาร" = เริ่มใบใหม่ · หน้าไม่มี = หน้าต่อ (รายการยาว)
     หน้าต่อ merge ทั้ง "รายการ" และ "สรุปยอด/หมายเหตุ/การชำระ/ขนส่ง" กลับเข้าใบหลัก
   ฟิลด์ที่คืนต่อใบ (ครบทุกอย่างบนใบ — ไม่ทิ้งข้อมูล):
     order_no · order_date · order_time · customer_name/phone/social/address/tax_id ·
     province · lines[{code,name,qty,unit_price,discount,amount}] · subtotal/discount/
     shipping/vat/total · payment_method · carrier · note · promo_code ·
     channel_hint/channel_token · customer_masked · warnings[]
   regression: node scripts/test-receipts.mjs [โฟลเดอร์ PDF]
   ============================================================ */
import { PROVINCES, PROVINCE_TH_SHORT, provinceFromPostcode } from './provinces.js';

/* ---------- pdf.js loader (lazy — โหลดเมื่อใช้จริงเท่านั้น) ---------- */
let _pdfjs = null;
async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  if (isBrowser) {
    const lib = await import('pdfjs-dist');
    try {
      const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
      lib.GlobalWorkerOptions.workerSrc = worker.default;
    } catch { /* worker โหลดไม่ได้ → pdf.js fallback main thread เอง */ }
    _pdfjs = lib;
  } else {
    // Node (unit test / scripts): ใช้ legacy build (ตัวปกติพึ่ง DOM API)
    _pdfjs = await import(/* @vite-ignore */ 'pdfjs-dist/legacy/build/pdf.mjs');
  }
  return _pdfjs;
}

/* ---------- helpers ---------- */
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* ---------- Thai text normalize ---------- */
const thDigits = (s) => String(s || '').replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0E50)); // เลขไทย → อารบิก
const normThai = (s) => thDigits(s)
  .replace(/[\u0000-\u001f]/g, '')  // ฟอนต์ map วรรณยุกต์เป็น null → ตัดทิ้ง
  .replace(/ํา/g, 'ำ')                     // นิคหิต ํ + า → ำ
  .replace(/ /g, ' ')
  .replace(/\s+/g, ' ')
  // ช่องว่างปลอมกลางคำ (ฟอนต์ใบ Shipnity แทรก space item + บางชิ้น width=0):
  // (ก) space ก่อนสระบน-ล่าง/วรรณยุกต์ = ปลอมเสมอ (เครื่องหมายเกาะพยัญชนะก่อนหน้า)
  .replace(/\s+(?=[ัำ-ฺ็-๎])/g, '')
  // (ข) space หลังสระ/วรรณยุกต์ที่จบคำไม่ได้ (ั ิ ี ึ ื ุ ู ฺ เ แ โ ใ ไ ็ ่ ้ ๊ ๋) = ปลอม
  //     เว้น ์ กับ ำ ที่จบคำได้จริง ("ตน์ แก้ว" · "ทำ งาน") → คงช่องว่างจริงระหว่างชื่อ-นามสกุล
  .replace(/([ัิ-ฺเ-ไ็-๋])\s+(?=[ก-ฮเ-ไ])/g, '$1')
  .trim();
// สำหรับ match label: ตัดช่องว่าง/สระบน-ล่าง/วรรณยุกต์ (ทน glyph แตก/หาย)
const labelKey = (s) => normThai(s).replace(/[ัำ-ฺ็-๎\s.]/g, '').toLowerCase();
const LK = (s) => labelKey(s);
const LKS = (labels) => (Array.isArray(labels) ? labels : [labels]).map(LK);

const num = (s) => {
  const t = thDigits(s ?? '').replace(/,/g, '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};

/* ---------- Label synonyms (ไทย+อังกฤษ ต่อ field) — เทียบผ่าน labelKey ---------- */
const L = {
  title:    ['ใบเสร็จรับเงิน', 'receipt'],
  docNo:    ['เลขที่เอกสาร', 'เลขที่ใบเสร็จ', 'เลขที่บิล', 'doc no', 'document no', 'receipt no', 'no'],
  date:     ['วันที่', 'date'],
  payment:  ['เงื่อนไขการชำระเงิน', 'การชำระเงิน', 'ชำระโดย', 'payment terms', 'payment'],
  carrier:  ['การจัดส่ง', 'จัดส่งโดย', 'ขนส่ง', 'shipping', 'delivery'],
  discCode: ['รหัสส่วนลด', 'promo code', 'coupon'],
  custTax:  ['เลขประจำตัวผู้เสียภาษี', 'tax id'],
  note:     ['หมายเหตุ', 'note', 'remark'],
  checker:  ['ผู้ตรวจสอบ', 'checked by'],
  // แถวสรุปยอดฝั่งขวาล่าง — exact match ต่อแถว (กัน "ยอด" ชน "ยอดรวม")
  subtotal: ['ยอด', 'subtotal'],
  discount: ['ส่วนลด', 'discount'],
  shipFee:  ['ค่าส่ง', 'ค่าจัดส่ง', 'shipping fee', 'delivery fee'],
  vat:      ['ภาษีมูลค่าเพิ่ม', 'vat', 'tax'],
  total:    ['ยอดรวม', 'รวมทั้งสิ้น', 'รวมสุทธิ', 'ยอดสุทธิ', 'grand total', 'total'],
  // หัวตารางรายการ (กลุ่มละหลายคำ)
  hCode:    ['รหัสสินค้า', 'รหัส', 'sku', 'code'],
  hName:    ['ชื่อสินค้า', 'รายการ', 'สินค้า', 'item', 'description'],
  hQty:     ['จำนวน', 'qty', 'quantity'],
  hPrice:   ['ราคา', 'ราคาต่อหน่วย', 'price', 'unit price'],
  hDisc:    ['ส่วนลด', 'discount'],
  hAmt:     ['ยอด', 'รวม', 'amount', 'total'],
};

/* ---------- ต่อชิ้นข้อความในบรรทัด: เว้นวรรคเมื่อมีช่องว่าง x จริง ---------- */
function joinItems(items, sc = 1) {
  let out = '', prevEnd = null;
  for (const it of items) {
    if (prevEnd != null && it.x - prevEnd > 1.5 * sc) out += ' ';
    out += it.s;
    prevEnd = it.x + (it.w || 0);
  }
  return normThai(out);
}

/* ---------- อ่านหน้า → บรรทัด (จัดกลุ่มตาม y ±tol · เรียง x) — tol สเกลตามหน้ากระดาษ ---------- */
async function pageToRows(page, sc = 1) {
  const tc = await page.getTextContent();
  const rows = [];
  const tol = 2 * sc;
  for (const it of tc.items) {
    const s = it.str || '';
    if (!s.trim()) continue;
    const y = it.transform[5];
    const x = it.transform[4];
    let row = null;
    for (const r of rows) if (Math.abs(r.y - y) <= tol) { row = r; break; }
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, s, w: it.width || 0 });
  }
  rows.sort((a, b) => b.y - a.y); // บนลงล่าง
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    r.text = joinItems(r.items, sc);
    r.key = labelKey(r.text);
  }
  return rows;
}

/* ---------- หา "ตำแหน่ง label" จริงบนหน้า (สะสมชิ้นจากซ้ายจนประกอบเป็น label) ----------
   คืน { x, row } ของ label แรกที่เจอ — ใช้ derive คอลัมน์ขวาแทนค่า hardcode */
function findLabel(rows, labels) {
  const lks = LKS(labels);
  for (const r of rows) {
    for (let i = 0; i < r.items.length; i++) {
      let acc = '';
      for (let j = i; j < r.items.length && j < i + 14; j++) {
        acc += r.items[j].s;
        const k = labelKey(acc);
        if (lks.includes(k)) return { x: r.items[i].x, row: r };
        if (!lks.some(lk => lk.startsWith(k))) break;
      }
    }
  }
  return null;
}

/* ---------- หา "ค่า" หลัง label (label ... : value) — รับ synonym หลายคำ ----------
   labelMinX: มองเฉพาะชิ้นที่ x ≥ ค่านี้ (กัน colon/ข้อความคอลัมน์อื่นปนบรรทัดเดียว)
   ลำดับความแม่น: แถวที่ "ขึ้นต้นด้วย label + มีค่า" ชนะ → แถว "มี label ปน + มีค่า" →
   ไม่มีค่าเลย = null (กันคำบังเอิญมี substring ตรง label เช่น "no" มา short-circuit ค่าจริง) */
function valueAfterLabel(rows, labels, { labelMinX = 0, sc = 1 } = {}) {
  const lks = LKS(labels);
  let loose = null;
  for (const r of rows) {
    const items = r.items.filter(i => i.x >= labelMinX);
    if (!items.length) continue;
    const key = labelKey(items.map(i => i.s).join(''));
    const starts = lks.some(lk => key.startsWith(lk));
    if (!starts && !lks.some(lk => key.includes(lk))) continue;
    const colon = items.findIndex(i => i.s.includes(':'));
    if (colon < 0) continue;
    // ค่าหลัง ":" — บาง generator ปล่อย ": ค่า" เป็นชิ้นเดียวกับ colon → ต้องเก็บเศษในชิ้นนั้นด้วย (ห้ามหาย)
    const rest = items[colon].s.slice(items[colon].s.indexOf(':') + 1).trim();
    const text = normThai((rest ? rest + ' ' : '') + joinItems(items.slice(colon + 1), sc)).trim();
    if (!text) continue;                          // แถว label ค่าว่าง → มองแถวถัดไป
    if (starts) return { text, row: r };
    if (!loose) loose = { text, row: r };
  }
  return loose;
}

/* ---------- วันที่หลายรูปแบบ → ISO · ปี > 2400 = พ.ศ. ----------
   รองรับ: DD/MM/YYYY(+เวลา) · YYYY-MM-DD · "2 ก.ค. 2569" / "2 กรกฎาคม 2569" · เลขไทย */
const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_MONTHS_AB = ['มค', 'กพ', 'มีค', 'เมย', 'พค', 'มิย', 'กค', 'สค', 'กย', 'ตค', 'พย', 'ธค'];
function parseThaiDate(s) {
  const t = thDigits(s || '');
  const mk = (d, mo, y) => {
    if (y > 2400) y -= 543;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2200) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  let m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (m) return mk(+m[1], +m[2], +m[3]);
  m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return mk(+m[3], +m[2], +m[1]);
  // "2 ก.ค. 2569" / "2 กรกฎาคม 2569" — เทียบชื่อเดือน (ตัดจุด/ช่องว่าง)
  m = /(\d{1,2})\s*([ก-ฮ.]{2,12})\s*(\d{4})/.exec(t);
  if (m) {
    const token = m[2].replace(/[.\s]/g, '');
    let mo = TH_MONTHS_FULL.findIndex(x => token.startsWith(x.slice(0, 4)) || x.startsWith(token));
    if (mo < 0) mo = TH_MONTHS_AB.indexOf(token);
    if (mo >= 0) return mk(+m[1], mo + 1, +m[3]);
  }
  return null;
}

/* ---------- ช่องทางติดต่อ/ขาย: normalize โทเคนหลากรูปแบบ → CHANNELS ของแอป ----------
   ครอบคลุมรูปที่เจอจริง + เผื่ออนาคต (Shipnity ตั้งชื่อช่องได้เอง หลายภาษา/ตัวพิมพ์):
   facebook·FACEBOOK·fb·เฟส·messenger → Facebook · line·line_oa·LINE·ไลน์ → LINE
   ig·instagram·ไอจี → Instagram · phone·PHONE·โทร·เบอร์·มือถือ → Phone
   tiktok·ติ๊กต็อก → TikTok · shopee·ช้อปปี้ → Shopee · lazada·ลาซาด้า → Lazada
   หน้าร้าน·walk-in·POS → POS · ไม่รู้จัก → '' + warning เก็บโทเคน (เพิ่ม pattern ทีหลังได้) */
const CHANNEL_PATTERNS = [
  [/facebook|messenger|เฟส|เฟซ|\bfb\b/i, 'Facebook'],
  [/\bline|ไลน์/i, 'LINE'],                       // line_oa · lineoa · line-shop → LINE (ไม่ใช้ \b หลัง line เพราะ "_" กันไว้)
  [/instagram|insta|ไอจี|\big\b/i, 'Instagram'],
  [/tiktok|ติ๊?กต็?อก|ทิกทอก/i, 'TikTok'],
  [/shopee|ช้?อปปี|ช็อปปี/i, 'Shopee'],
  [/lazada|ลาซาด/i, 'Lazada'],
  [/phone|โทร(?!สาร)|เบอร์|มือถือ|\btel\b/i, 'Phone'],   // โทร(?!สาร) กัน "โทรสาร" (แฟกซ์) ชน Phone
  [/หน้าร้าน|walk[- ]?in|\bpos\b|storefront/i, 'POS'],
];
function channelFromText(s) {
  const t = String(s || '');
  for (const [re, ch] of CHANNEL_PATTERNS) if (re.test(t)) return ch;
  return '';
}
// social handle ที่อ่านได้จริง — ตัด emoji/สัญลักษณ์ (เช่น "💜 นุช 🌹", "⭐ Mo ⭐") เหลือข้อความ
const cleanSocial = (s) => {
  const t = String(s || '').replace(/[^A-Za-zก-๙0-9@._/\- ]/gu, ' ').replace(/\s+/g, ' ').trim();
  return ((t.match(/[A-Za-zก-๙]/g) || []).length >= 2) ? t : '';
};
// มีอักขระควบคุม (<0x20) ในชิ้น = ฟอนต์ใบเสร็จ map วรรณยุกต์/สระเป็น null → มาร์คหาย (กู้ไม่ได้)
const hasLostMark = (items) => (items || []).some(i => [...(i.s || '')].some(c => c.charCodeAt(0) < 0x20));
// ต่อบรรทัดห่อ: ไทย↔ไทย = ไม่เว้นวรรค (คำเดียวขึ้นบรรทัดใหม่ เช่น "แก่น"+"ทองแดง") · อื่น = เว้นวรรค ("Laweewan"+"Sribuam")
const joinWrap = (base, cont) => {
  if (!cont) return base;
  const noSpace = /[ก-๙]$/.test(base) && /^[ก-๙]/.test(cont);
  return base + (noSpace ? '' : ' ') + cont;
};
// ต่อ "บรรทัดห่อ" ของค่า (ชื่อ/social) — สแกนแถวถัดลงมา ≤3 แถว เอาชิ้นในช่วง x [xFrom,xTo]
// (แถว label เช่น "เลขที่เอกสาร:" อาจแทรกอยู่ระหว่างชื่อ↔บรรทัดห่อ → ข้ามแล้วสแกนต่อ)
// หยุดเมื่อ: ถึงบล็อกที่อยู่/ภาษี (custTax) · แถว Tel · ห่างเกิน ~3 บรรทัด · ค่าที่ได้เป็น label เอง
function wrappedCont(body, custRow, xFrom, xTo, sc) {
  const bi = body.indexOf(custRow);
  const lineH = 12 * sc;
  const labelSet = LKS([...L.docNo, ...L.title, ...L.date, ...L.payment, ...L.carrier, ...L.discCode, ...L.note, ...L.checker]);
  for (let d = 1; d <= 3; d++) {
    const n = body[bi + d];
    if (!n || custRow.y - n.y > lineH * 3) break;
    if (/^tel/i.test(n.text.trim())) break;
    if (LKS(L.custTax).some(k => n.key.includes(k))) break;            // ถึงบล็อกที่อยู่/ภาษี = จบโซนชื่อ
    const parts = n.items.filter(i => i.x >= xFrom && i.x < xTo && num(i.s) == null && !/[:;]/.test(i.s) && !channelFromText(i.s));
    const cont = joinItems(parts, sc).trim();
    if (!cont) continue;                                               // แถวนี้ไม่มีอะไรในโซน → สแกนต่อ
    if (labelSet.some(k => labelKey(cont).includes(k))) continue;      // เป็น label ที่หลุดเข้าโซน → ข้าม
    // หน้าตาเป็น "ที่อยู่" (บ้านเลขที่/ตำบล/ถนน/เลขเยอะ) = จบโซนชื่อ — ใบที่ไม่มีบรรทัดเลขภาษีคั่นชื่อกับที่อยู่
    if (/(\d+\/\d+)|หมู่|ตำบล|อำเภอ|จังหวัด|แขวง|เขต|ถนน|ซอย|road|street|district/i.test(cont) || (cont.match(/\d/g) || []).length >= 3) break;
    if ((cont.match(/[A-Za-zก-๙]/g) || []).length >= 2) return cont;
  }
  return '';
}

/* ---------- หา "จังหวัด" จากที่อยู่ (เทียบ list จริง 77 จังหวัด · เลือกชื่อที่ยาวสุดที่เจอ) ---------- */
function provinceFrom(address) {
  const raw = normThai(address);
  const a = raw.replace(/\s/g, '');
  if (!a) return '';
  if (a.includes('กรุงเทพ') || a.includes('กทม')) return 'กรุงเทพมหานคร'; // ที่อยู่ กทม. มักเขียนสั้น ไม่มี "จ."/"มหานคร"
  let best = '';
  for (const p of PROVINCES) if (a.includes(p.th) && p.th.length > best.length) best = p.th;
  if (!best) {
    // ชั้น 2 — ชื่อย่อ (จ.อยุธยา/จ.ปทุม/จ.สุราษ ฯลฯ): ต้องมี "จ."/"จังหวัด" นำหน้า กันชนชื่อตำบล/อำเภอ/ชื่อคน (เช่น ต.อุบล)
    for (const [s, full] of PROVINCE_TH_SHORT) {
      if (new RegExp(`(จ\\.?|จังหวัด)${s}`).test(a)) return full;
    }
    // ชั้น 3 — รหัสไปรษณีย์ (เลข 5 หลักตัวสุดท้ายในที่อยู่): ครอบคลุมชื่อย่อไม่มี "จ." นำ/สะกดเพี้ยนทุกแบบ
    const zips = raw.match(/(?:^|\D)(\d{5})(?:\D|$)/g);
    if (zips) {
      const z = zips[zips.length - 1].replace(/\D/g, '');
      best = provinceFromPostcode(z) || '';
    }
  }
  return best;
}

/* ============================================================
   parse 1 หน้า → ใบ (หรือหน้าต่อ)
   ============================================================ */
const BASE_W = 612;           // ความกว้างหน้าเทมเพลตอ้างอิง (pt) — SC = pageW/BASE_W
const DEF_RIGHT_COL = 300;    // fallback คอลัมน์ขวา (×SC) เมื่อหา label เลขที่เอกสารไม่เจอ

/* รหัสสินค้า เช่น JSK02-BK-S · JJK111-N-XL · JDRR111-BK-M · JDB111-Y-2XL · C04-BK-S
   (ตัวอักษร≥1 + เลข + -ส่วน — prefix ตัวเดียวเจอจริงในหมวดเพิ่มเอง เช่น C04 ชบา · ปลอดภัยเพราะบังคับมี -ส่วน) */
const CODE_RE = /^[A-Za-z]{1,}[0-9]{1,4}(-[A-Za-z0-9]{1,5}){1,3}$/;
// รหัสเปล่าไม่มี suffix สี-ไซซ์ (เช่น JSK02 · OEM111) — ยอมรับเฉพาะเมื่ออยู่ "คอลัมน์รหัส" (กันชนคำในชื่อสินค้า)
const CODE_PLAIN_RE = /^[A-Za-z]{2,6}[0-9]{1,4}$/;
const DATE_PAREN_RE = /^\(?\s*\d{1,2}\/\d{1,2}\/\d{4}\s*\)?$/; // บรรทัดวันที่ผลิต "(02/07/2026)" → ทิ้ง

function parseLineTable(rows, sc, rightCol) {
  // header ตาราง: มีหัวคอลัมน์ ≥4 จาก 6 กลุ่ม (แต่ละกลุ่มมี synonym)
  // fallback: template ย่อเหลือ 3 คอลัมน์ก็อ่านได้ — แต่ต้องมี "จำนวน" + "ยอด" (กัน false-header)
  const HGROUPS = [L.hCode, L.hName, L.hQty, L.hPrice, L.hDisc, L.hAmt].map(LKS);
  const rowHits = (r) => HGROUPS.filter(g => g.some(lk => r.key.includes(lk))).length;
  const hasG = (r, g) => LKS(g).some(lk => r.key.includes(lk));
  const headerRow = rows.find(r => rowHits(r) >= 4)
    || rows.find(r => rowHits(r) >= 3 && hasG(r, L.hQty) && hasG(r, L.hAmt));
  if (!headerRow) return { lines: [], found: false };

  // ตำแหน่งคอลัมน์จาก header จริง (ทนเทมเพลตขยับ/สเกล)
  const hItems = headerRow.items;
  const xOfHeader = (labels) => {
    const lks = LKS(labels);
    for (let i = 0; i < hItems.length; i++) {
      let acc = '';
      for (let j = i; j < hItems.length && j < i + 12; j++) {
        acc += hItems[j].s;
        const k = labelKey(acc);
        if (lks.includes(k)) return hItems[i].x;
        if (!lks.some(lk => lk.startsWith(k))) break;
      }
    }
    return null;
  };
  const xName = xOfHeader(L.hName) ?? (hItems[0].x + 85 * sc);
  const xQty  = xOfHeader(L.hQty) ?? (xName + 140 * sc);
  // ตำแหน่งคอลัมน์ตัวเลข "ที่มีจริง" บน header (เรียงซ้าย→ขวา) — ใช้จับคู่ค่าตามคอลัมน์
  // แทนการเดาลำดับตายตัว (ทน template ที่ตัดคอลัมน์ราคา/ส่วนลด หรือสลับที่)
  const numCols = [
    ['qty', xOfHeader(L.hQty)], ['price', xOfHeader(L.hPrice)],
    ['disc', xOfHeader(L.hDisc)], ['amt', xOfHeader(L.hAmt)],
  ].filter(([, x]) => x != null).sort((a, b) => a[1] - b[1]);
  const firstNumX = numCols.length ? numCols[0][1] : xQty;
  const numZoneX = firstNumX - 35 * sc; // คอลัมน์ตัวเลข (จำนวน/ราคา/ส่วนลด/ยอด) เริ่มที่นี่
  const nameMinX = xName - 15 * sc;

  // ขอบล่างของตาราง = แถวสรุปยอด/หมายเหตุ/ผู้ตรวจสอบ
  const SUM_KEYS = LKS([...L.subtotal, ...L.total, ...L.discount, ...L.shipFee, ...L.vat]);
  const isSummaryRow = (r) => {
    const right = r.items.filter(i => i.x >= rightCol && num(i.s) == null);
    const rk = labelKey(right.map(i => i.s).join(''));
    return SUM_KEYS.includes(rk);
  };
  const NOTE_KEYS = LKS(L.note), CHECKER_KEYS = LKS(L.checker);
  const bottomY = Math.max(
    ...rows.filter(r => isSummaryRow(r) || NOTE_KEYS.some(k => r.key.startsWith(k)) || CHECKER_KEYS.some(k => r.key.startsWith(k))).map(r => r.y),
    -Infinity,
  );
  const bodyRows = rows.filter(r => r.y < headerRow.y - 4 * sc && r.y > bottomY + 4 * sc);

  // วันที่ในวงเล็บใต้รายการ "(14/07/2026)" — ปกติทิ้ง แต่เก็บไว้เป็น fallback วันที่ใบ
  // (ใบที่เซลล์ไม่กรอกวันที่หัวใบ: วันที่รายการคือวันสั่งจริง ดีกว่าใช้วันอัปโหลด)
  const lineDates = [];
  for (const r of bodyRows) {
    const t = r.text.trim();
    if (DATE_PAREN_RE.test(t)) { const d = parseThaiDate(t.replace(/[()]/g, '')); if (d) lineDates.push(d); }
  }

  // แถวหลัก = มีตัวเลข ≥2 ในโซนขวา (ราคา/ยอด) · ที่เหลือ = เศษ (รหัส/ชื่อห่อ/วันที่)
  const mainRows = [], otherRows = [];
  for (const r of bodyRows) {
    const nums = r.items.filter(i => i.x >= numZoneX && num(i.s) != null);
    if (nums.length >= 2) { r._nums = nums; mainRows.push(r); }
    else otherRows.push(r);
  }
  if (!mainRows.length) return { lines: [], found: true, lineDates };
  mainRows.sort((a, b) => b.y - a.y); // บน→ล่าง

  // จับเศษเข้ากับแถวหลักที่ y ใกล้สุด (รหัสอยู่บรรทัดเหนือ · ชื่อห่ออยู่เหนือ/ใต้ · วันที่ทิ้ง)
  const groups = mainRows.map(m => ({ main: m, extra: [] }));
  for (const r of otherRows) {
    const t = r.text.trim();
    if (!t || DATE_PAREN_RE.test(t) || num(t.replace(/,/g, '')) != null) continue; // ทิ้งวันที่/ตัวเลขล้วน(qty รวม)
    let bi = 0, bd = Infinity;
    for (let i = 0; i < mainRows.length; i++) { const d = Math.abs(mainRows[i].y - r.y); if (d < bd) { bd = d; bi = i; } }
    groups[bi].extra.push(r);
  }

  const lines = [];
  for (const g of groups) {
    const clusterRows = [g.main, ...g.extra].sort((a, b) => b.y - a.y); // บน→ล่าง (ลำดับอ่านชื่อที่ห่อ)
    // รหัส = token แรกที่ match CODE_RE (อยู่บรรทัดไหนก็ได้ในกลุ่ม — แยก token ในชิ้น เผื่อ generator รวมทั้งบรรทัดเป็นชิ้นเดียว)
    // + รหัสเปล่า (ไม่มี -สี-ไซซ์) รับเฉพาะ token ในโซนคอลัมน์รหัส (ซ้ายของคอลัมน์ชื่อ)
    let code = '';
    for (const r of clusterRows) {
      for (const it of r.items) {
        const toks = String(it.s).split(/\s+/).filter(Boolean);
        if (!toks.length) toks.push('');
        const joined = String(it.s).replace(/\s/g, '');       // ไทยแตกชิ้น: token เดียวมี space ปลอมคั่น
        for (const tok of (toks.length > 1 ? toks : [joined])) {
          if (CODE_RE.test(tok) || (CODE_PLAIN_RE.test(tok) && tok.length >= 4 && it.x < xName - 5 * sc)) { code = tok; break; }
        }
        if (code) break;
      }
      if (code) break;
    }
    // ชื่อ = ชิ้นในโซนชื่อ (nameMinX .. numZoneX) ที่ไม่ใช่รหัส/ตัวเลข/วันที่ · ต่อแบบ wrap-aware
    // + ชิ้นยาวที่ "คร่อม" โซนชื่อ (generator ปล่อย "CODE ชื่อสินค้า" เป็นชิ้นเดียวจากคอลัมน์รหัส) → ตัด token รหัสทิ้ง เก็บชื่อ
    const nameFrags = [];
    for (const r of clusterRows) {
      const parts = [];
      for (const i of r.items) {
        if (num(i.s) != null || DATE_PAREN_RE.test(i.s.trim())) continue;
        if (CODE_RE.test(String(i.s).replace(/\s/g, ''))) continue;
        if (i.x >= nameMinX && i.x < numZoneX) { parts.push(i); continue; }
        const endX = i.x + (i.w || 0);
        if (i.x < nameMinX && i.x >= nameMinX - 120 * sc && endX > nameMinX + 10 * sc) {
          const t = String(i.s).split(/\s+/).filter(tok => !CODE_RE.test(tok) && !(CODE_PLAIN_RE.test(tok) && tok.length >= 4)).join(' ').trim();
          if (t) parts.push({ ...i, s: t });
        }
      }
      if (parts.length) nameFrags.push(joinItems(parts, sc));
    }
    let name = '';
    for (const p of nameFrags) { if (!name) { name = p; continue; } name += (/[-(/]$/.test(name) || /^[-)/]/.test(p)) ? p : ' ' + p; }
    // ตัวเลขจากแถวหลัก — จับคู่ตามคอลัมน์ที่มีจริงก่อน (จำนวนค่า = จำนวนคอลัมน์ → zip ซ้าย→ขวา)
    // แล้วค่อย fallback ลำดับตายตัว (ทน template ตัด/สลับคอลัมน์ · เลขเกิน 4 ตัว amt = ตัวขวาสุด)
    const vals = g.main._nums.map(i => num(i.s));
    let qty = null, price = null, disc = 0, amt = null;
    if (numCols.length >= 2 && vals.length === numCols.length) {
      const m = {};
      numCols.forEach(([k], i) => { m[k] = vals[i]; });
      qty = m.qty ?? 1; price = m.price ?? null; disc = m.disc ?? 0; amt = m.amt ?? null; // ไม่มีคอลัมน์จำนวน → นับ 1
    }
    if (amt == null) {
      if (vals.length >= 5) { qty = vals[0]; price = vals[1]; disc = vals[2]; amt = vals[vals.length - 1]; }
      else if (vals.length === 4) [qty, price, disc, amt] = vals;
      else if (vals.length === 3) [qty, price, amt] = vals;
      else [qty, amt] = vals;
    }
    lines.push({ code, name: normThai(name), qty: Math.max(0, Math.round(qty ?? 0)), unit_price: price ?? 0, discount: disc ?? 0, amount: amt ?? 0 });
  }
  return { lines: lines.filter(l => l.qty > 0 || l.amount > 0), found: true, lineDates };
}

function parsePage(rows, pageNo, pageW) {
  const sc = (pageW > 0 ? pageW : BASE_W) / BASE_W; // สเกลตามหน้ากระดาษจริง (A4/A5/สลิป)

  // จำกัดโซนอ่านเฉพาะ "ใต้หัวใบเสร็จรับเงิน" — บางหน้ามีป้ายจัดส่ง (ผู้ส่ง/ผู้รับ) พิมพ์อยู่เหนือใบเสร็จ
  const titleRow = findLabel(rows, L.title)?.row || null;
  const body = titleRow ? rows.filter(r => r.y <= titleRow.y + 3 * sc) : rows;

  // คอลัมน์ขวา: derive จากตำแหน่ง label "เลขที่เอกสาร" จริง (fallback ค่าอ้างอิง ×SC)
  const docLabel = findLabel(body, L.docNo);
  const rightCol = docLabel ? Math.max(60 * sc, docLabel.x - 30 * sc) : DEF_RIGHT_COL * sc;

  const docNoHit = valueAfterLabel(body, L.docNo, { labelMinX: rightCol, sc });
  const { lines, lineDates = [] } = parseLineTable(body, sc, rightCol);

  /* ---- สรุปยอด + การชำระ/ขนส่ง/รหัสส่วนลด + หมายเหตุ — คำนวณ "ก่อน" เช็คใบหลัก/หน้าต่อ
     ใบยาวข้ามหน้า: สรุปยอด/หมายเหตุพิมพ์อยู่หน้าสุดท้าย (ซึ่งไม่มีเลขที่เอกสาร = หน้าต่อ)
     → หน้าต่อต้องพกค่าพวกนี้กลับไป merge เข้าใบหลัก ไม่งั้นข้อมูลหาย ---- */
  const pickSum = (labels, colX = rightCol) => {
    const lks = LKS(labels);
    for (const r of body) {
      const right = r.items.filter(i => i.x >= colX);
      if (!right.length) continue;
      const labelPart = right.filter(i => num(i.s) == null);
      if (!lks.includes(labelKey(labelPart.map(i => i.s).join('')))) continue;
      const v = right.filter(i => num(i.s) != null).pop();
      if (v) return num(v.s);
    }
    return null;
  };
  // total หาไม่เจอที่คอลัมน์ขวาปกติ → ลองเลื่อนซ้าย (template ที่บล็อกสรุปอยู่กลางหน้า)
  const total = pickSum(L.total) ?? pickSum(L.total, pageW * 0.4);
  const subtotal = pickSum(L.subtotal);
  const discount = pickSum(L.discount) ?? 0;
  const shipping = pickSum(L.shipFee) ?? 0;
  const vat = pickSum(L.vat) ?? 0;
  const payment_method = normThai(valueAfterLabel(body, L.payment, { labelMinX: rightCol, sc })?.text || '');
  const carrier = normThai(valueAfterLabel(body, L.carrier, { labelMinX: rightCol, sc })?.text || '');
  const promo_code = normThai(valueAfterLabel(body, L.discCode, { labelMinX: rightCol, sc })?.text || '');

  /* ---- หมายเหตุ (ฝั่งซ้ายล่าง — เก็บหลายบรรทัดจนชน label ถัดไป) ---- */
  const noteMaxX = Math.min(285 * sc, rightCol - 10 * sc);
  const noteIdx = body.findIndex(r => r.items[0] && r.items[0].x < 120 * sc && LKS(L.note).some(k => r.key.startsWith(k)));
  let note = '';
  if (noteIdx >= 0) {
    const noteRow = body[noteIdx];
    const colon = noteRow.items.findIndex(i => i.s.includes(':'));
    // เศษหลัง ":" ในชิ้นเดียวกัน (": ค่า" ติดกัน) + ชิ้นถัดไปในโซนซ้าย
    const noteRest = colon >= 0 ? noteRow.items[colon].s.slice(noteRow.items[colon].s.indexOf(':') + 1).trim() : '';
    note = normThai((noteRest ? noteRest + ' ' : '') + joinItems((colon >= 0 ? noteRow.items.slice(colon + 1) : []).filter(i => i.x < rightCol), sc)).trim();
    for (let i = noteIdx + 1; i < body.length; i++) {
      const r = body[i];
      const left = r.items.filter(x => x.x < rightCol && x.x < noteMaxX);
      if (!left.length || left[0].x >= 120 * sc) continue;
      const t = joinItems(left, sc);
      if (!t || LKS(L.checker).some(k => labelKey(t).startsWith(k))) break;
      note += (note ? ' ' : '') + t;
    }
  }

  // ไม่มีเลขที่เอกสาร = หน้าต่อของใบก่อนหน้า (รายการยาวข้ามหน้า) — ส่งข้อมูลที่หน้านี้มีกลับไป merge
  if (!docNoHit || !normThai(docNoHit.text)) {
    return { continuation: true, lines, page: pageNo, total, subtotal, discount, shipping, vat, note, payment_method, carrier, promo_code };
  }

  const warnings = [];
  const order_no = normThai(docNoHit.text).replace(/\s/g, '');
  if (!order_no) warnings.push('เลขที่เอกสาร');

  const dateRaw = valueAfterLabel(body, L.date, { labelMinX: rightCol, sc })?.text || '';
  let order_date = parseThaiDate(dateRaw);
  // เวลาบนใบ (เช่น "02/07/2026 09:10") — เก็บไว้ครบ ไม่ทิ้ง
  const tm = /(\d{1,2}):(\d{2})/.exec(thDigits(dateRaw));
  const order_time = tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : '';
  if (!order_date && lineDates.length) {
    // หัวใบไม่มีวันที่ แต่รายการสินค้ามีวันที่ในวงเล็บ "(14/07/2026)" = วันสั่งจริง → ใช้วันล่าสุด
    order_date = lineDates.slice().sort().pop();
    warnings.push('ไม่มีวันที่หัวใบ — ใช้วันที่จากรายการสินค้า (แก้ได้)');
  } else if (!order_date) {
    // วันที่ว่างบนใบ (เซลล์ไม่กรอกใน Shipnity) → เติมวันที่อัปโหลด (วันนี้) + เตือนให้ตรวจ (แก้ได้ในตาราง)
    order_date = todayISO();
    warnings.push('ไม่มีวันที่บนใบ — ใช้วันที่อัปโหลด (แก้ได้)');
  } else {
    // วันที่ผิดปกติ (อนาคต/เก่าผิดสังเกต) → เตือนให้ตรวจ ไม่บล็อก
    const today = new Date(); today.setDate(today.getDate() + 1);
    if (order_date > `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`) warnings.push(`วันที่เป็นอนาคต (${order_date})`);  // เทียบวันเครื่อง ไม่ใช่ UTC (ไม่งั้นก่อน 07:00 ใบของวันนี้โดนเตือนว่าอนาคต)
    else if (order_date < '2025-01-01') warnings.push(`วันที่เก่าผิดปกติ (${order_date})`);
  }

  /* ---- ลูกค้า (ฝั่งซ้าย) + ช่องทางติดต่อ ----
     ช่องทางอยู่คอลัมน์กลาง (โซน ~215-275 ×SC — ก่อนถึงคอลัมน์ขวา) ตามด้วย ":" + ค่า
     กัน false-match ชื่อลูกค้าที่บังเอิญมีคำช่องทาง ด้วยการล็อกโซนตำแหน่ง */
  let customer_name = '', customer_social = '', channel_hint = '', channel_token = '', nameLossy = false;
  const midMin = 150 * sc, midMax = Math.min(285 * sc, rightCol - 10 * sc);
  const hasLetters = (s) => (String(s).match(/[A-Za-zก-๙]/g) || []).length >= 2;
  // หาบรรทัดช่องทาง = แถวแรก (จากบน) ที่มีโทเคนช่องทางรูปแบบ "channel:" — ไม่ผูกโซน x (รองรับ layout ต่าง)
  // กันชนคำในชื่อลูกค้า: ต้องมี ":" ตามหลังโทเคนใกล้ๆ (Shipnity พิมพ์ "facebook:" / "line:")
  let custRow = null, chanIdx = -1;
  for (const r of body) {
    // ข้ามแถวเบอร์โทร (Tel:) / เลขภาษี / หมายเหตุ / ผู้ตรวจ — "Tel" แมตช์ channelFromText เป็น Phone ได้ (กัน false-match)
    // (Shipnity ไม่ปล่อย ":" เป็น text item เสมอ จึงไม่บังคับ ":" — ใช้ skip พวก label แทน)
    if (/^tel/i.test(r.text.trim())) continue;
    if (LKS([...L.custTax, ...L.note, ...L.checker]).some(k => r.key.startsWith(k))) continue;
    // ข้ามแถวการชำระ/จัดส่ง — ค่าอย่าง "LINE Pay"/"Lineman" ไม่ใช่ช่องทางลูกค้า (กันชื่อลูกค้าเพี้ยนทั้งใบ)
    if (LKS([...L.payment, ...L.carrier]).some(k => r.key.startsWith(k))) continue;
    // โทเคนช่องทางต้องอยู่ก่อนคอลัมน์ขวา (ค่าในคอลัมน์ขวา = การชำระ/ขนส่ง ไม่ใช่แถวลูกค้า)
    const idx = r.items.findIndex(i => channelFromText(i.s) && i.x < rightCol);
    if (idx < 0) continue;
    custRow = r; chanIdx = idx; break;
  }
  if (custRow) {
    const cx = custRow.items[chanIdx].x;
    // ตำแหน่ง label "เลขที่เอกสาร" ในแถวเดียวกัน (channel-first layout วางเลขที่เอกสารต่อท้ายแถวลูกค้า)
    // — ตัดค่าหลังโทเคนแค่ก่อนถึง docNo แทนใช้ rightCol ทั้งหน้า (rightCol อาจเฉือนชื่อลูกค้าที่อยู่กลางแถว)
    const docStartIdx = (() => {
      const lks = LKS(L.docNo).filter(k => k.length > 2); // ตัด synonym สั้น 'no' — กัน false-match ชื่อ/social ที่ขึ้นต้น "No.1" ฯลฯ
      for (let i = chanIdx + 1; i < custRow.items.length; i++) {
        let acc = '';
        for (let j = i; j < Math.min(custRow.items.length, i + 14); j++) {
          acc += custRow.items[j].s; const k = labelKey(acc).replace(/[:\d]/g, ''); // ":" ติดมากับ item "เอกสาร:" → ตัดออกก่อนเทียบ
          if (!k) continue;
          if (lks.includes(k)) return i;
          if (!lks.some(lk => lk.startsWith(k))) break;
        }
      }
      return -1;
    })();
    const afterEnd = docStartIdx > chanIdx ? docStartIdx : custRow.items.length;
    // ขอบขวาโซนชื่อ (ก่อน docNo) — ใช้กับ fragment ห่อบรรทัด · ไม่ล้ำเข้าคอลัมน์ขวา (docNo/วันที่ ฯลฯ)
    const nameRightX = docStartIdx > chanIdx ? custRow.items[docStartIdx].x - 10 * sc : Math.min(rightCol - 8 * sc, cx + 90 * sc);
    // ชื่อฝั่งซ้ายโทเคน (เคสปกติ "ชื่อ  facebook: social")
    const leftItems = custRow.items.slice(0, chanIdx).filter(i => i.x < cx && num(i.s) == null && !/[:;]/.test(i.s));
    const leftText = joinItems(leftItems, sc).replace(/[:;]\s*$/, '').trim();
    // ค่าหลังโทเคน (social · หรือชื่อ กรณี channel-first) — ตัดก่อน docNo บนแถวเดียวกัน
    const afterItems = custRow.items.slice(chanIdx + 1, afterEnd).filter(i => !/^[:;\s]+$/.test(i.s));
    let afterText = joinItems(afterItems, sc).replace(/^[:;]\s*/, '').trim();
    channel_hint = channelFromText(custRow.items[chanIdx].s) || channelFromText(custRow.text);
    if (hasLetters(leftText)) {
      // เคสปกติ: ชื่อ = ซ้าย · social = ขวาโทเคน — ต่อ "บรรทัดห่อ" แยกโซน (ชื่อ x<cx · social ขวาโทเคน)
      const nameCont = wrappedCont(body, custRow, 0, cx - 5 * sc, sc);
      const socCont = wrappedCont(body, custRow, cx - 2 * sc, nameRightX, sc);
      customer_name = joinWrap(leftText, nameCont).trim();
      customer_social = cleanSocial(joinWrap(afterText, socCont).trim()) || cleanSocial(customer_name);
      if (hasLostMark(leftItems)) nameLossy = true;
    } else {
      // channel-first: ไม่มีชื่อฝั่งซ้าย → ชื่อ = ค่าหลังโทเคน (แฮนเดิลช่องทาง) + บรรทัดห่อ
      const cont = wrappedCont(body, custRow, cx - 5 * sc, nameRightX, sc);
      customer_name = cleanSocial(joinWrap(afterText, cont).trim());
      customer_social = customer_name;
      if (hasLostMark(afterItems)) nameLossy = true;
    }
  }
  if (!custRow) {
    // มีแถวลูกค้าโครงเดียวกัน (ซ้าย + โทเคนกลาง + ":") แต่ช่องทาง "ไม่รู้จัก" → เตือน + เก็บโทเคนไว้เพิ่ม pattern
    const structRow = body.find(r => r.items.some(i => i.x < 120 * sc)
      && r.items.some(i => i.x >= midMin && i.x < midMax && /[A-Za-zก-๙_]{2,}/.test(i.s) && num(i.s) == null)
      && r.items.some(i => i.x >= midMin && i.s.includes(':')));
    if (structRow && !LKS([...L.custTax, ...L.note, ...L.checker]).some(k => structRow.key.includes(k)) && !/^tel/i.test(structRow.text)) {
      const tokIdx = structRow.items.findIndex(i => i.x >= midMin && i.x < midMax && /[A-Za-zก-๙_]{2,}/.test(i.s) && num(i.s) == null);
      channel_token = normThai(structRow.items[tokIdx]?.s || '');
      customer_name = joinItems(structRow.items.slice(0, tokIdx).filter(i => i.x < midMax - 40 * sc && !/[:;]/.test(i.s)), sc);
      if (channel_token) warnings.push(`ช่องทาง "${channel_token}" ยังไม่รู้จัก — เลือกช่องทางเอง`);
      custRow = structRow;
    }
    if (!customer_name) {
      // ไม่มีบรรทัดช่องทางเลย → ชื่อ = แถวซ้าย (x เล็ก) แรกใต้หัวกระดาษที่ไม่ใช่ label ระบบ
      const cand = body.find(r => r.items[0] && r.items[0].x < 60 * sc
        && !LKS(L.custTax).some(k => r.key.includes(k)) && !/^tel/i.test(r.text)
        && !LKS(L.note).some(k => r.key.startsWith(k)) && !LKS(L.checker).some(k => r.key.startsWith(k))
        && r.text.length > 2 && !/\d{3,}/.test(r.text));
      customer_name = cand ? joinItems(cand.items.filter(i => i.x < midMax - 40 * sc), sc) : '';
    }
  }
  if (!customer_name) warnings.push('ชื่อลูกค้า');
  if (nameLossy) warnings.push('ชื่ออาจมีวรรณยุกต์/สระหาย (ฟอนต์ใบเสร็จ) — โปรดตรวจ');
  // ขายหน้าร้าน (การจัดส่ง/ชำระเงิน = "ขายหน้าร้าน") → เดาช่องทาง POS ให้ (ยังแก้ได้ในตารางตรวจ)
  if (!channel_hint && /หน้าร้าน/.test(`${carrier} ${payment_method}`)) channel_hint = 'POS';

  /* ---- Tel + ที่อยู่ลูกค้า (ฝั่งซ้าย ระหว่างแถวภาษีลูกค้า → Tel) ----
     label เบอร์รับหลายรูป (Tel/โทร/เบอร์โทร/มือถือ — ไม่ใช่โทรสาร) · เบอร์ = กลุ่ม 0XXXXXXXXX แรก
     (กันแถวมี 2 เบอร์/แฟกซ์ปนแล้วเลขต่อติดกัน) · ไม่เจอกลุ่ม → เลขทั้งแถว (เคส Shopee mask "Tel: 96") */
  const PHONE_ROW_RE = /^(tel|โทร(?!สาร)|เบอร์โทร|มือถือ|mobile)/i;
  const telRow = body.find(r => r !== custRow && r.items[0] && r.items[0].x < 120 * sc && PHONE_ROW_RE.test(r.text.trim()));
  let customer_phone = '';
  if (telRow) {
    const t = thDigits(telRow.text);
    const m = t.match(/0\d{8,9}/);
    customer_phone = m ? m[0] : t.replace(/[^0-9]/g, '');
  }

  let customer_address = '', customer_tax_id = '';
  const custTaxIdx = body.findIndex(r => r.items[0] && r.items[0].x < 60 * sc && LKS(L.custTax).some(k => r.key.includes(k)));
  if (custTaxIdx >= 0) {
    // เลขประจำตัวผู้เสียภาษีลูกค้า (13 หลัก — ลูกค้าองค์กร/OEM) — เก็บไว้ครบ ไม่ทิ้ง
    const taxDigits = thDigits(body[custTaxIdx].text).replace(/[^0-9]/g, '');
    if (taxDigits.length === 13) customer_tax_id = taxDigits;
    for (let i = custTaxIdx + 1; i < body.length; i++) {
      const r = body[i];
      const leftItems = r.items.filter(x => x.x < rightCol);
      if (!leftItems.length || leftItems[0].x >= 60 * sc) continue;
      const t = joinItems(leftItems, sc);
      if (PHONE_ROW_RE.test(t)) break;
      customer_address += (customer_address ? ' ' : '') + t;
    }
  } else if (custRow) {
    // template ไม่มีบรรทัดเลขภาษี → ที่อยู่ = แถวซ้ายใต้แถวลูกค้า จนถึง Tel/หมายเหตุ/หัวตาราง (ไม่ทิ้งที่อยู่+จังหวัด)
    const ci = body.indexOf(custRow);
    for (let i = ci + 1; i < body.length; i++) {
      const r = body[i];
      if (PHONE_ROW_RE.test(r.text.trim())) break;
      if (LKS([...L.note, ...L.checker]).some(k => r.key.startsWith(k))) break;
      if (LKS(L.hCode).some(k => r.key.includes(k)) && LKS(L.hQty).some(k => r.key.includes(k))) break; // ถึงหัวตารางรายการ
      const leftItems = r.items.filter(x => x.x < rightCol);
      if (!leftItems.length || leftItems[0].x >= 60 * sc) continue;
      customer_address += (customer_address ? ' ' : '') + joinItems(leftItems, sc);
    }
  }
  const province = provinceFrom(customer_address);
  if (!province) warnings.push('จังหวัด');

  // ลูกค้ามาร์เก็ตเพลสถูกปกปิด (Shopee/Lazada/TikTok mask ชื่อ/เบอร์) — เตือน + กัน CRM ขยะ (ดู receiptSubmit)
  const customer_masked = /\*{2,}/.test(customer_name)
    || (/(shopee|lazada|tiktok)/i.test(channel_hint) && customer_phone.length > 0 && customer_phone.length < 6);
  if (customer_masked) warnings.push('ลูกค้าถูกปกปิด (มาร์เก็ตเพลส) — ชื่อ/เบอร์ไม่ครบ');

  if (total == null) warnings.push('ยอดรวม');

  return {
    continuation: false, page: pageNo,
    order_no, order_date, order_time, customer_name, customer_phone, customer_social, customer_masked,
    customer_address, customer_tax_id, province, lines,
    subtotal, discount, shipping, vat, total: total ?? 0,
    payment_method, carrier, note, promo_code, channel_hint, channel_token, warnings,
  };
}

/* เติมข้อมูล "หน้าต่อ" เข้าใบหลัก (prev) — ใช้ทั้งหน้าที่ไม่มีเลขที่เอกสาร และหน้าหัวซ้ำ (เลขเดียวกัน)
   รวมรายการที่ล้นหน้า + สรุปยอด/หมายเหตุ/การชำระ/ขนส่ง (พิมพ์หน้าสุดท้าย) · ไม่แตะ ลูกค้า/วันที่ (ยึดหน้าแรก) */
function mergeContinuation(prev, parsed) {
  if (parsed.lines?.length) prev.lines = [...prev.lines, ...parsed.lines];
  // ยอดรวมจริงมักพิมพ์หน้าสุดท้าย → เติมเมื่อใบหลักยังไม่มี (warning 'ยอดรวม') หรือ total หน้าหลังใหญ่กว่า (grand total > subtotal หน้าแรก)
  if (parsed.total != null && (prev.warnings.includes('ยอดรวม') || parsed.total > (prev.total || 0))) {
    prev.total = parsed.total;
    prev.warnings = prev.warnings.filter(w => w !== 'ยอดรวม');
  }
  if (parsed.subtotal != null && prev.subtotal == null) prev.subtotal = parsed.subtotal;
  if (parsed.discount && !prev.discount) prev.discount = parsed.discount;
  if (parsed.shipping && !prev.shipping) prev.shipping = parsed.shipping;
  if (parsed.vat && !prev.vat) prev.vat = parsed.vat;
  if (parsed.note && !prev.note) prev.note = parsed.note;
  if (parsed.payment_method && !prev.payment_method) prev.payment_method = parsed.payment_method;
  if (parsed.carrier && !prev.carrier) prev.carrier = parsed.carrier;
  if (parsed.promo_code && !prev.promo_code) prev.promo_code = parsed.promo_code;
}

/* ============================================================
   public API
   ============================================================ */
export async function parseReceiptPdf(file) {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  } catch (e) {
    const nm = e?.name || '';
    if (/password/i.test(nm + (e?.message || ''))) throw new Error('ไฟล์ล็อครหัสผ่าน — ปลดล็อคก่อนอัปโหลด', { cause: e });
    if (/invalid|corrupt/i.test(nm + (e?.message || ''))) throw new Error('ไฟล์ไม่ใช่ PDF ที่ถูกต้อง/ไฟล์เสีย', { cause: e });
    throw e;
  }
  const receipts = [];
  let textItemCount = 0;
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const pageW = page.getViewport({ scale: 1 }).width || BASE_W;
      const sc = pageW / BASE_W;
      const rows = await pageToRows(page, sc);
      textItemCount += rows.reduce((s, r) => s + r.items.length, 0);
      const isReceiptPage = findLabel(rows, L.title) || findLabel(rows, L.docNo);
      if (!isReceiptPage && !receipts.length) continue; // หน้าที่ไม่ใช่ใบเสร็จ (ก่อนเจอใบแรก) → ข้าม
      const parsed = parsePage(rows, p, pageW);
      const prev = receipts[receipts.length - 1];
      // "หน้าต่อ" ของใบยาว เมื่อ (ก) หน้านั้นไม่มีเลขที่เอกสาร  หรือ (ข) มีเลขแต่ "ซ้ำ" กับใบล่าสุด
      //   — Shipnity บางใบพิมพ์หัวใบ (รวมเลขที่เอกสาร) ซ้ำตอนล้นหน้า → ต้อง merge ไม่ใช่แยกใบใหม่
      //   ลูกค้า/วันที่/ช่องทาง ยึดหน้าแรก · ยอด/หมายเหตุ/การชำระ/ขนส่ง เอาจากหน้าสุดท้าย (merge เติมเมื่อว่าง/ยอดใหญ่กว่า)
      if (prev && (parsed.continuation || (parsed.order_no && parsed.order_no === prev.order_no))) {
        mergeContinuation(prev, parsed);
        continue;
      }
      receipts.push(parsed);
    }
  } finally {
    try { doc.destroy(); } catch { /* ignore */ }
  }
  // ไฟล์สแกน/รูปภาพ (ไม่มี text layer) → บอกสาเหตุชัด ไม่ใช่ "ไม่พบใบเสร็จ" เฉยๆ
  if (!receipts.length && textItemCount < 5) {
    throw new Error('ไฟล์นี้เป็นสแกน/รูปภาพ (ไม่มีข้อความในไฟล์) — ต้องใช้ PDF ที่เซฟจาก Shipnity โดยตรง');
  }
  // ตรวจความสอดคล้อง sum(lines) vs ยอดบนใบ — ผ่านสูตรใดสูตรหนึ่ง = ok
  for (const r of receipts) {
    if (!r.lines.length) { r.warnings.push('รายการสินค้า'); continue; }
    // บรรทัดที่มียอดแต่ไม่มีรหัสสินค้า → design matching อาจพลาดเงียบ (เตือนให้ตรวจ)
    if (r.lines.some(l => (l.amount || 0) > 0 && !String(l.code || '').trim())) r.warnings.push('บางรายการไม่มีรหัสสินค้า — ตรวจการจับคู่ลาย');
    const sum = r.lines.reduce((s, l) => s + (l.amount || 0), 0);
    const near = (a, b) => Math.abs(a - b) <= 0.01;
    const ok = (r.subtotal != null && near(sum, r.subtotal))
      || near(sum, r.total || 0)
      || near(sum - (r.discount || 0) + (r.shipping || 0) + (r.vat || 0), r.total || 0)
      || (r.subtotal != null && near(r.subtotal - (r.discount || 0) + (r.shipping || 0) + (r.vat || 0), r.total || 0));
    if (!ok) r.warnings.push(`ยอดรายการรวม ${sum.toFixed(2)} ไม่ตรงยอดบนใบ`);
  }
  return receipts;
}

/* อ่านหลายไฟล์ (multi-select) → ใบทั้งหมด + error ต่อไฟล์ · onProgress(done,total) */
export async function parseReceiptFiles(files, onProgress) {
  const out = []; const errors = [];
  let done = 0;
  for (const f of files) {
    try {
      const rs = await parseReceiptPdf(f);
      if (!rs.length) errors.push({ file: f.name, error: 'ไม่พบใบเสร็จในไฟล์ (ไม่เจอหัว "ใบเสร็จรับเงิน"/เลขที่เอกสาร)' });
      rs.forEach(r => out.push({ ...r, fileName: f.name, file: f }));
    } catch (e) {
      errors.push({ file: f.name, error: e?.message || 'อ่านไฟล์ไม่สำเร็จ' });
    }
    done += 1; onProgress?.(done, files.length);
  }
  return { receipts: out, errors };
}

/* derive ประเภทงานจากหมายเหตุ (กติกา: พิมพ์คำว่า "DFT" ในหมายเหตุ)
   ใช้ \bdft\b ให้ตรงกับ isDftNote (marketplace import) + saleData re-derive → ทั้งระบบตัดสิน DFT เหมือนกัน */
export const jobTypeFromNote = (note) => (/\bdft\b/i.test(String(note || '')) ? 'DFT' : 'ปลีก');
/* การชำระ: cod/ปลายทาง/pay_later หรือขนส่งมี COD → COD · ที่เหลือมีค่า = โอน (ชื่อธนาคาร เช่น scb) */
export const paymentKind = (method, carrier) => (/cod|ปลายทาง|เก็บเงินปลายทาง|pay[_ ]?later/i.test(`${method || ''} ${carrier || ''}`) ? 'COD' : (String(method || '').trim() ? 'โอน' : ''));
