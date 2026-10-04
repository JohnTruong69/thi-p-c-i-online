import { describe, expect, it } from 'vitest';
import { groupProducts, validateProductInput, validateVendorInput, type AffiliateProduct, type ProductInput, type VendorInput } from './affiliate';

const goodVendor: VendorInput = {
  name: 'Studio Ánh Sáng', category: 'Studio ảnh cưới', description: '',
  affiliate_url: 'https://example.com/aff?id=1', code: 'studio-anh-sang',
  coupon_code: '', commission_note: '', logo_url: '', is_active: true, sort_order: 0,
};
const goodProduct: ProductInput = {
  vendor_id: '', name: 'Váy cưới công chúa', target_url: 'https://example.com/sp?id=2',
  code: 'vay-cuoi-cong-chua', price_hint: '', budget_category: 'anh',
  task_template_id: 's8', is_active: true, sort_order: 0,
};

describe('validateVendorInput', () => {
  it('accepts a complete vendor', () => expect(validateVendorInput(goodVendor)).toEqual({}));
  it('requires name, category, https affiliate url and a slug code', () => {
    const errs = validateVendorInput({ ...goodVendor, name: ' ', category: '', affiliate_url: 'http://x', code: 'AB' });
    expect(errs['name']).toBeTruthy();
    expect(errs['category']).toBeTruthy();
    expect(errs['affiliate_url']).toBeTruthy();
    expect(errs['code']).toBeTruthy();
  });
  it('rejects a non-https logo url', () => {
    expect(validateVendorInput({ ...goodVendor, logo_url: 'ftp://x/y.png' })['logo_url']).toBeTruthy();
  });
});

describe('groupProducts', () => {
  const row = (id: string, task_template_id: string | null): AffiliateProduct => ({
    id, vendor_id: null, name: id, target_url: 'https://x', code: id, price_hint: null,
    budget_category: null, task_template_id, is_active: true, sort_order: 0,
    created_at: '', updated_at: '',
  });
  it('groups by key and skips null keys', () => {
    const g = groupProducts([row('a', 's1'), row('b', 's2'), row('c', 's1'), row('d', null)], 'task_template_id');
    expect(Object.keys(g).sort()).toEqual(['s1', 's2']);
    expect(g['s1']!.map(r => r.id)).toEqual(['a', 'c']);
  });
  it('returns empty for no rows', () => expect(groupProducts([], 'task_template_id')).toEqual({}));
});
describe('validateProductInput', () => {
  it('accepts a complete product', () => expect(validateProductInput(goodProduct)).toEqual({}));
  it('requires name, https target url and a slug code', () => {
    const errs = validateProductInput({ ...goodProduct, name: '', target_url: 'notaurl', code: 'x' });
    expect(errs['name']).toBeTruthy();
    expect(errs['target_url']).toBeTruthy();
    expect(errs['code']).toBeTruthy();
  });
  it('validates the suggested-task template id shape', () => {
    expect(validateProductInput({ ...goodProduct, task_template_id: 'abc' })['task_template_id']).toBeTruthy();
    expect(validateProductInput({ ...goodProduct, task_template_id: '' })).toEqual({});
  });
});
