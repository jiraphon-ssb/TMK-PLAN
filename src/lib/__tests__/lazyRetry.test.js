// @vitest-environment jsdom
/* reload อัตโนมัติต้องไม่ทำงานตอนออฟไลน์ (8 ก.ย. 69)
   reload = ล้าง state ทั้งหมด → ใบเสร็จที่ parse ไว้ / ฟอร์มที่พิมพ์ค้าง หายหมด
   เคสที่ reload ช่วยคือ deploy ใหม่แล้ว chunk เก่าหาย · เน็ตหลุดโยน error ข้อความเดียวกันเป๊ะ
   แต่ reload ตอนออฟไลน์ไม่ช่วยอะไร แถมขัดกับ OfflineBar ที่บอกว่า "ข้อมูลในฟอร์มยังอยู่" */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isChunkLoadError, attemptImport } from '../lazyRetry.js';

const chunkErr = () => new Error('Failed to fetch dynamically imported module: /assets/x.js');

describe('isChunkLoadError', () => {
  it('จับ error ของ chunk ที่โหลดไม่ได้', () => {
    expect(isChunkLoadError(chunkErr())).toBe(true);
    expect(isChunkLoadError(new Error('ChunkLoadError'))).toBe(true);
  });
  it('error จริงใน module ไม่ใช่ chunk error (ต้องส่งต่อ ErrorBoundary)', () => {
    expect(isChunkLoadError(new TypeError('x is not a function'))).toBe(false);
  });
});

describe('reload อัตโนมัติ', () => {
  let onLine = true;
  const reload = vi.fn();
  beforeEach(() => {
    reload.mockClear(); onLine = true;
    try { sessionStorage.clear(); } catch { /* ignore */ }
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => onLine);
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { reload } });
  });
  afterEach(() => vi.restoreAllMocks());

  it('⛔ ออฟไลน์ + chunk โหลดไม่ได้ → ห้าม reload (ฟอร์มที่พิมพ์ค้างต้องอยู่ต่อ)', async () => {
    onLine = false;
    await expect(attemptImport(() => Promise.reject(chunkErr()), 'a')).rejects.toThrow();
    expect(reload).not.toHaveBeenCalled();
  });

  it('ออนไลน์ + chunk หาย (deploy ใหม่) → reload ครั้งเดียว', async () => {
    await attemptImport(() => Promise.reject(chunkErr()), 'b');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reload ไปแล้วยังพัง → โยนต่อให้ ErrorBoundary ไม่ reload วน', async () => {
    sessionStorage.setItem('tmk-chunkreload:c', '1');
    await expect(attemptImport(() => Promise.reject(chunkErr()), 'c')).rejects.toThrow();
    expect(reload).not.toHaveBeenCalled();
  });

  it('error จริงใน module → ไม่ retry ไม่ reload ส่งต่อทันที', async () => {
    await expect(attemptImport(() => Promise.reject(new TypeError('boom')), 'd')).rejects.toThrow('boom');
    expect(reload).not.toHaveBeenCalled();
  });

  it('โหลดสำเร็จ → คืน module และล้าง guard', async () => {
    sessionStorage.setItem('tmk-chunkreload:e', '1');
    const mod = await attemptImport(() => Promise.resolve({ default: 'OK' }), 'e');
    expect(mod.default).toBe('OK');
    expect(sessionStorage.getItem('tmk-chunkreload:e')).toBeNull();
  });
});

/* sessionStorage ใช้ไม่ได้ (Safari private / บล็อก site data) ต้องไม่ reload วนไม่จบ */
describe('sessionStorage ใช้ไม่ได้', () => {
  const reload = vi.fn();
  beforeEach(() => {
    reload.mockClear();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { reload } });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  });
  afterEach(() => vi.restoreAllMocks());

  it('⛔ chunk พังซ้ำ ๆ ต้อง reload แค่ครั้งเดียว ไม่ใช่ทุกครั้ง', async () => {
    const boom = () => Promise.reject(new Error('Failed to fetch dynamically imported module: /x.js'));
    await attemptImport(boom, 'loopkey');
    await attemptImport(boom, 'loopkey').catch(() => {});
    await attemptImport(boom, 'loopkey').catch(() => {});
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
