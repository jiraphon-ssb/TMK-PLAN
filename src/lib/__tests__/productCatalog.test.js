import { describe, it, expect } from 'vitest';
import { splitList, mergeCatalogDesigns, findProduct, productMatrix, productNames, stockDesignNames, catalogResolver } from '../productCatalog.js';

const GOLD = [
  { code: 'JSK01', name: 'สิริกานต์', type: 'เสื้อโปโล', colors: ['ขาว', 'ดำ'], sizes: ['M', 'L', 'XXL'] },
  { code: 'JDB111', name: 'ดอกบัว', type: 'เสื้อโปโล', colors: ['ฟ้า'], sizes: ['S', 'M'] },
];

describe('productCatalog — สินค้าเป็นแหล่งเดียวของ ลาย/สี/ไซซ์', () => {
  it('splitList รับได้ทั้ง , | / และขึ้นบรรทัดใหม่', () => {
    expect(splitList('ขาว, ดำ / กรมท่า|ฟ้า\nแดง')).toEqual(['ขาว', 'ดำ', 'กรมท่า', 'ฟ้า', 'แดง']);
    expect(splitList('')).toEqual([]);
  });

  it('แคตตาล็อก (DB) ชนะ GOLDEN', () => {
    const list = mergeCatalogDesigns([{ code: 'JSK01', name: 'สิริกานต์', colors: 'ขาว,แดง', sizes: 'M,L', status: 'พร้อมขาย' }], GOLD);
    const d = findProduct(list, 'สิริกานต์');
    expect(d.colors).toEqual(['ขาว', 'แดง']);
    expect(d.sizes).toEqual(['M', 'L']);
    expect(d.source).toBe('catalog');
  });

  it('แคตตาล็อกเว้นสี/ไซซ์ว่าง → ใช้ของ GOLDEN แทน (ไม่เหลือลิสต์เปล่า)', () => {
    const list = mergeCatalogDesigns([{ code: 'JDB111', name: 'ดอกบัว', colors: '', sizes: '' }], GOLD);
    expect(findProduct(list, 'ดอกบัว').colors).toEqual(['ฟ้า']);
    expect(findProduct(list, 'ดอกบัว').sizes).toEqual(['S', 'M']);
  });

  it('ลายใหม่ที่มีเฉพาะใน DB ต้องอยู่ในลิสต์ด้วย', () => {
    const list = mergeCatalogDesigns([{ code: 'X9', name: 'ลายใหม่', colors: 'ดำ', sizes: 'XL' }], GOLD);
    expect(productNames(list)).toContain('ลายใหม่');
    expect(list.length).toBe(3);
  });

  it('normalize ไซซ์/สี ตามระบบสต็อก (XXL → 2XL)', () => {
    const list = mergeCatalogDesigns([], GOLD);
    expect(findProduct(list, 'สิริกานต์').sizes).toContain('2XL');
  });

  it('productMatrix เรียงไซซ์ตามมาตรฐาน ไม่ใช่ตามที่พิมพ์', () => {
    const list = mergeCatalogDesigns([{ code: 'A', name: 'ก', colors: 'ดำ', sizes: '3XL,S,XL,M' }], []);
    expect(productMatrix(list, 'ก').sizes).toEqual(['S', 'M', 'XL', '3XL']);
    expect(productMatrix(list, 'ไม่มีลายนี้')).toEqual({ colors: [], sizes: [], code: '' });
  });

  it('ปิดขายแล้วยังเลือกได้ถ้าขอ (ของค้างสต็อกต้องนับได้)', () => {
    const list = mergeCatalogDesigns([{ code: 'A', name: 'เลิกขาย', colors: 'ดำ', sizes: 'M', status: 'เลิกขาย' }], []);
    expect(productNames(list)).toEqual(['เลิกขาย']);
    expect(productNames(list, { includeInactive: false })).toEqual([]);
  });

  it('stockDesignNames = แคตตาล็อก + ลายที่มีของอยู่จริง (ไม่ซ้ำ)', () => {
    const list = mergeCatalogDesigns([], GOLD);
    const names = stockDesignNames(list, ['ดอกบัว', 'ลายเก่าที่เลิกทำ', '']);
    expect(names).toContain('ลายเก่าที่เลิกทำ');
    expect(names.filter(n => n === 'ดอกบัว').length).toBe(1);
  });

  it('catalogResolver จับคู่ทั้งชื่อและรหัส แล้วค่อย fallback', () => {
    const list = mergeCatalogDesigns([{ code: 'JSK01', name: 'สิริกานต์', colors: 'ขาว', sizes: 'M' }], []);
    const r = catalogResolver(list, () => ({ code: 'FB', name: 'จาก fallback' }));
    expect(r('สิริกานต์').code).toBe('JSK01');
    expect(r('jsk01').name).toBe('สิริกานต์');
    expect(r('อะไรก็ไม่รู้').name).toBe('จาก fallback');
    expect(r('')).toBe(null);
  });
});
