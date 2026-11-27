import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Agent, bootApp, login } from './helpers';

interface Template { id: string; code: string; name: string; fields: { id: string; key: string; label: string; isRequired: boolean; isActive: boolean }[] }

describe('Measurements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: Agent;
  let customerId: string;
  let sk: Template;
  const post = (path: string, body: unknown) => owner.agent.post(path).set('X-CSRF-Token', owner.csrf).send(body as object);

  const skValues = (chest: string) => [
    { fieldKey: 'length', value: '40' }, { fieldKey: 'shoulder', value: '18.5' }, { fieldKey: 'chest', value: chest },
    { fieldKey: 'sleeve_length', value: '24' }, { fieldKey: 'shalwar_length', value: '39' },
  ];

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    owner = await login(app, 'owner', 'OwnerPass123');
    customerId = (await post('/api/customers', { name: 'Measure Me', mobile: '0300-4440001' }).expect(201)).body.id;
    const templates: Template[] = (await owner.agent.get('/api/measurement-templates').expect(200)).body;
    sk = templates.find((t) => t.code === 'SHALWAR_KAMEEZ')!;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('seeds garment templates with the specified fields', async () => {
    const templates: Template[] = (await owner.agent.get('/api/measurement-templates').expect(200)).body;
    expect(templates.map((t) => t.code)).toEqual(expect.arrayContaining(['SHALWAR_KAMEEZ', 'WAISTCOAT', 'FORMAL_SUIT', 'SHIRT', 'TROUSER', 'PANT', 'KURTA', 'CUSTOM']));
    expect(sk.fields.map((f) => f.label)).toEqual([
      'Length', 'Shoulder', 'Chest', 'Waist', 'Hip', 'Sleeve Length', 'Armhole', 'Neck', 'Cuff', 'Shalwar Length', 'Shalwar Waist', 'Bottom Opening',
    ]);
    const trouser = templates.find((t) => t.code === 'TROUSER')!;
    expect(trouser.fields.map((f) => f.label)).toEqual(['Length', 'Waist', 'Hip', 'Thigh', 'Knee', 'Bottom', 'Rise']);
  });

  it('validates required fields, ranges and unknown fields', async () => {
    const missing = await post(`/api/customers/${customerId}/measurements`, { templateId: sk.id, unit: 'INCH', values: [{ fieldKey: 'chest', value: '40' }] }).expect(400);
    expect(missing.body.message).toMatch(/Validation failed|correct/);
    expect(JSON.stringify(missing.body.details)).toMatch(/Length is required/);
    const tooBig = await post(`/api/customers/${customerId}/measurements`, { templateId: sk.id, unit: 'INCH', values: skValues('400') }).expect(400);
    expect(JSON.stringify(tooBig.body.details)).toMatch(/Chest must be between/);
    await post(`/api/customers/${customerId}/measurements`, { templateId: sk.id, unit: 'INCH', values: [...skValues('40'), { fieldKey: 'nope', value: '1' }] }).expect(400);
    await post(`/api/customers/${customerId}/measurements`, { templateId: sk.id, unit: 'INCH', values: skValues('forty') }).expect(400);
  });

  let v1: string;
  let v2: string;

  it('saves versions and never overwrites history', async () => {
    const first = await post(`/api/customers/${customerId}/measurements`, {
      templateId: sk.id, unit: 'INCH', values: skValues('40'), takenByName: 'Master Aslam', notes: 'First visit',
      customValues: [{ label: 'Pocket Style', textValue: 'Two side pockets' }],
    }).expect(201);
    v1 = first.body.id;
    expect(first.body).toMatchObject({ versionNo: 1, isLatest: true, unit: 'INCH' });
    expect(first.body.values.find((v: { fieldKey: string }) => v.fieldKey === 'chest').value).toBe('40.00');
    expect(first.body.values.find((v: { fieldLabel: string }) => v.fieldLabel === 'Pocket Style')).toMatchObject({ isCustom: true, textValue: 'Two side pockets' });

    const second = await post(`/api/customers/${customerId}/measurements`, { templateId: sk.id, unit: 'CM', values: [
      { fieldKey: 'length', value: '101.6' }, { fieldKey: 'shoulder', value: '47' }, { fieldKey: 'chest', value: '106.68' },
      { fieldKey: 'sleeve_length', value: '61' }, { fieldKey: 'shalwar_length', value: '99' },
    ] }).expect(201);
    v2 = second.body.id;
    expect(second.body).toMatchObject({ versionNo: 2, isLatest: true, unit: 'CM' });

    const history = (await owner.agent.get(`/api/customers/${customerId}/measurements?templateId=${sk.id}`).expect(200)).body;
    expect(history.map((h: { versionNo: number; isLatest: boolean }) => [h.versionNo, h.isLatest])).toEqual([[2, true], [1, false]]);
    // version 1 values untouched
    const old = (await owner.agent.get(`/api/measurements/${v1}`).expect(200)).body;
    expect(old.values.find((v: { fieldKey: string }) => v.fieldKey === 'chest').value).toBe('40.00');
    expect(old.notes).toBe('First visit');
  });

  it('compares versions in a common unit', async () => {
    const cmp = (await owner.agent.get(`/api/measurements/compare?from=${v1}&to=${v2}`).expect(200)).body;
    expect(cmp.unit).toBe('CM');
    const chest = cmp.fields.find((f: { fieldKey: string }) => f.fieldKey === 'chest');
    expect(chest).toMatchObject({ from: '101.60', to: '106.68', difference: '5.08', changed: true });
    const length = cmp.fields.find((f: { fieldKey: string }) => f.fieldKey === 'length');
    expect(length).toMatchObject({ from: '101.60', to: '101.60', difference: '0.00', changed: false });
  });

  it('concurrent saves get distinct version numbers and exactly one latest', async () => {
    await Promise.all([1, 2, 3].map((i) => post(`/api/customers/${customerId}/measurements`, { templateId: sk.id, unit: 'INCH', values: skValues(String(40 + i)) }).expect(201)));
    const rows = await prisma.customerMeasurement.findMany({ where: { customerId, templateId: sk.id }, orderBy: { versionNo: 'asc' } });
    expect(rows.map((r) => r.versionNo)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.filter((r) => r.isLatest).map((r) => r.versionNo)).toEqual([5]);
  });

  it('profile shows measurement count and recent list shows latest only', async () => {
    const profile = (await owner.agent.get(`/api/customers/${customerId}`).expect(200)).body;
    expect(profile.stats.measurementVersions).toBe(5);
    const recent = (await owner.agent.get('/api/measurements?search=Measure Me').expect(200)).body;
    expect(recent.data).toHaveLength(1);
    expect(recent.data[0].versionNo).toBe(5);
  });

  it('owner can add custom fields to a template; old fields are deactivated, not deleted', async () => {
    const fields = sk.fields.filter((f) => f.key !== 'bottom_opening').map((f) => ({ id: f.id, label: f.label, isRequired: f.isRequired }));
    const updated = (await owner.agent.patch(`/api/measurement-templates/${sk.id}`).set('X-CSRF-Token', owner.csrf)
      .send({ fields: [...fields, { label: 'Daman Width', isRequired: false }] }).expect(200)).body;
    expect(updated.fields.find((f: { key: string }) => f.key === 'daman_width')).toMatchObject({ isActive: true });
    expect(updated.fields.find((f: { key: string }) => f.key === 'bottom_opening')).toMatchObject({ isActive: false });
    const active: Template[] = (await owner.agent.get('/api/measurement-templates').expect(200)).body;
    expect(active.find((t) => t.id === sk.id)!.fields.map((f) => f.key)).not.toContain('bottom_opening');
  });

  it('creates a custom template', async () => {
    const t = (await post('/api/measurement-templates', {
      name: 'Sherwani', garmentCategory: 'CUSTOM', fields: [{ label: 'Length', isRequired: true }, { label: 'Chest', isRequired: true }, { label: 'Length' }],
    }).expect(201)).body;
    expect(t.fields.map((f: { key: string }) => f.key)).toEqual(['length', 'chest', 'length_2']);
    await post('/api/measurement-templates', { name: 'sherwani', garmentCategory: 'CUSTOM', fields: [{ label: 'X' }] }).expect(409);
  });

  it('database refuses edits to saved versions', async () => {
    await expect(prisma.measurementValue.updateMany({ where: { measurementId: v1 }, data: { value: '1' } })).rejects.toThrow(/append-only/);
  });

  it('receptionist can record measurements but cannot change templates', async () => {
    const roles = (await owner.agent.get('/api/roles').expect(200)).body;
    const rec = roles.find((r: { code: string }) => r.code === 'RECEPTIONIST');
    await post('/api/users', { fullName: 'Front Desk', email: 'desk@test.local', username: 'desk', password: 'DeskPass1234', roleIds: [rec.id] }).expect(201);
    const d = await login(app, 'desk', 'DeskPass1234');
    await d.agent.post(`/api/customers/${customerId}/measurements`).set('X-CSRF-Token', d.csrf).send({ templateId: sk.id, unit: 'INCH', values: skValues('42') }).expect(201);
    await d.agent.patch(`/api/measurement-templates/${sk.id}`).set('X-CSRF-Token', d.csrf).send({ name: 'Hacked' }).expect(403);
  });
});
