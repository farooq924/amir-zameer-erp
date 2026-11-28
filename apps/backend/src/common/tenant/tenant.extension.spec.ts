import { injectCompany } from './tenant.extension';

describe('injectCompany', () => {
  const C = '11111111-1111-4111-8111-111111111111';
  it('adds the company to the record and to nested creates', () => {
    const out = injectCompany('Order', {
      orderNumber: 'X-1',
      items: { create: [{ garmentName: 'Kameez', measurement: { create: { templateName: 't' } } }] },
      statusHistory: { createMany: { data: [{ notes: 'a' }] } },
    }, C, true) as Record<string, any>;
    expect(out.companyId).toBe(C);
    expect(out.items.create[0].companyId).toBe(C);
    expect(out.items.create[0].measurement.create.companyId).toBe(C);
    expect(out.statusHistory.createMany.data[0].companyId).toBe(C);
  });
  it('never touches plain values, dates or platform tables', () => {
    const d = new Date();
    const out = injectCompany('Order', { orderDate: d, notes: null }, C, false) as Record<string, unknown>;
    expect(out.companyId).toBeUndefined();
    expect(out.orderDate).toBe(d);
    expect((injectCompany('Plan', { code: 'X' }, C, true) as Record<string, unknown>).companyId).toBeUndefined();
  });
});
