/* สมุดเคลื่อนไหวสต็อก (PLAN-STOCK-V2 ระยะ 2)
   คงเหลือ = หมุดนับล่าสุด + (รับเข้า/ปรับ หลังหมุด) − (ขาย หลังหมุด)
   = "ตั้งต้น + PO รับเข้า − Sale ขาย" โดยการนับจริงรีเซ็ตทุกอย่างก่อนหน้า */
import { describe, it, expect } from 'vitest';
import { balanceFromMoves, movesFromReceive, moveId, voidMove, skuLedger, sessionsFromMoves, roundId } from '../stockMoves.js';

const K = 'ลายA||ดำ||M';
const mv = (o) => ({ sku_key: K, design: 'ลายA', color: 'ดำ', size: 'M', product_code: 'P1', eod: true, ...o });
const sku = (d, q) => ({ design: 'ลายA', color: 'ดำ', size: 'M', qty: q, order_date: d });

describe('balanceFromMoves', () => {
  it('ตั้งต้นอย่างเดียว', () => {
    const b = balanceFromMoves([mv({ kind: 'open', qty: 100, moved_on: '2026-09-01' })], []);
    expect(b[0].balance).toBe(100);
  });

  it('ตั้งต้น + รับเข้า − ขาย (สูตรที่ user ต้องการ)', () => {
    const moves = [
      mv({ kind: 'open', qty: 100, moved_on: '2026-09-01' }),
      mv({ kind: 'in', qty: 50, moved_on: '2026-09-05', ref_type: 'po', ref_id: 'PO-1' }),
    ];
    const b = balanceFromMoves(moves, [sku('2026-09-03', 20), sku('2026-09-07', 10)]);
    expect(b[0].balance).toBe(120);          // 100 + 50 − 30
    expect(b[0].received).toBe(50);
    expect(b[0].sold).toBe(30);
  });

  it('นับใหม่ = รีเซ็ต ทุกอย่างก่อนหน้าถูกทิ้ง', () => {
    const moves = [
      mv({ kind: 'open', qty: 100, moved_on: '2026-09-01' }),
      mv({ kind: 'in', qty: 50, moved_on: '2026-09-05' }),
      mv({ kind: 'count', qty: 80, moved_on: '2026-09-10' }),   // นับได้จริง 80
      mv({ kind: 'in', qty: 20, moved_on: '2026-09-12' }),
    ];
    const b = balanceFromMoves(moves, [sku('2026-09-03', 999), sku('2026-09-15', 5)]);
    expect(b[0].balance).toBe(95);           // 80 + 20 − 5 (ยอดขาย 3 ก.ย. ถูกทิ้งเพราะอยู่ก่อนหมุด)
  });

  it('eod=true (นับตอนปิดร้าน) → ยอดขายวันที่นับ ถือว่ารวมแล้ว', () => {
    const b = balanceFromMoves([mv({ kind: 'count', qty: 50, moved_on: '2026-09-10', eod: true })], [sku('2026-09-10', 7)]);
    expect(b[0].balance).toBe(50);
  });

  it('eod=false (นับตอนเช้าก่อนขาย) → ต้องหักยอดของวันนั้นด้วย', () => {
    const b = balanceFromMoves([mv({ kind: 'count', qty: 50, moved_on: '2026-09-10', eod: false })], [sku('2026-09-10', 7)]);
    expect(b[0].balance).toBe(43);
  });

  it('ติดลบต้องปล่อยติดลบ ไม่ปัดเป็น 0 (ติดลบ = นับตกหรือขายซ้ำ ต้องรู้)', () => {
    const b = balanceFromMoves([mv({ kind: 'count', qty: 5, moved_on: '2026-09-01' })], [sku('2026-09-05', 9)]);
    expect(b[0].balance).toBe(-4);
  });

  it('ยกเลิกการรับเข้า = ลงแถวกลับ (ไม่ลบของเดิม)', () => {
    const moves = [
      mv({ kind: 'open', qty: 10, moved_on: '2026-09-01' }),
      mv({ kind: 'in', qty: 50, moved_on: '2026-09-05', ref_id: 'PO-1' }),
      mv({ kind: 'in', qty: -50, moved_on: '2026-09-06', ref_id: 'PO-1', note: 'ยกเลิกการรับเข้า' }),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(10);
  });

  it('SKU ที่ไม่เคยมี move = ไม่โผล่ (ไม่รู้ฐาน)', () => {
    expect(balanceFromMoves([], [sku('2026-09-05', 3)])).toEqual([]);
  });

  it('รับเข้าย้อนหลัง "ก่อน" วันนับล่าสุด ต้องไม่ถูกบวกซ้ำ (การนับนับของล็อตนั้นไปแล้ว)', () => {
    // ของมาถึง 5 มี.ค. → นับสต็อก 8 มี.ค. (นับเจอของล็อตนั้นแล้ว = 30)
    // ถ้าแถว in ถูกบันทึกเป็น "วันนี้" แทนวันที่ของมาถึง จะกลายเป็นหลังหมุด → 30+10 = 40 ผิด
    const moves = [
      mv({ kind: 'in', qty: 10, moved_on: '2026-03-05', created_at: '2026-03-05T10:00:00Z', ref_type: 'po', ref_id: 'PO-1' }),
      mv({ kind: 'count', qty: 30, moved_on: '2026-03-08', created_at: '2026-03-08T18:00:00Z' }),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(30);
  });
  it('นับย้อนหลัง (คีย์เข้าระบบทีหลัง) ต้องไม่ทำให้ของที่รับเข้าหลังวันนับหายไป', () => {
    /* พนักงานนับของวันที่ 1 แต่มาคีย์เข้าระบบวันที่ 3 → หมุดมี created_at = วันที่ 3
       PO รับเข้าวันที่ 2 (บันทึกวันที่ 2) = เกิด "หลังวันนับ" จริง ต้องบวกเข้าคงเหลือ
       เดิมกรอง created_at >= หมุด กับ move ทุกตัว → แถวนี้ถูกตัดทิ้ง ของ 200 ตัวหายเงียบ */
    const moves = [
      mv({ kind: 'count', qty: 50, moved_on: '2026-03-01', created_at: '2026-03-03T09:00:00Z' }),
      mv({ kind: 'in', qty: 200, moved_on: '2026-03-02', created_at: '2026-03-02T10:00:00Z', ref_type: 'po', ref_id: 'PO-9' }),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(250);
  });

  it('นับย้อนหลัง: ของที่รับเข้า "ก่อน" วันนับ ยังต้องไม่ถูกบวกซ้ำ', () => {
    const moves = [
      mv({ kind: 'in', qty: 200, moved_on: '2026-02-28', created_at: '2026-02-28T10:00:00Z', ref_type: 'po', ref_id: 'PO-8' }),
      mv({ kind: 'count', qty: 50, moved_on: '2026-03-01', created_at: '2026-03-03T09:00:00Z' }),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(50);
  });

  it('รับเข้า "วันเดียวกับ" วันนับ — นับก่อนแล้วของมาทีหลัง ต้องบวก', () => {
    const moves = [
      mv({ kind: 'count', qty: 50, moved_on: '2026-03-01', created_at: '2026-03-01T09:00:00Z' }),
      mv({ kind: 'in', qty: 10, moved_on: '2026-03-01', created_at: '2026-03-01T15:00:00Z', ref_type: 'po', ref_id: 'PO-7' }),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(60);
  });

  it('รับเข้า "วันเดียวกับ" วันนับ — ของมาก่อนแล้วค่อยนับ ต้องไม่บวกซ้ำ (การนับเห็นของแล้ว)', () => {
    const moves = [
      mv({ kind: 'in', qty: 10, moved_on: '2026-03-01', created_at: '2026-03-01T09:00:00Z', ref_type: 'po', ref_id: 'PO-6' }),
      mv({ kind: 'count', qty: 50, moved_on: '2026-03-01', created_at: '2026-03-01T15:00:00Z' }),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(50);
  });

  it('หมุดวันเดียวกัน ใช้แถวที่บันทึกทีหลัง', () => {
    const moves = [
      mv({ kind: 'count', qty: 10, moved_on: '2026-09-10', created_at: '2026-09-10T02:00:00Z' }),
      mv({ kind: 'count', qty: 30, moved_on: '2026-09-10', created_at: '2026-09-10T09:00:00Z' }),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(30);
  });
});

describe('movesFromReceive — PO รับเข้าเป็น "แถวบวก" ไม่ใช่หมุดที่คำนวณเอง', () => {
  it('สร้าง move kind=in ต่อบรรทัด พร้อมผูก PO', () => {
    const ms = movesFromReceive({
      lines: [{ design: 'ลายA', color: 'ดำ', size: 'M', qty: 12, productCode: 'P1' }],
      poId: 'PO-690902-1', movedOn: '2026-09-02', by: 'a@tmk.co',
    });
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ kind: 'in', qty: 12, ref_type: 'po', ref_id: 'PO-690902-1', moved_on: '2026-09-02' });
    expect(ms[0].sku_key).toBe(K);
  });
  it('ข้ามบรรทัดที่จำนวน <= 0 หรือข้อมูลไม่ครบ', () => {
    expect(movesFromReceive({ lines: [{ design: 'ลายA', color: 'ดำ', size: 'M', qty: 0 }, { design: '', color: 'ดำ', size: 'M', qty: 5 }], poId: 'X', movedOn: '2026-09-02' })).toEqual([]);
  });
  it('id เดิมทุกครั้งสำหรับ PO+SKU+วัน เดียวกัน (กันกดซ้ำแล้วบวกซ้ำ)', () => {
    const a = movesFromReceive({ lines: [{ design: 'ลายA', color: 'ดำ', size: 'M', qty: 12 }], poId: 'PO-1', movedOn: '2026-09-02' });
    const b = movesFromReceive({ lines: [{ design: 'ลายA', color: 'ดำ', size: 'M', qty: 12 }], poId: 'PO-1', movedOn: '2026-09-02' });
    expect(a[0].id).toBe(b[0].id);
  });
  it('รับเข้าคนละรอบวันเดียวกัน ต้องได้คนละ id (seq)', () => {
    const a = movesFromReceive({ lines: [{ design: 'ลายA', color: 'ดำ', size: 'M', qty: 5 }], poId: 'PO-1', movedOn: '2026-09-02', seq: 1 });
    const b = movesFromReceive({ lines: [{ design: 'ลายA', color: 'ดำ', size: 'M', qty: 5 }], poId: 'PO-1', movedOn: '2026-09-02', seq: 2 });
    expect(a[0].id).not.toBe(b[0].id);
  });
});

describe('moveId — deterministic', () => {
  it('รูปแบบคงที่ อ่านออกว่ามาจากไหน', () => {
    expect(moveId('po', 'PO-1', K, '2026-09-02', 0)).toBe('po::PO-1::0::ลายA||ดำ||M::2026-09-02');
  });
});

/* ============================================================
   parity — สูตรใหม่ต้องให้ผลเท่าสูตรเดิมในเคสปกติ
   ============================================================
   ระยะ 3 จะสลับหน้าคงเหลือมาอ่านจาก moves — ถ้าสองสูตรไม่ตรงกัน ตัวเลขจะขยับเงียบ ๆ
   เทสนี้บังคับให้ตรงกันในเคสที่โมเดลเดิมทำได้ (นับตอนปิดร้าน + ไม่มีการรับเข้า)
   ============================================================ */
describe('เทียบกับสูตรเดิม (stockBalance)', () => {
  it('นับอย่างเดียว + ขายหลังนับ → เท่ากันเป๊ะ', async () => {
    const { stockBalance } = await import('../stockCount.js');
    const counts = [{ design: 'ลายA', color: 'ดำ', size: 'M', qty: 100, count_date: '2026-09-01', kind: 'count', created_at: '2026-09-01T10:00:00Z' }];
    const skus = [sku('2026-09-03', 20), sku('2026-09-07', 10)];
    const old = stockBalance(counts, skus);
    const neo = balanceFromMoves([mv({ kind: 'count', qty: 100, moved_on: '2026-09-01', created_at: '2026-09-01T10:00:00Z' })], skus);
    expect(neo[0].balance).toBe(old[0].balance);
    expect(neo[0].balance).toBe(70);
  });

  it('ขายวันเดียวกับวันนับ → เท่ากันทั้งคู่ (ถือว่ารวมแล้ว)', async () => {
    const { stockBalance } = await import('../stockCount.js');
    const counts = [{ design: 'ลายA', color: 'ดำ', size: 'M', qty: 50, count_date: '2026-09-10', kind: 'count', created_at: '2026-09-10T10:00:00Z' }];
    const skus = [sku('2026-09-10', 7)];
    expect(balanceFromMoves([mv({ kind: 'count', qty: 50, moved_on: '2026-09-10' })], skus)[0].balance)
      .toBe(stockBalance(counts, skus)[0].balance);
  });

  it('นับหลายรอบ → ทั้งคู่ใช้รอบล่าสุด', async () => {
    const { stockBalance } = await import('../stockCount.js');
    const counts = [
      { design: 'ลายA', color: 'ดำ', size: 'M', qty: 100, count_date: '2026-09-01', kind: 'count', created_at: '2026-09-01T10:00:00Z' },
      { design: 'ลายA', color: 'ดำ', size: 'M', qty: 40, count_date: '2026-09-10', kind: 'count', created_at: '2026-09-10T10:00:00Z' },
    ];
    const skus = [sku('2026-09-05', 99), sku('2026-09-12', 5)];
    const moves = [
      mv({ kind: 'count', qty: 100, moved_on: '2026-09-01', created_at: '2026-09-01T10:00:00Z' }),
      mv({ kind: 'count', qty: 40, moved_on: '2026-09-10', created_at: '2026-09-10T10:00:00Z' }),
    ];
    expect(balanceFromMoves(moves, skus)[0].balance).toBe(stockBalance(counts, skus)[0].balance);
    expect(balanceFromMoves(moves, skus)[0].balance).toBe(35);
  });
});

/* ---------- ประวัติรายชิ้น: รวมการเคลื่อนไหว + ยอดขาย เป็นไทม์ไลน์เดียว ---------- */
describe('skuLedger — ตอบให้ได้ว่า "ทำไมเหลือ N"', () => {
  it('เรียงตามวัน + มียอดสะสมวิ่ง (running balance)', async () => {
    const { skuLedger } = await import('../stockMoves.js');
    const moves = [
      mv({ kind: 'open', qty: 100, moved_on: '2026-09-01' }),
      mv({ kind: 'in', qty: 50, moved_on: '2026-09-05', ref_type: 'po', ref_id: 'PO-1' }),
    ];
    const l = skuLedger(K, moves, [sku('2026-09-03', 20), sku('2026-09-07', 10)]);
    expect(l.map(x => x.kind)).toEqual(['open', 'out', 'in', 'out']);
    expect(l.map(x => x.qty)).toEqual([100, -20, 50, -10]);
    expect(l.map(x => x.running)).toEqual([100, 80, 130, 120]);   // ตรงกับ balanceFromMoves
  });

  it('ตัดทุกอย่างก่อนหมุดนับล่าสุดออก (หมุด = ความจริงที่รีเซ็ต)', async () => {
    const { skuLedger } = await import('../stockMoves.js');
    const moves = [
      mv({ kind: 'open', qty: 100, moved_on: '2026-09-01' }),
      mv({ kind: 'count', qty: 40, moved_on: '2026-09-10' }),
    ];
    const l = skuLedger(K, moves, [sku('2026-09-05', 99), sku('2026-09-12', 5)]);
    expect(l.map(x => x.kind)).toEqual(['count', 'out']);
    expect(l[l.length - 1].running).toBe(35);
  });

  it('SKU อื่นไม่ปน', async () => {
    const { skuLedger } = await import('../stockMoves.js');
    const other = { ...mv({ kind: 'open', qty: 7, moved_on: '2026-09-01' }), sku_key: 'ลายB||ดำ||M', design: 'ลายB' };
    expect(skuLedger(K, [mv({ kind: 'open', qty: 3, moved_on: '2026-09-01' }), other], [])).toHaveLength(1);
  });

  it('ไม่มีหมุด = ไม่มีประวัติให้ดู (ไม่รู้ฐาน)', async () => {
    const { skuLedger } = await import('../stockMoves.js');
    expect(skuLedger(K, [], [sku('2026-09-05', 3)])).toEqual([]);
  });
});

/* ---------- ระยะ 4: ประวัติรอบนับอ่านจาก moves ---------- */
describe('sessionsFromMoves — ประวัติรอบนับจากสมุดเคลื่อนไหว', () => {
  it('รวมเป็นรอบตาม ref_id + นับ SKU/จำนวนรวม', async () => {
    const { sessionsFromMoves } = await import('../stockMoves.js');
    const ms = [
      mv({ kind: 'count', qty: 10, moved_on: '2026-09-10', ref_type: 'count', ref_id: 'S1', created_at: '2026-09-10T03:00:00Z', created_by: 'a@tmk.co' }),
      { ...mv({ kind: 'count', qty: 5, moved_on: '2026-09-10', ref_type: 'count', ref_id: 'S1', created_at: '2026-09-10T03:00:01Z' }), sku_key: 'ลายA||ดำ||L', size: 'L' },
    ];
    const s = sessionsFromMoves(ms);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ sessionId: 'S1', date: '2026-09-10', kind: 'count', rows: 2, qty: 15, by: 'a@tmk.co' });
  });

  it('เรียงรอบใหม่สุดขึ้นก่อน', async () => {
    const ms = [
      mv({ kind: 'count', qty: 1, moved_on: '2026-09-01', ref_id: 'S1', created_at: '2026-09-01T00:00:00Z' }),
      mv({ kind: 'count', qty: 1, moved_on: '2026-09-20', ref_id: 'S2', created_at: '2026-09-20T00:00:00Z' }),
    ];
    expect((await import('../stockMoves.js')).sessionsFromMoves(ms).map(x => x.sessionId)).toEqual(['S2', 'S1']);
  });

  it('รับเข้าจาก PO ก็เป็นรายการในประวัติด้วย (แยก kind)', async () => {
    const { sessionsFromMoves } = await import('../stockMoves.js');
    const s = sessionsFromMoves([mv({ kind: 'in', qty: 30, moved_on: '2026-09-05', ref_type: 'po', ref_id: 'PO-1' })]);
    expect(s[0]).toMatchObject({ sessionId: 'PO-1', kind: 'in', qty: 30, refType: 'po' });
  });

  it('ไม่มี move = ลิสต์ว่าง', async () => {
    expect((await import('../stockMoves.js')).sessionsFromMoves([])).toEqual([]);
  });
});

/* ============================================================
   ยกเลิกรอบ ในสมุดที่ลบไม่ได้ (7 ก.ย. 69)
   ============================================================
   tmk_stock_moves เป็น append-only (revoke update, delete) — ลบแถวไม่ได้เลย
   แต่ปุ่ม "ยกเลิกรอบนับ" เดิมไปลบที่ tmk_stock_counts อย่างเดียว
   → พอหน้าอ่านจาก moves แล้ว หมุดเดิมยังอยู่ คงเหลือไม่ขยับ แต่ toast บอกว่าสำเร็จ
   (รอบที่เป็น "รับเข้าจาก PO" ยิ่งหนัก — ลบแล้วแมตช์ 0 แถว ไม่ error รายงานสำเร็จ)
   วิธีที่ถูกกับสมุดแบบนี้: ลงแถวยกเลิก (kind='void') ชี้ ref_id ของรอบนั้น
   ============================================================ */
describe('ยกเลิกรอบด้วยแถว void', () => {
  const anchor = (sid, qty, on, at) => mv({ kind: 'count', qty, moved_on: on, created_at: at, ref_type: 'count', ref_id: sid, round_id: roundId('count', sid, 0) });
  const receive = (pid, qty, on, at) => mv({ kind: 'in', qty, moved_on: on, created_at: at, ref_type: 'po', ref_id: pid, round_id: roundId('po', pid, 0) });
  // ยกเลิกต้องชี้ "งวด" ไม่ใช่ ref_id เปล่า ๆ (ดูชุดเทส "void ระดับงวด" ด้านล่าง)
  const voidOf = (rid) => voidMove({ roundId: rid, movedOn: '2026-03-10' });

  it('ยกเลิกรอบนับล่าสุด → คงเหลือย้อนไปใช้การนับก่อนหน้า', () => {
    const moves = [
      anchor('s1', 100, '2026-03-01', '2026-03-01T00:00:00Z'),
      anchor('s2', 6, '2026-03-05', '2026-03-05T00:00:00Z'),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(6);
    expect(balanceFromMoves([...moves, voidOf(roundId('count', 's2', 0))], [])[0].balance).toBe(100);
  });

  it('ยกเลิกการรับเข้าจากใบสั่งผลิต → ของที่รับหายออกจากคงเหลือ', () => {
    const moves = [
      anchor('s1', 100, '2026-03-01', '2026-03-01T00:00:00Z'),
      receive('PO-1', 50, '2026-03-03', '2026-03-03T00:00:00Z'),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(150);
    expect(balanceFromMoves([...moves, voidOf(roundId('po', 'PO-1', 0))], [])[0].balance).toBe(100);
  });

  it('ยกเลิกรอบนับรอบเดียวที่มี → กลับไปเป็น "ยังไม่นับ" (ไม่ใช่ 0)', () => {
    const moves = [anchor('s1', 100, '2026-03-01', '2026-03-01T00:00:00Z')];
    expect(balanceFromMoves([...moves, voidOf(roundId('count', 's1', 0))], [])).toEqual([]);
  });

  it('รอบที่ถูกยกเลิกต้องหายจากประวัติ และแถว void เองก็ไม่โผล่', () => {
    const moves = [
      anchor('s1', 100, '2026-03-01', '2026-03-01T00:00:00Z'),
      anchor('s2', 6, '2026-03-05', '2026-03-05T00:00:00Z'),
      voidOf(roundId('count', 's2', 0)),
    ];
    const ids = sessionsFromMoves(moves).map(s => s.sessionId);
    expect(ids).toEqual(['s1']);
  });

  it('ไทม์ไลน์ราย SKU ต้องไม่นับรอบที่ยกเลิกแล้ว', () => {
    const moves = [
      anchor('s1', 100, '2026-03-01', '2026-03-01T00:00:00Z'),
      anchor('s2', 6, '2026-03-05', '2026-03-05T00:00:00Z'),
      voidOf(roundId('count', 's2', 0)),
    ];
    const led = skuLedger(K, moves, []);
    expect(led.map(x => x.qty)).toEqual([100]);
  });

  it('voidMove: ผูกคีย์งวดที่ยกเลิก + id คำนวณได้ (กดซ้ำไม่เกิดแถวซ้ำ)', () => {
    const rid = roundId('count', 's2', 0);
    const a = voidMove({ roundId: rid, movedOn: '2026-03-10', by: 'art@tmk.co', note: 'นับผิด' });
    const b = voidMove({ roundId: rid, movedOn: '2026-03-10', by: 'art@tmk.co', note: 'นับผิด' });
    expect(a.id).toBe(b.id);
    expect(a.kind).toBe('void');
    expect(a.ref_id).toBe(rid);         // เก็บ "งวด" ไม่ใช่ ref_id ของ PO/รอบนับ
    expect(a.qty).toBe(0);
    expect(a.sku_key).toBeTruthy();     // คอลัมน์ not null ในฐานข้อมูล
  });
});

/* ============================================================
   ยกเลิกต้องแม่นระดับ "งวด" ไม่ใช่ทั้ง PO (8 ก.ย. 69)
   ============================================================
   บั๊กที่ผมทำเองเมื่อ 7 ก.ย.: activeMoves กรองด้วย ref_id ซึ่งการรับเข้าทุกงวดของ PO
   ใช้ค่าเดียวกัน → ยกเลิก 1 งวด = PO ใบนั้นรับของเข้าระบบไม่ได้อีกตลอดกาล
   (พิสูจน์: ตั้งต้น 10 → รับ 5 → ยกเลิก → รับใหม่ 3 → คงเหลือค้าง 10 ไม่ใช่ 13)
   ============================================================ */
describe('void ระดับงวด (round)', () => {
  const anchor = (sid, qty, on, at) => mv({ kind: 'count', qty, moved_on: on, created_at: at, ref_type: 'count', ref_id: sid, round_id: roundId('count', sid, 0) });
  const recv = (pid, qty, on, at, seq) => mv({ kind: 'in', qty, moved_on: on, created_at: at, ref_type: 'po', ref_id: pid, round_id: roundId('po', pid, seq) });

  it('ยกเลิกงวดแรกแล้วรับงวดใหม่ ต้องบวกเข้าคงเหลือปกติ', () => {
    const base = [anchor('s1', 10, '2026-03-01', '2026-03-01T00:00:00Z')];
    const g1 = recv('PO-9', 5, '2026-03-02', '2026-03-02T00:00:00Z', 0);
    const vd = voidMove({ roundId: roundId('po', 'PO-9', 0), movedOn: '2026-03-03' });
    const g2 = recv('PO-9', 3, '2026-03-04', '2026-03-04T00:00:00Z', 5);
    expect(balanceFromMoves([...base, g1], [])[0].balance).toBe(15);
    expect(balanceFromMoves([...base, g1, vd], [])[0].balance).toBe(10);
    expect(balanceFromMoves([...base, g1, vd, g2], [])[0].balance).toBe(13);   // ← เดิมได้ 10
  });

  it('ยกเลิกงวดที่สอง ไม่กระทบงวดแรก', () => {
    const base = [anchor('s1', 10, '2026-03-01', '2026-03-01T00:00:00Z')];
    const g1 = recv('PO-9', 5, '2026-03-02', '2026-03-02T00:00:00Z', 0);
    const g2 = recv('PO-9', 7, '2026-03-05', '2026-03-05T00:00:00Z', 5);
    const vd = voidMove({ roundId: roundId('po', 'PO-9', 5), movedOn: '2026-03-06' });
    expect(balanceFromMoves([...base, g1, g2], [])[0].balance).toBe(22);
    expect(balanceFromMoves([...base, g1, g2, vd], [])[0].balance).toBe(15);
  });

  it('ประวัติแยกงวด ไม่ยุบเป็นแถวเดียว + วันที่ของแต่ละงวดถูกต้อง', () => {
    const g1 = recv('PO-1', 30, '2026-09-03', '2026-09-03T00:00:00Z', 0);
    const g2 = recv('PO-1', 20, '2026-09-06', '2026-09-06T00:00:00Z', 30);
    const ss = sessionsFromMoves([g1, g2]);
    expect(ss).toHaveLength(2);
    expect(ss.map(x => [x.date, x.qty])).toEqual([['2026-09-06', 20], ['2026-09-03', 30]]);
  });

  it('แถวเก่าที่ยังไม่มี round_id → ถอดจาก id ได้ (ไม่พังกับข้อมูลเดิม)', () => {
    const old = mv({ id: moveId('po', 'PO-7', K, '2026-03-02', 0), kind: 'in', qty: 9, moved_on: '2026-03-02', created_at: '2026-03-02T00:00:00Z', ref_type: 'po', ref_id: 'PO-7' });
    const base = [anchor('s1', 10, '2026-03-01', '2026-03-01T00:00:00Z')];
    expect(balanceFromMoves([...base, old], [])[0].balance).toBe(19);
    const vd = voidMove({ roundId: roundId('po', 'PO-7', 0), movedOn: '2026-03-03' });
    expect(balanceFromMoves([...base, old, vd], [])[0].balance).toBe(10);
  });
});

/* isAfterAnchor — ต้องคุมทุกสาขา (mutation `>=` → `>` เคยเขียนผ่าน = เทสพิสูจน์อะไรไม่ได้) */
describe('isAfterAnchor ครบทุกสาขา', () => {
  const A = (at) => mv({ kind: 'count', qty: 100, moved_on: '2026-03-05', created_at: at, ref_type: 'count', ref_id: 's1' });
  const IN = (on, at) => mv({ kind: 'in', qty: 7, moved_on: on, created_at: at, ref_type: 'po', ref_id: 'PO-1' });

  it('created_at เท่ากันเป๊ะ (insert ชุดเดียว/backfill) → ถือว่าเกิดพร้อมหมุด ไม่บวกซ้ำ', () => {
    const t = '2026-03-05T10:00:00Z';
    expect(balanceFromMoves([A(t), IN('2026-03-05', t)], [])[0].balance).toBe(100);
  });

  it('ไม่มี created_at ทั้งคู่ → ไม่บวกซ้ำ (เดิม "" >= "" = true → บวกทุกแถว)', () => {
    expect(balanceFromMoves([A(''), IN('2026-03-05', '')], [])[0].balance).toBe(100);
  });

  it('หมุดไม่มี created_at แต่ move มี → ไม่รู้ลำดับ ต้องไม่บวก (ฝั่งที่ปลอดภัยกว่า)', () => {
    // '2026-03-05T09:00:00Z' > '' เป็น true ถ้าไม่มี guard → บวกเกินโดยไม่มีข้อมูลรองรับ
    expect(balanceFromMoves([A(''), IN('2026-03-05', '2026-03-05T09:00:00Z')], [])[0].balance).toBe(100);
  });

  it('move ไม่มี created_at แต่หมุดมี → ไม่บวกเช่นกัน', () => {
    expect(balanceFromMoves([A('2026-03-05T09:00:00Z'), IN('2026-03-05', '')], [])[0].balance).toBe(100);
  });

  it('นับก่อน ของมาทีหลังในวันเดียวกัน → ต้องบวก', () => {
    expect(balanceFromMoves([A('2026-03-05T09:00:00Z'), IN('2026-03-05', '2026-03-05T15:00:00Z')], [])[0].balance).toBe(107);
  });

  it('ของมาก่อน แล้วค่อยนับ (วันเดียวกัน) → การนับเห็นของแล้ว ไม่บวกซ้ำ', () => {
    expect(balanceFromMoves([A('2026-03-05T15:00:00Z'), IN('2026-03-05', '2026-03-05T09:00:00Z')], [])[0].balance).toBe(100);
  });
});

/* ============================================================
   SKU ที่ยังไม่เคยนับ แต่มีของรับเข้าแล้ว ต้องไม่หายทั้งก้อน (8 ก.ย. 69)
   ============================================================
   เดิม `if (!anchor) continue` ทิ้งทั้งแถว → เปิด PO ลายใหม่ 100 ตัว กดรับเข้า
   toast สำเร็จ สมุดมีแถว in 100 แต่หน้าคงเหลือไม่มีลายนั้นเลย และช่อง "กำลังจะเข้า" ก็ 0
   (เพราะคอลัมน์นั้นวนบน rows เดียวกัน) → ของ 100 ตัวมองไม่เห็นจนกว่าจะมีคนไปนับ
   กติกาใหม่: ไม่มีหมุด = ยังไม่รู้ "ฐาน" จริง แต่รู้ว่ามีของเข้ามาแล้วเท่าไร
   → โชว์แถวนั้นด้วย counted=null (UI ขึ้น "ยังไม่นับ") แต่ received/balance นับจากที่รับเข้าจริง
   ============================================================ */
describe('SKU ที่มีแต่รับเข้า (ยังไม่เคยนับ)', () => {
  const recv = (qty, on) => mv({ kind: 'in', qty, moved_on: on, created_at: on + 'T00:00:00Z', ref_type: 'po', ref_id: 'PO-5', round_id: roundId('po', 'PO-5', 0) });

  it('ต้องโผล่ในตาราง พร้อมยอดที่รับเข้า', () => {
    const rows = balanceFromMoves([recv(100, '2026-03-01')], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].received).toBe(100);
    expect(rows[0].balance).toBe(100);
    expect(rows[0].counted).toBeNull();     // ยังไม่เคยนับ — UI ต้องแยกออกจาก "นับได้ 0"
    expect(rows[0].countDate).toBe('');
  });

  it('ขายไปหลังรับเข้า ต้องหักออก', () => {
    const rows = balanceFromMoves([recv(100, '2026-03-01')], [sku('2026-03-02', 30)]);
    expect(rows[0].sold).toBe(30);
    expect(rows[0].balance).toBe(70);
  });

  it('ขายก่อนวันรับเข้า ไม่หัก (ของยังไม่มา)', () => {
    const rows = balanceFromMoves([recv(100, '2026-03-05')], [sku('2026-03-01', 30)]);
    expect(rows[0].sold).toBe(0);
    expect(rows[0].balance).toBe(100);
  });

  it('พอนับแล้ว หมุดชนะ — กลับไปใช้กติกาเดิม', () => {
    const rows = balanceFromMoves([
      recv(100, '2026-03-01'),
      mv({ kind: 'count', qty: 80, moved_on: '2026-03-03', created_at: '2026-03-03T00:00:00Z', ref_type: 'count', ref_id: 's1', round_id: roundId('count', 's1', 0) }),
    ], []);
    expect(rows[0].counted).toBe(80);
    expect(rows[0].balance).toBe(80);       // ของที่รับก่อนนับ ไม่บวกซ้ำ
  });

  it('ยกเลิกงวดรับเข้าแล้ว SKU นั้นหายไปเลย (ไม่เหลือแถวเปล่า)', () => {
    const vd = voidMove({ roundId: roundId('po', 'PO-5', 0), movedOn: '2026-03-09' });
    expect(balanceFromMoves([recv(100, '2026-03-01'), vd], [])).toEqual([]);
  });
});

/* แถว move ที่ชนิดไม่รู้จัก ต้องไม่สร้าง SKU ผี (เจอตอน DOM test แดง 8 ก.ย. 69) */
describe('kind ที่ไม่รู้จัก', () => {
  it('kind ว่าง/สะกดผิด → ไม่โผล่ในตารางคงเหลือ', () => {
    expect(balanceFromMoves([mv({ kind: '', qty: 5, moved_on: '2026-03-01', created_at: '2026-03-01T00:00:00Z' })], [])).toEqual([]);
    expect(balanceFromMoves([mv({ kind: 'inn', qty: 5, moved_on: '2026-03-01', created_at: '2026-03-01T00:00:00Z' })], [])).toEqual([]);
  });

  it('kind ที่ไม่รู้จัก ไม่บวกเข้าคงเหลือของ SKU ที่นับแล้ว', () => {
    const a = mv({ kind: 'count', qty: 10, moved_on: '2026-03-01', created_at: '2026-03-01T00:00:00Z', ref_type: 'count', ref_id: 's1' });
    const junk = mv({ kind: 'mystery', qty: 999, moved_on: '2026-03-05', created_at: '2026-03-05T00:00:00Z' });
    expect(balanceFromMoves([a, junk], [])[0].balance).toBe(10);
  });

  it('adjust และ return ยังนับปกติ', () => {
    const a = mv({ kind: 'count', qty: 10, moved_on: '2026-03-01', created_at: '2026-03-01T00:00:00Z', ref_type: 'count', ref_id: 's1' });
    const adj = mv({ kind: 'adjust', qty: -3, moved_on: '2026-03-02', created_at: '2026-03-02T00:00:00Z' });
    const ret = mv({ kind: 'return', qty: 5, moved_on: '2026-03-03', created_at: '2026-03-03T00:00:00Z' });
    expect(balanceFromMoves([a, adj, ret], [])[0].balance).toBe(12);
  });
});

/* ============================================================
   แถว void รูปแบบเก่า (ก่อน 8 ก.ย. 69) ต้องยังทำงาน — ห้ามให้รอบที่ยกเลิกไปแล้ว "ฟื้น"
   ============================================================
   void แบบเก่าเก็บ ref_id = session_id ดิบ ('s2') ส่วน roundOf() ตอนนี้คืน 'count::s2::0'
   ถ้าไม่รองรับรูปแบบเก่า → รอบนับที่แอดมินยกเลิกไปแล้วกลับมาเป็นหมุดล่าสุดอีกครั้ง
   และของที่รับเข้าซึ่งยกเลิกไปแล้วกลับมาบวก — ทั้งคู่เปลี่ยนคงเหลือเงียบ ๆ
   ============================================================ */
describe('รองรับ void รูปแบบเก่า', () => {
  const oldVoid = (refId) => mv({ kind: 'void', qty: 0, sku_key: '*', moved_on: '2026-09-07',
    created_at: '2026-09-07T00:00:00Z', ref_type: 'void', ref_id: refId });
  const anchorRow = (sid, qty, on, at) => mv({ kind: 'count', qty, moved_on: on, created_at: at, ref_type: 'count', ref_id: sid, round_id: roundId('count', sid, 0) });

  it('void เก่าที่ชี้ session_id ดิบ ต้องยังยกเลิกรอบนับนั้นได้', () => {
    const moves = [
      anchorRow('s1', 100, '2026-03-01', '2026-03-01T00:00:00Z'),
      anchorRow('s2', 6, '2026-03-05', '2026-03-05T00:00:00Z'),
      oldVoid('s2'),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(100);   // ไม่ใช่ 6
  });

  it('void เก่าที่ชี้ po.id ดิบ ต้องยังยกเลิกการรับเข้านั้นได้', () => {
    const moves = [
      anchorRow('s1', 100, '2026-03-01', '2026-03-01T00:00:00Z'),
      mv({ kind: 'in', qty: 50, moved_on: '2026-03-03', created_at: '2026-03-03T00:00:00Z', ref_type: 'po', ref_id: 'PO-1', round_id: roundId('po', 'PO-1', 0) }),
      oldVoid('PO-1'),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(100);
  });

  it('void เก่าไม่ล้ามไปฆ่า ref_id ของ kind อื่นที่บังเอิญชื่อซ้ำ', () => {
    // รอบนับ 'X' กับ PO 'X' — void เก่าชี้ 'X' ควรฆ่าเฉพาะเท่าที่ระบุได้ ไม่ใช่ทั้งคู่แบบสุ่ม
    const moves = [
      anchorRow('X', 10, '2026-03-01', '2026-03-01T00:00:00Z'),
      mv({ kind: 'in', qty: 5, moved_on: '2026-03-02', created_at: '2026-03-02T00:00:00Z', ref_type: 'po', ref_id: 'X', round_id: roundId('po', 'X', 0) }),
      oldVoid('X'),
    ];
    // ทั้งคู่ถูกยกเลิก (พฤติกรรมเดิมของ void รูปแบบเก่า) → ไม่เหลือ SKU
    expect(balanceFromMoves(moves, [])).toEqual([]);
  });

  it('void รูปแบบใหม่ยังแม่นระดับงวดเหมือนเดิม', () => {
    const moves = [
      anchorRow('s1', 10, '2026-03-01', '2026-03-01T00:00:00Z'),
      mv({ kind: 'in', qty: 5, moved_on: '2026-03-02', created_at: '2026-03-02T00:00:00Z', ref_type: 'po', ref_id: 'PO-9', round_id: roundId('po', 'PO-9', 0) }),
      mv({ kind: 'in', qty: 7, moved_on: '2026-03-05', created_at: '2026-03-05T00:00:00Z', ref_type: 'po', ref_id: 'PO-9', round_id: roundId('po', 'PO-9', 5) }),
      voidMove({ roundId: roundId('po', 'PO-9', 0), movedOn: '2026-03-06' }),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(17);   // ยกเลิกเฉพาะงวดแรก
  });
});

/* ============================================================
   void รูปแบบเก่า ต้องยกเลิก "เฉพาะของที่มีอยู่ตอนนั้น" (8 ก.ย. 69 · รอบสอง)
   ============================================================
   รอบแรกผมแก้ให้ activeMoves เทียบ ref_id ดิบด้วย เพื่อไม่ให้รอบที่ยกเลิกไปแล้วฟื้น
   แต่นั่นทำให้ ref_id ดิบ ('PO-1') กลืน **ทุกแถวของ PO นั้นตลอดกาล** รวมงวดที่รับเข้าทีหลัง
   = บั๊กเดิมที่ roundId ตั้งใจแก้ กลับมาในรูปใหม่ (พิสูจน์: 100 แทนที่จะเป็น 180)

   ทางที่ถูก: void เก่าหมายถึง "ยกเลิกสิ่งที่มีอยู่ ณ ตอนที่กดยกเลิก"
   → กรองเฉพาะแถวที่ created_at เก่ากว่าแถว void นั้น · ของที่มาทีหลังไม่เกี่ยว
   ============================================================ */
describe('void รูปแบบเก่า ต้องไม่กลืนของที่รับเข้าทีหลัง', () => {
  const anchorRow = (sid, qty, on, at) => mv({ kind: 'count', qty, moved_on: on, created_at: at, ref_type: 'count', ref_id: sid, round_id: roundId('count', sid, 0) });
  const recv = (pid, qty, on, at, seq) => mv({ kind: 'in', qty, moved_on: on, created_at: at, ref_type: 'po', ref_id: pid, round_id: roundId('po', pid, seq) });
  const oldVoid = (refId, at) => mv({ kind: 'void', qty: 0, sku_key: '*', moved_on: at.slice(0, 10), created_at: at, ref_type: 'void', ref_id: refId });

  it('⛔ รับเข้าใหม่หลัง void เก่า ต้องบวกเข้าคงเหลือ (เดิมหายถาวร)', () => {
    const moves = [
      anchorRow('s1', 100, '2026-09-01', '2026-09-01T00:00:00Z'),
      recv('PO-1', 50, '2026-09-05', '2026-09-05T00:00:00Z', 0),
      oldVoid('PO-1', '2026-09-07T00:00:00Z'),
      recv('PO-1', 80, '2026-09-09', '2026-09-09T00:00:00Z', 50),   // งวดใหม่ หลัง void
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(180);   // เดิมได้ 100
  });

  it('ของที่มีอยู่ก่อน void เก่า ยังถูกยกเลิกถูกต้อง', () => {
    const moves = [
      anchorRow('s1', 100, '2026-09-01', '2026-09-01T00:00:00Z'),
      recv('PO-1', 50, '2026-09-05', '2026-09-05T00:00:00Z', 0),
      oldVoid('PO-1', '2026-09-07T00:00:00Z'),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(100);
  });

  it('void เก่าของรอบนับ ยังทำให้ย้อนไปหมุดก่อนหน้า', () => {
    const moves = [
      anchorRow('s1', 100, '2026-09-01', '2026-09-01T00:00:00Z'),
      anchorRow('s2', 6, '2026-09-05', '2026-09-05T00:00:00Z'),
      oldVoid('s2', '2026-09-07T00:00:00Z'),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(100);
  });

  it('นับใหม่หลัง void เก่า ต้องใช้หมุดใหม่', () => {
    const moves = [
      anchorRow('s1', 100, '2026-09-01', '2026-09-01T00:00:00Z'),
      anchorRow('s2', 6, '2026-09-05', '2026-09-05T00:00:00Z'),
      oldVoid('s2', '2026-09-07T00:00:00Z'),
      anchorRow('s3', 42, '2026-09-09', '2026-09-09T00:00:00Z'),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(42);
  });

  it('void รูปแบบใหม่ (คีย์งวด) ไม่ต้องดู created_at — ยกเลิกงวดนั้นเสมอ', () => {
    const moves = [
      anchorRow('s1', 10, '2026-09-01', '2026-09-01T00:00:00Z'),
      recv('PO-9', 5, '2026-09-02', '2026-09-02T00:00:00Z', 0),
      voidMove({ roundId: roundId('po', 'PO-9', 0), movedOn: '2026-09-03' }),
      recv('PO-9', 7, '2026-09-04', '2026-09-04T00:00:00Z', 5),
    ];
    expect(balanceFromMoves(moves, [])[0].balance).toBe(17);
  });
});

/* skuLedger ต้องตอบได้เสมอถ้าตารางคงเหลือมีเลข (8 ก.ย. 69)
   balanceFromMoves ยอมโชว์ SKU ที่ไม่มีหมุด (มีแต่ 'in') แล้ว แต่ skuLedger ยัง `if (!anchor) return []`
   → ตารางขึ้น "คงเหลือ 92" แต่กดดูประวัติได้ 0 รายการ = ตอบไม่ได้ว่าทำไมเหลือ 92 */
describe('skuLedger กับ SKU ที่ยังไม่เคยนับ', () => {
  const recv = (qty, on) => mv({ kind: 'in', qty, moved_on: on, created_at: on + 'T00:00:00Z', ref_type: 'po', ref_id: 'PO-5', round_id: roundId('po', 'PO-5', 0) });

  it('มีแต่รับเข้า → ไทม์ไลน์ต้องมีรายการ ไม่ใช่ว่าง', () => {
    const led = skuLedger(K, [recv(100, '2026-09-04')], [sku('2026-09-06', 8)]);
    expect(led.length).toBeGreaterThan(0);
    expect(led[led.length - 1].running).toBe(92);
  });

  it('ขายก่อนของเข้า ไม่อยู่ในไทม์ไลน์ (ของยังไม่มา)', () => {
    const led = skuLedger(K, [recv(100, '2026-09-04')], [sku('2026-09-02', 5), sku('2026-09-06', 8)]);
    expect(led.some(x => x.on === '2026-09-02')).toBe(false);
    expect(led[led.length - 1].running).toBe(92);
  });

  it('ไทม์ไลน์ปิดตรงกับ balanceFromMoves เสมอ', () => {
    const moves = [recv(100, '2026-09-04')];
    const skus = [sku('2026-09-06', 8)];
    expect(skuLedger(K, moves, skus).slice(-1)[0].running).toBe(balanceFromMoves(moves, skus)[0].balance);
  });

  it('ไม่มีอะไรเลย → ว่างตามเดิม', () => {
    expect(skuLedger(K, [], [])).toEqual([]);
  });
});
