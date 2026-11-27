import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHmac, randomUUID } from 'crypto';
import request from 'supertest';
import { Agent, bootApp, login } from './helpers';

const APP_SECRET = 'test-app-secret-123';

describe('Phase 8: WhatsApp (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: Agent;
  let cashier: Agent;
  let fetchSpy: jest.SpyInstance;
  const post = (path: string, body: unknown, a: Agent = owner) => a.agent.post(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const put = (path: string, body: unknown, a: Agent = owner) => a.agent.put(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const get = (path: string, a: Agent = owner) => a.agent.get(path);

  let customerId: string;
  let orderId: string;
  let sentCount = 0;
  /** What the fake Meta API answers next. */
  let nextReply: () => Response = () => new Response(JSON.stringify({ messages: [{ id: `wamid.TEST${++sentCount}` }] }), { status: 200 });

  const signed = (body: object) => {
    const raw = JSON.stringify(body);
    return request(app.getHttpServer()).post('/api/whatsapp/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', `sha256=${createHmac('sha256', APP_SECRET).update(raw).digest('hex')}`)
      .send(raw);
  };
  const statusEvent = (id: string, status: string, extra: object = {}) => ({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: '923216660081', ...extra }] } }] }],
  });

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    const realFetch = global.fetch;
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.startsWith('https://graph.facebook.com/')) return realFetch(input, init);
      if (url.includes('/messages')) return nextReply();
      if (url.includes('/message_templates')) {
        return new Response(JSON.stringify({ data: [{ name: 'order_ready', language: 'en', status: 'APPROVED', category: 'UTILITY' }, { name: 'order_confirmation', language: 'en', status: 'PENDING', category: 'UTILITY' }, { name: 'payment_received', language: 'en', status: 'APPROVED', category: 'UTILITY' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ display_phone_number: '+92 300 1112223', verified_name: 'AMIR ZAMEER', quality_rating: 'GREEN' }), { status: 200 });
    });
    owner = await login(app, 'owner', 'OwnerPass123');
    const roles = (await get('/api/roles').expect(200)).body as { id: string; code: string }[];
    await post('/api/users', { fullName: 'WA Cashier', email: 'wacash@test.local', username: 'wacashier', password: 'Cashier12345', roleIds: [roles.find((r) => r.code === 'CASHIER')!.id] }).expect(201);
    cashier = await login(app, 'wacashier', 'Cashier12345');
    customerId = (await post('/api/customers', { name: 'Wasim Akram', mobile: '0321-6660081', whatsappOptIn: false }).expect(201)).body.id;
    orderId = (await post('/api/orders', { customerId, items: [{ garmentName: 'Shalwar Kameez', quantity: 2, stitchingPrice: '2500' }], advance: { amount: '2000', method: 'CASH' } }).expect(201)).body.id;
  });
  afterAll(async () => {
    fetchSpy.mockRestore();
    await app.close();
    await prisma.$disconnect();
  });

  it('creates the default templates and keeps secrets out of the settings response', async () => {
    const t = (await get('/api/whatsapp/templates').expect(200)).body as { name: string; purpose: string; variables: string[] }[];
    for (const n of ['order_confirmation', 'order_ready', 'order_delivered', 'payment_received', 'payment_reminder', 'delivery_reminder']) expect(t.some((x) => x.name === n)).toBe(true);
    const c = (await get('/api/whatsapp/config').expect(200)).body;
    expect(c.enabled).toBe(false);
    expect(c.verifyToken.length).toBeGreaterThanOrEqual(8);
    expect(c).not.toHaveProperty('accessToken');
    // Cashier can send but cannot see or change the API settings.
    await get('/api/whatsapp/config', cashier).expect(403);
    await get('/api/whatsapp/templates', cashier).expect(200);
  });

  it('fills a template from an order and sends it manually through the WhatsApp app link', async () => {
    const tpl = ((await get('/api/whatsapp/templates').expect(200)).body as { id: string; name: string }[]).find((x) => x.name === 'order_confirmation')!;
    const prev = (await post('/api/whatsapp/preview', { templateId: tpl.id, relatedType: 'ORDER', relatedId: orderId }, cashier).expect(200)).body;
    expect(prev.text).toContain('Dear Wasim Akram');
    expect(prev.text).toContain('Total: Rs 5,000, paid: Rs 2,000, balance: Rs 3,000');
    expect(prev.toNumber).toBe('923216660081');
    expect(prev.cloudAvailable).toBe(false);
    expect(prev.warnings.join(' ')).toContain('has not agreed');
    const sent = (await post('/api/whatsapp/send', { templateId: tpl.id, relatedType: 'ORDER', relatedId: orderId, channel: 'MANUAL' }, cashier).expect(201)).body;
    expect(sent.link).toMatch(/^https:\/\/wa\.me\/923216660081\?text=Dear%20Wasim/);
    expect(sent.message.status).toBe('SENT');
    expect(sent.message.channel).toBe('MANUAL');
    const list = (await get(`/api/whatsapp/messages?relatedId=${orderId}`).expect(200)).body;
    expect(list.meta.total).toBe(1);
    // Free text to another number.
    const free = (await post('/api/whatsapp/send', { text: 'Your suit fabric has arrived.', customerId, toNumber: '0300 1234567', channel: 'MANUAL' }).expect(201)).body;
    expect(free.message.toNumber).toBe('923001234567');
    await post('/api/whatsapp/send', { channel: 'MANUAL', customerId }).expect(400);
  });

  it('validates templates: placeholders must match the chosen values', async () => {
    await post('/api/whatsapp/templates', { name: 'eid_offer', language: 'en', category: 'MARKETING', purpose: 'GENERAL', bodyPreview: 'Dear {{1}}, Eid Mubarak from {{2}}!', variables: ['customer_name'] }).expect(400);
    const t = await post('/api/whatsapp/templates', { name: 'eid_offer', language: 'en', category: 'MARKETING', purpose: 'GENERAL', bodyPreview: 'Dear {{1}}, Eid Mubarak from {{2}}!', variables: ['customer_name', 'business_name'] }).expect(201);
    await post('/api/whatsapp/templates', { name: 'eid_offer', language: 'en', category: 'MARKETING', purpose: 'GENERAL', bodyPreview: 'Hi {{1}}', variables: ['customer_name'] }).expect(400);
    await post('/api/whatsapp/templates', { name: 'Bad Name', language: 'en', category: 'UTILITY', purpose: 'GENERAL', bodyPreview: 'Hi there', variables: [] }).expect(400);
    await post('/api/whatsapp/templates', { name: 'x_test', language: 'en', category: 'UTILITY', purpose: 'GENERAL', bodyPreview: 'Hi there', variables: [] }, cashier).expect(403);
    const p = (await post('/api/whatsapp/preview', { templateId: t.body.id, customerId }).expect(200)).body;
    expect(p.text).toBe('Dear Wasim Akram, Eid Mubarak from AMIR ZAMEER!');
  });

  it('turns on the Cloud API: test connection, read template status from Meta', async () => {
    await put('/api/whatsapp/config', { enabled: true }).expect(400); // needs number id + token
    const c = (await put('/api/whatsapp/config', { enabled: true, phoneNumberId: '1234567890', businessAccountId: '9988776655', accessToken: 'EAAtesttoken9876', appSecret: APP_SECRET }).expect(200)).body;
    expect(c.cloudReady).toBe(true);
    expect(c.accessTokenHint).toBe('...9876');
    // Saving again without the token keeps it.
    expect((await put('/api/whatsapp/config', { maxAttempts: 3 }).expect(200)).body.hasAccessToken).toBe(true);
    const t = (await post('/api/whatsapp/config/test', {}).expect(200)).body;
    expect(t.displayPhoneNumber).toBe('+92 300 1112223');
    const s = (await post('/api/whatsapp/templates/sync', {}).expect(200)).body;
    expect(s.found).toBe(3);
    const tpls = s.templates as { name: string; metaStatus: string | null }[];
    expect(tpls.find((x) => x.name === 'order_ready')!.metaStatus).toBe('APPROVED');
    expect(tpls.find((x) => x.name === 'order_delivered')!.metaStatus).toBe('NOT_FOUND');
    const audit = await prisma.auditLog.findFirst({ where: { module: 'whatsapp', recordId: 'config' }, orderBy: { createdAt: 'desc' } });
    expect(JSON.stringify(audit?.newValues)).not.toContain('EAAtesttoken9876');
  });

  it('refuses Cloud API sending until the customer agrees, then sends and tracks status from webhooks', async () => {
    const tpl = ((await get('/api/whatsapp/templates').expect(200)).body as { id: string; name: string }[]).find((x) => x.name === 'order_ready')!;
    await post('/api/whatsapp/send', { templateId: tpl.id, relatedType: 'ORDER', relatedId: orderId, channel: 'CLOUD_API' }).expect(403);
    await put(`/api/whatsapp/customers/${customerId}/opt-in`, { optIn: true }).expect(200);
    const r = (await post('/api/whatsapp/send', { templateId: tpl.id, relatedType: 'ORDER', relatedId: orderId, channel: 'CLOUD_API' }).expect(201)).body;
    expect(r.message.status).toBe('SENT');
    const waId = r.message.waMessageId as string;
    const call = fetchSpy.mock.calls.find((c) => String(c[0]).endsWith('/1234567890/messages'))!;
    const body = JSON.parse(String((call[1] as RequestInit).body));
    expect(body.to).toBe('923216660081');
    expect(body.template.name).toBe('order_ready');
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(['Wasim Akram', expect.stringMatching(/^AZ-/), 'AMIR ZAMEER', '3,000']);
    expect((call[1] as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer EAAtesttoken9876');

    // Webhook: bad signature refused, then read before delivered (out of order) still ends as READ.
    await request(app.getHttpServer()).post('/api/whatsapp/webhook').set('X-Hub-Signature-256', 'sha256=bad').send(statusEvent(waId, 'read')).expect(403);
    await signed(statusEvent(waId, 'read')).expect(200);
    await signed(statusEvent(waId, 'delivered')).expect(200);
    const m = (await get(`/api/whatsapp/messages/${r.message.id}`).expect(200)).body;
    expect(m.status).toBe('READ');
    expect(m.deliveredAt).not.toBeNull();
    expect(m.readAt).not.toBeNull();
    expect(await prisma.whatsAppWebhookEvent.count({ where: { processed: true } })).toBeGreaterThanOrEqual(2);
  });

  it('verifies the webhook for Meta with the verify token', async () => {
    const c = (await get('/api/whatsapp/config').expect(200)).body;
    const ok = await request(app.getHttpServer()).get(`/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${c.verifyToken}&hub.challenge=12345`).expect(200);
    expect(ok.text).toBe('12345');
    await request(app.getHttpServer()).get('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1').expect(403);
  });

  it('retries temporary failures with back-off and stops at permanent errors', async () => {
    const tpl = ((await get('/api/whatsapp/templates').expect(200)).body as { id: string; name: string }[]).find((x) => x.name === 'payment_reminder')!;
    nextReply = () => new Response(JSON.stringify({ error: { code: 131000, message: 'Something went wrong' } }), { status: 500 });
    const r = (await post('/api/whatsapp/send', { templateId: tpl.id, relatedType: 'ORDER', relatedId: orderId, channel: 'CLOUD_API' }).expect(201)).body;
    expect(r.message.status).toBe('QUEUED');
    expect(r.message.attempts).toBe(1);
    expect(new Date(r.message.nextRetryAt).getTime()).toBeGreaterThan(Date.now() + 30_000);
    // Not due yet: the queue does not send it.
    expect((await post('/api/whatsapp/queue/run', {}).expect(200)).body.processed).toBe(0);
    // Permanent error (invalid number) on the next try = failed.
    await prisma.whatsAppMessage.update({ where: { id: r.message.id }, data: { nextRetryAt: new Date(Date.now() - 1000) } });
    nextReply = () => new Response(JSON.stringify({ error: { code: 131026, message: 'Message undeliverable' } }), { status: 400 });
    await post('/api/whatsapp/queue/run', {}).expect(200);
    const failed = (await get(`/api/whatsapp/messages/${r.message.id}`).expect(200)).body;
    expect(failed.status).toBe('FAILED');
    expect(failed.errorCode).toBe('131026');
    // Send again by hand after fixing the problem.
    nextReply = () => new Response(JSON.stringify({ messages: [{ id: `wamid.RETRY${randomUUID()}` }] }), { status: 200 });
    const again = (await post(`/api/whatsapp/messages/${r.message.id}/retry`, {}, cashier).expect(200)).body;
    expect(again.status).toBe('SENT');
    await post(`/api/whatsapp/messages/${r.message.id}/retry`, {}).expect(400);
  });

  it('sends automatic messages on payment and ready, once per event', async () => {
    const before = await prisma.whatsAppMessage.count({ where: { channel: 'CLOUD_API' } });
    await post(`/api/orders/${orderId}/payments`, { amount: '1000', method: 'CASH', idempotencyKey: randomUUID() }, cashier).expect(201);
    await new Promise((r) => setTimeout(r, 400));
    const paid = await prisma.whatsAppMessage.findFirst({ where: { template: { purpose: 'PAYMENT_RECEIVED' }, customerId }, orderBy: { createdAt: 'desc' } });
    expect(paid?.status).toBe('SENT');
    expect(paid?.body).toContain('we have received Rs 1,000');
    expect(paid?.body).toContain('Remaining balance: Rs 2,000');
    // Ready template was already sent by hand above: the automatic one is not sent twice.
    const stages = (await get('/api/orders/workflow-stages').expect(200)).body as { id: string; code: string }[];
    await post(`/api/orders/${orderId}/stage`, { stageId: stages.find((s) => s.code === 'READY')!.id }).expect(201);
    await new Promise((r) => setTimeout(r, 400));
    expect(await prisma.whatsAppMessage.count({ where: { relatedId: orderId, template: { purpose: 'ORDER_READY' } } })).toBe(1);
    expect(await prisma.whatsAppMessage.count({ where: { channel: 'CLOUD_API' } })).toBe(before + 1);
  });

  it('customer replies STOP to stop messages and START to agree again', async () => {
    const incoming = (text: string) => ({ entry: [{ changes: [{ value: { messages: [{ from: '923216660081', type: 'text', text: { body: text } }] } }] }] });
    await signed(incoming('stop')).expect(200);
    expect((await prisma.customer.findUnique({ where: { id: customerId } }))!.whatsappOptIn).toBe(false);
    await signed(incoming('START')).expect(200);
    expect((await prisma.customer.findUnique({ where: { id: customerId } }))!.whatsappOptIn).toBe(true);
  });

  it('lists messages with filters and a summary', async () => {
    const s = (await get('/api/whatsapp/summary').expect(200)).body;
    expect(s.today).toBeGreaterThanOrEqual(4);
    expect(s.cloudReady).toBe(true);
    expect((await get('/api/whatsapp/messages?channel=MANUAL').expect(200)).body.data.every((m: { channel: string }) => m.channel === 'MANUAL')).toBe(true);
    expect((await get('/api/whatsapp/messages?search=6660081').expect(200)).body.meta.total).toBeGreaterThanOrEqual(3);
    // Leave the Cloud API off for the other suites.
    await put('/api/whatsapp/config', { enabled: false }).expect(200);
  });
});
