import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy,
} from '@nestjs/common';
import { Prisma, WhatsAppTemplate } from '@prisma/client';
import { Tenant, byCompany, forEachCompany } from '../../common/tenant';
import {
  DEFAULT_WHATSAPP_TEMPLATES, PAYMENT_METHODS, WHATSAPP_PURPOSES, WHATSAPP_STATUS_RANK, WhatsAppAutoPurpose,
  formatPhone, isPakistaniMobile, normalizePhone, renderWhatsAppTemplate, templatePlaceholderCount, whatsappLink,
} from '@az/shared';
import { createHmac } from 'crypto';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { RequestContext } from '../../common/types/auth-user';
import { randomToken, safeEqual } from '../../common/utils/crypto';
import { karachiMidnightUtc } from '../../common/utils/date-range';
import { dec } from '../../common/utils/money';
import { SettingsService } from '../settings/settings.service';
import { CloudApiClient } from './cloud-api.client';
import { MessageQueryDto, OptInDto, PreviewDto, SendDto, TemplateDto } from './dto/whatsapp.dto';
import {
  DEFAULT_WHATSAPP_CONFIG, WHATSAPP_CONFIG_KEY, WhatsAppConfig, WhatsAppConfigSchema, isCloudReady, publicConfig, retryDelayMs,
} from './whatsapp.config';

type Values = Record<string, string>;
const SYSTEM_CTX: RequestContext = { userId: null, ipAddress: null, userAgent: 'system', sessionId: null };

const amount = (v: Prisma.Decimal.Value) => Number(dec(v).toFixed(2)).toLocaleString('en-PK', { maximumFractionDigits: 2 });
const pad = (n: number) => String(n).padStart(2, '0');
/** @db.Date columns hold the calendar date at UTC midnight. */
const calendarDate = (d: Date | null | undefined) => (d ? `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : '');
const karachiDate = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
const methodLabel = (m: string) => PAYMENT_METHODS.find((x) => x.key === m)?.label ?? m;

const messageInclude = {
  customer: { select: { id: true, code: true, name: true } },
  template: { select: { id: true, name: true, purpose: true } },
} satisfies Prisma.WhatsAppMessageInclude;
type MessageRow = Prisma.WhatsAppMessageGetPayload<{ include: typeof messageInclude }>;

interface Built {
  text: string;
  toNumber: string | null;
  customer: { id: string; name: string; code: string; whatsappOptIn: boolean } | null;
  template: WhatsAppTemplate | null;
  params: string[];
  relatedType: string | null;
  relatedId: string | null;
}

/**
 * WhatsApp messages to customers:
 *  - Cloud API (official Meta API): template messages queued, sent, retried with back-off, status from webhooks.
 *  - Manual: the ERP fills the text and opens WhatsApp on the phone/PC; the message is logged as sent.
 */
@Injectable()
export class WhatsAppService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private autoPaused = false;

  /** The demo loader turns automatic messages off while it books demo orders. */
  pauseAutomatic(paused = true) {
    this.autoPaused = paused;
  }

  /** Demo customers have made-up numbers that may belong to real people: never message them through the Cloud API. */
  private async isDemoCustomer(customerId: string | undefined | null): Promise<boolean> {
    if (!customerId) return false;
    const row = await this.prisma.systemSetting.findUnique({ where: { companyId_key: byCompany({ key: 'demo.data' }) } });
    const ids = (row?.value as { customers?: string[] } | null)?.customers ?? [];
    return ids.includes(customerId);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly cloud: CloudApiClient,
  ) {}

  async onApplicationBootstrap() {
    await forEachCompany(this.prisma, () => this.ensureDefaults(), {
      includeSuspended: true,
      onError: (id, e) => this.logger.error(`Could not create default WhatsApp templates for company ${id}: ${e.message}`),
    });
    if (process.env.NODE_ENV === 'test') return;
    // Each company has its own WhatsApp number and queue.
    this.timer = setInterval(() => void forEachCompany(this.prisma, () => this.processQueue()).catch(() => undefined), 30_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Default templates (never overwrites the owner's edits). */
  async ensureDefaults() {
    for (const t of DEFAULT_WHATSAPP_TEMPLATES) {
      const exists = await this.prisma.whatsAppTemplate.findUnique({ where: { companyId_name_language: byCompany({ name: t.name, language: t.language }) } });
      if (exists) continue;
      await this.prisma.whatsAppTemplate.create({
        data: { name: t.name, language: t.language, category: t.category, purpose: t.purpose, bodyPreview: t.bodyPreview, variables: t.variables },
      }).catch((e) => { if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e; });
    }
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  async getConfig(): Promise<WhatsAppConfig> {
    const row = await this.prisma.systemSetting.findUnique({ where: { companyId_key: byCompany({ key: WHATSAPP_CONFIG_KEY }) } });
    const stored = (row?.value ?? {}) as Partial<WhatsAppConfig>;
    return { ...DEFAULT_WHATSAPP_CONFIG, ...stored, autoSend: { ...DEFAULT_WHATSAPP_CONFIG.autoSend, ...(stored.autoSend ?? {}) } };
  }

  async getPublicConfig() {
    let c = await this.getConfig();
    if (!c.verifyToken) c = await this.saveConfig({ ...c, verifyToken: randomToken(18) });
    return publicConfig(c);
  }

  /** Empty accessToken / appSecret in the request = keep the saved one. `clearAccessToken` removes it. */
  async updateConfig(body: Record<string, unknown>, ctx: RequestContext) {
    const before = await this.getConfig();
    const next: Record<string, unknown> = { ...before, ...body };
    for (const k of ['accessToken', 'appSecret'] as const) {
      if (typeof body[k] !== 'string' || !(body[k] as string).trim()) next[k] = before[k];
    }
    if (body.clearAccessToken === true) next.accessToken = '';
    if (body.clearAppSecret === true) next.appSecret = '';
    delete next.clearAccessToken; delete next.clearAppSecret;
    if (typeof body.autoSend === 'object' && body.autoSend) next.autoSend = { ...before.autoSend, ...(body.autoSend as object) };
    if (!next.verifyToken) next.verifyToken = before.verifyToken || randomToken(18);
    const parsed = WhatsAppConfigSchema.safeParse(next);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Validation failed', details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    }
    if (parsed.data.enabled && (!parsed.data.phoneNumberId || !parsed.data.accessToken)) {
      throw new BadRequestException('To turn on the Cloud API, enter the Phone number ID and the Access token');
    }
    const saved = await this.saveConfig(parsed.data);
    const mask = (c: WhatsAppConfig) => ({ ...publicConfig(c), verifyToken: '***' });
    await this.audit.log({ action: 'SETTINGS_CHANGED', module: 'whatsapp', recordId: 'config', oldValues: mask(before), newValues: mask(saved) }, ctx);
    return publicConfig(saved);
  }

  private async saveConfig(c: WhatsAppConfig): Promise<WhatsAppConfig> {
    const value = c as unknown as Prisma.InputJsonValue;
    await this.prisma.systemSetting.upsert({
      where: { companyId_key: byCompany({ key: WHATSAPP_CONFIG_KEY }) }, create: { key: WHATSAPP_CONFIG_KEY, group: 'whatsapp', value }, update: { value },
    });
    return c;
  }

  async testConnection() {
    const c = await this.getConfig();
    if (!c.phoneNumberId || !c.accessToken) throw new BadRequestException('Enter and save the Phone number ID and Access token first');
    return this.cloud.phoneNumberInfo(c);
  }

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------

  async templates() {
    const rows = await this.prisma.whatsAppTemplate.findMany({ orderBy: [{ isActive: 'desc' }, { purpose: 'asc' }, { name: 'asc' }], include: { _count: { select: { messages: true } } } });
    return rows.map((t) => ({ ...t, variables: t.variables as string[], messageCount: t._count.messages, _count: undefined }));
  }

  private checkTemplate(dto: TemplateDto) {
    const needed = templatePlaceholderCount(dto.bodyPreview);
    if (needed !== dto.variables.length) {
      throw new BadRequestException(`The text has ${needed} placeholder(s) like {{1}} but ${dto.variables.length} value(s) are chosen. They must match.`);
    }
  }

  async createTemplate(dto: TemplateDto, ctx: RequestContext) {
    this.checkTemplate(dto);
    try {
      const t = await this.prisma.whatsAppTemplate.create({
        data: { name: dto.name, language: dto.language, category: dto.category, purpose: dto.purpose, bodyPreview: dto.bodyPreview, variables: dto.variables, isActive: dto.isActive ?? true },
      });
      await this.audit.log({ action: 'CREATE', module: 'whatsapp', recordId: t.id, newValues: { template: t.name, purpose: t.purpose } }, ctx);
      return t;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new BadRequestException(`A template named ${dto.name} (${dto.language}) already exists`);
      throw e;
    }
  }

  async updateTemplate(id: string, dto: TemplateDto, ctx: RequestContext) {
    this.checkTemplate(dto);
    const before = await this.prisma.whatsAppTemplate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Template not found');
    try {
      const t = await this.prisma.whatsAppTemplate.update({
        where: { id },
        data: {
          name: dto.name, language: dto.language, category: dto.category, purpose: dto.purpose, bodyPreview: dto.bodyPreview, variables: dto.variables,
          isActive: dto.isActive ?? before.isActive,
          ...(before.name !== dto.name || before.language !== dto.language ? { metaStatus: null } : {}),
        },
      });
      await this.audit.log({ action: 'UPDATE', module: 'whatsapp', recordId: id, oldValues: { name: before.name, body: before.bodyPreview, active: before.isActive }, newValues: { name: t.name, body: t.bodyPreview, active: t.isActive } }, ctx);
      return t;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new BadRequestException(`A template named ${dto.name} (${dto.language}) already exists`);
      throw e;
    }
  }

  /** Reads the approval status of every template from Meta and stores it. */
  async syncTemplates(ctx: RequestContext) {
    const c = await this.getConfig();
    if (!c.businessAccountId || !c.accessToken) throw new BadRequestException('Enter and save the WhatsApp Business Account ID and Access token first');
    const res = await this.cloud.listTemplates(c);
    if (!res.ok) throw new BadRequestException(res.error ?? 'Could not read templates from WhatsApp');
    const ours = await this.prisma.whatsAppTemplate.findMany();
    let updated = 0;
    for (const t of ours) {
      const meta = res.templates!.find((m) => m.name === t.name && m.language === t.language);
      const status = meta ? meta.status : 'NOT_FOUND';
      if (status !== t.metaStatus) { await this.prisma.whatsAppTemplate.update({ where: { id: t.id }, data: { metaStatus: status } }); updated++; }
    }
    await this.audit.log({ action: 'UPDATE', module: 'whatsapp', recordId: 'templates', newValues: { note: `Template status read from Meta (${res.templates!.length} found, ${updated} changed)` } }, ctx);
    return { found: res.templates!.length, updated, templates: await this.templates() };
  }

  // ---------------------------------------------------------------------------
  // Building a message
  // ---------------------------------------------------------------------------

  private async businessValues(): Promise<Values> {
    const biz = await this.settings.getGroup('business');
    return { business_name: String(biz.businessName || 'My Tailoring Shop'), business_phone: String(biz.phone || biz.whatsapp || '') };
  }

  private async customerValues(customerId: string) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } });
    if (!c) throw new NotFoundException('Customer not found');
    const open = await this.prisma.order.aggregate({ where: { customerId, deletedAt: null, lifecycle: { not: 'CANCELLED' } }, _sum: { balanceAmount: true } });
    const balance = dec(open._sum.balanceAmount ?? 0).plus(c.openingBalance);
    return { customer: c, values: { customer_name: c.name, customer_code: c.code, customer_balance: amount(balance) } as Values };
  }

  private async orderValues(orderId: string) {
    const o = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { items: { select: { garmentName: true, quantity: true }, orderBy: { lineNo: 'asc' } }, stage: { select: { name: true } } },
    });
    if (!o) throw new NotFoundException('Order not found');
    const garments = o.items.map((i) => `${i.quantity} x ${i.garmentName}`).join(', ');
    return {
      order: o,
      values: {
        order_number: o.orderNumber, order_date: calendarDate(o.orderDate), delivery_date: calendarDate(o.expectedDeliveryDate) || 'to be confirmed',
        garments, order_total: amount(dec(o.totalAmount).plus(o.adjustmentsTotal)), paid_amount: amount(o.paidAmount),
        balance_amount: amount(dec(o.balanceAmount).lt(0) ? 0 : o.balanceAmount), order_status: o.lifecycle === 'DELIVERED' ? 'Delivered' : o.stage.name,
      } as Values,
    };
  }

  private async paymentValues(paymentId: string) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw new NotFoundException('Payment not found');
    return { payment: p, values: { receipt_number: p.receiptNo, payment_amount: amount(p.amount), payment_method: methodLabel(p.method), payment_date: karachiDate(p.paymentDate) } as Values };
  }

  /** Collects every value the chosen record can provide and fills the template. */
  private async build(dto: PreviewDto): Promise<Built> {
    const values: Values = await this.businessValues();
    let customerId = dto.customerId ?? null;
    if (dto.relatedType && dto.relatedType !== 'CUSTOMER' && !dto.relatedId) throw new BadRequestException('Choose the record for this message');
    if (dto.relatedType === 'PAYMENT') {
      const p = await this.paymentValues(dto.relatedId!);
      Object.assign(values, p.values);
      customerId = p.payment.customerId;
      if (p.payment.orderId) Object.assign(values, (await this.orderValues(p.payment.orderId)).values);
    } else if (dto.relatedType === 'ORDER') {
      const o = await this.orderValues(dto.relatedId!);
      Object.assign(values, o.values);
      customerId = o.order.customerId;
    } else if (dto.relatedType === 'CUSTOMER' && dto.relatedId) {
      customerId = dto.relatedId;
    }
    let customer: Built['customer'] = null;
    let number: string | null = null;
    if (customerId) {
      const c = await this.customerValues(customerId);
      Object.assign(values, c.values);
      customer = { id: c.customer.id, name: c.customer.name, code: c.customer.code, whatsappOptIn: c.customer.whatsappOptIn };
      number = c.customer.whatsapp ?? c.customer.mobile;
    }
    if (dto.toNumber) {
      number = normalizePhone(dto.toNumber);
      if (!number) throw new BadRequestException('Enter a valid mobile number like 0300-1234567');
    }

    let template: WhatsAppTemplate | null = null;
    let text: string;
    let params: string[] = [];
    if (dto.templateId) {
      template = await this.prisma.whatsAppTemplate.findUnique({ where: { id: dto.templateId } });
      if (!template) throw new NotFoundException('Template not found');
      const vars = template.variables as string[];
      const purpose = WHATSAPP_PURPOSES.find((p) => p.key === template!.purpose);
      const missing = vars.filter((v) => values[v] == null);
      if (missing.length) {
        throw new BadRequestException(`"${template.name}" needs ${purpose?.context === 'PAYMENT' ? 'a payment' : purpose?.context === 'ORDER' ? 'an order' : 'a customer'} to fill: ${missing.join(', ')}`);
      }
      params = vars.map((v) => values[v] || '-');
      text = renderWhatsAppTemplate(template.bodyPreview, vars, values);
    } else {
      text = (dto.text ?? '').trim();
      if (!text) throw new BadRequestException('Choose a template or type a message');
    }
    const relatedType = dto.relatedType ?? (customerId ? 'CUSTOMER' : null);
    const relatedId = relatedType === 'CUSTOMER' ? customerId : dto.relatedId ?? null;
    return { text, toNumber: number, customer, template, params, relatedType, relatedId };
  }

  async preview(dto: PreviewDto) {
    const b = await this.build(dto);
    const config = await this.getConfig();
    const warnings: string[] = [];
    if (!b.toNumber) warnings.push('This customer has no mobile number');
    else if (!isPakistaniMobile(b.toNumber)) warnings.push('This number does not look like a Pakistani mobile number; check it before sending');
    if (b.customer && !b.customer.whatsappOptIn) warnings.push(`${b.customer.name} has not agreed to receive WhatsApp messages`);
    const cloudReasons: string[] = [];
    if (!isCloudReady(config)) cloudReasons.push('Cloud API is not set up (WhatsApp > Settings)');
    if (!b.template) cloudReasons.push('Cloud API can only start a chat with an approved template');
    if (b.template && b.template.metaStatus && b.template.metaStatus !== 'APPROVED') cloudReasons.push(`Template status in Meta: ${b.template.metaStatus}`);
    if (config.requireOptIn && b.customer && !b.customer.whatsappOptIn) cloudReasons.push('Customer has not agreed (opt-in)');
    if (await this.isDemoCustomer(b.customer?.id)) cloudReasons.push('Demo customer (made-up number)');
    if (!b.toNumber) cloudReasons.push('No mobile number');
    return {
      text: b.text, toNumber: b.toNumber, toNumberDisplay: formatPhone(b.toNumber), link: whatsappLink(b.toNumber, b.text),
      customer: b.customer, template: b.template ? { id: b.template.id, name: b.template.name, metaStatus: b.template.metaStatus } : null,
      cloudAvailable: cloudReasons.length === 0, cloudReasons, warnings,
    };
  }

  // ---------------------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------------------

  async send(dto: SendDto, ctx: RequestContext) {
    const b = await this.build(dto);
    if (!b.toNumber) throw new BadRequestException('This customer has no mobile number');
    if (dto.channel === 'MANUAL') {
      const m = await this.prisma.whatsAppMessage.create({
        data: {
          customerId: b.customer?.id ?? null, toNumber: b.toNumber, templateId: b.template?.id ?? null, channel: 'MANUAL', messageType: b.template ? 'TEMPLATE' : 'TEXT',
          body: b.text, status: 'SENT', sentAt: new Date(), relatedType: b.relatedType, relatedId: b.relatedId, createdById: ctx.userId,
        },
        include: messageInclude,
      });
      await this.audit.log({ action: 'CREATE', module: 'whatsapp', recordId: m.id, newValues: { note: `WhatsApp opened for ${formatPhone(b.toNumber)}${b.template ? ` (${b.template.name})` : ''}` } }, ctx);
      return { message: this.present(m), link: whatsappLink(b.toNumber, b.text) };
    }

    const config = await this.getConfig();
    if (!isCloudReady(config)) throw new BadRequestException('WhatsApp Cloud API is not set up. Open WhatsApp > Settings, or send manually.');
    if (!b.template) throw new BadRequestException('Cloud API messages must use an approved template');
    if (await this.isDemoCustomer(b.customer?.id)) throw new BadRequestException('Demo customers have made-up numbers. Use "Open WhatsApp" (manual) for demo customers.');
    if (config.requireOptIn && b.customer && !b.customer.whatsappOptIn) {
      throw new ForbiddenException(`${b.customer.name} has not agreed to receive WhatsApp messages. Ask the customer and tick "agrees" on the customer, or send manually.`);
    }
    const m = await this.queue(b, ctx.userId);
    await this.audit.log({ action: 'CREATE', module: 'whatsapp', recordId: m.id, newValues: { note: `WhatsApp ${b.template.name} queued for ${formatPhone(b.toNumber)}` } }, ctx);
    const sent = await this.dispatch(m.id);
    return { message: sent ?? this.present(m), link: null };
  }

  private async queue(b: Built, userId: string | null) {
    const t = b.template!;
    const payload = {
      to: b.toNumber, type: 'template',
      template: { name: t.name, language: { code: t.language }, ...(b.params.length ? { components: [{ type: 'body', parameters: b.params.map((text) => ({ type: 'text', text })) }] } : {}) },
    };
    return this.prisma.whatsAppMessage.create({
      data: {
        customerId: b.customer?.id ?? null, toNumber: b.toNumber!, templateId: t.id, channel: 'CLOUD_API', messageType: 'TEMPLATE', body: b.text,
        payload: payload as Prisma.InputJsonValue, status: 'QUEUED', nextRetryAt: new Date(), relatedType: b.relatedType, relatedId: b.relatedId, createdById: userId,
      },
      include: messageInclude,
    });
  }

  /**
   * One attempt to send a queued message. The attempt is claimed first (attempts + 1 and a lease
   * on nextRetryAt) so the timer and a user click can never send the same message twice.
   */
  async dispatch(id: string) {
    const m = await this.prisma.whatsAppMessage.findUnique({ where: { id } });
    if (!m || m.status !== 'QUEUED' || m.channel !== 'CLOUD_API') return null;
    const config = await this.getConfig();
    if (!isCloudReady(config)) return null;
    if (await this.isDemoCustomer(m.customerId)) {
      const blocked = await this.prisma.whatsAppMessage.update({
        where: { id }, data: { status: 'FAILED', failedAt: new Date(), nextRetryAt: null, errorCode: 'DEMO', errorMessage: 'Demo customer: not sent (made-up number)' }, include: messageInclude,
      });
      return this.present(blocked);
    }
    const attempt = m.attempts + 1;
    const claimed = await this.prisma.whatsAppMessage.updateMany({
      where: { id, status: 'QUEUED', attempts: m.attempts }, data: { attempts: attempt, nextRetryAt: new Date(Date.now() + retryDelayMs(attempt)) },
    });
    if (claimed.count === 0) return null;
    const res = await this.cloud.sendMessage(config, m.payload as Record<string, unknown>);
    let data: Prisma.WhatsAppMessageUpdateInput;
    if (res.ok) {
      data = { status: 'SENT', waMessageId: res.waMessageId, sentAt: new Date(), nextRetryAt: null, errorCode: null, errorMessage: null };
    } else if (res.retryable && attempt < config.maxAttempts) {
      data = { errorCode: res.errorCode, errorMessage: `${res.errorMessage} (will try again)` };
    } else {
      data = { status: 'FAILED', failedAt: new Date(), nextRetryAt: null, errorCode: res.errorCode, errorMessage: res.errorMessage };
    }
    try {
      const updated = await this.prisma.whatsAppMessage.update({ where: { id }, data, include: messageInclude });
      return this.present(updated);
    } catch (e) {
      // waMessageId already stored by a webhook that arrived first: keep the webhook's status.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null;
      throw e;
    }
  }

  /** Sends every queued message that is due. Called every 30 seconds and from "Send queued now". */
  async processQueue() {
    if (this.running) return { processed: 0 };
    this.running = true;
    try {
      const config = await this.getConfig();
      if (!isCloudReady(config)) return { processed: 0 };
      const due = await this.prisma.whatsAppMessage.findMany({
        where: { status: 'QUEUED', channel: 'CLOUD_API', OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }] },
        orderBy: { createdAt: 'asc' }, take: 25, select: { id: true },
      });
      for (const d of due) await this.dispatch(d.id);
      return { processed: due.length };
    } finally {
      this.running = false;
    }
  }

  async retry(id: string, ctx: RequestContext) {
    const m = await this.prisma.whatsAppMessage.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Message not found');
    if (m.channel !== 'CLOUD_API') throw new BadRequestException('Manual messages are sent from the WhatsApp app. Use "Send WhatsApp" again.');
    if (m.status !== 'FAILED' && m.status !== 'QUEUED') throw new BadRequestException('Only failed or queued messages can be sent again');
    if (!isCloudReady(await this.getConfig())) throw new BadRequestException('WhatsApp Cloud API is not set up');
    await this.prisma.whatsAppMessage.update({ where: { id }, data: { status: 'QUEUED', attempts: 0, nextRetryAt: new Date(), failedAt: null, errorCode: null, errorMessage: null } });
    await this.audit.log({ action: 'UPDATE', module: 'whatsapp', recordId: id, newValues: { note: `WhatsApp to ${formatPhone(m.toNumber)} sent again` } }, ctx);
    return (await this.dispatch(id)) ?? this.get(id);
  }

  async cancel(id: string, ctx: RequestContext) {
    const m = await this.prisma.whatsAppMessage.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Message not found');
    if (m.status !== 'QUEUED') throw new BadRequestException('Only queued messages can be cancelled');
    const updated = await this.prisma.whatsAppMessage.update({
      where: { id }, data: { status: 'FAILED', failedAt: new Date(), nextRetryAt: null, errorCode: 'CANCELLED', errorMessage: 'Cancelled by user' }, include: messageInclude,
    });
    await this.audit.log({ action: 'CANCEL', module: 'whatsapp', recordId: id, newValues: { note: `Queued WhatsApp to ${formatPhone(m.toNumber)} cancelled` } }, ctx);
    return this.present(updated);
  }

  /**
   * Automatic message after an order or payment event. Never throws: a WhatsApp problem must never
   * block booking an order or taking money. Skipped unless the Cloud API is on, the event is switched
   * on, the customer agreed and an active template exists. One message per event and record.
   */
  async notify(purpose: WhatsAppAutoPurpose, related: { orderId?: string; paymentId?: string }): Promise<void> {
    try {
      if (this.autoPaused) return;
      const config = await this.getConfig();
      if (!isCloudReady(config) || !config.autoSend[purpose]) return;
      const template = await this.prisma.whatsAppTemplate.findFirst({
        where: { purpose, isActive: true, OR: [{ metaStatus: null }, { metaStatus: 'APPROVED' }] }, orderBy: { createdAt: 'asc' },
      });
      if (!template) return;
      const relatedType = related.paymentId ? 'PAYMENT' : 'ORDER';
      const relatedId = (related.paymentId ?? related.orderId)!;
      const dup = await this.prisma.whatsAppMessage.findFirst({ where: { relatedId, template: { purpose }, status: { not: 'FAILED' } } });
      if (dup) return;
      const b = await this.build({ templateId: template.id, relatedType, relatedId });
      if (!b.toNumber || await this.isDemoCustomer(b.customer?.id)) return;
      if (config.requireOptIn && (!b.customer || !b.customer.whatsappOptIn)) return;
      const m = await this.queue(b, null);
      await this.dispatch(m.id);
    } catch (e) {
      this.logger.warn(`Automatic WhatsApp (${purpose}) skipped: ${(e as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  private present(m: MessageRow) {
    return {
      id: m.id, toNumber: m.toNumber, channel: m.channel, messageType: m.messageType, body: m.body, status: m.status,
      attempts: m.attempts, nextRetryAt: m.nextRetryAt, errorCode: m.errorCode, errorMessage: m.errorMessage,
      relatedType: m.relatedType, relatedId: m.relatedId, sentAt: m.sentAt, deliveredAt: m.deliveredAt, readAt: m.readAt, failedAt: m.failedAt,
      createdAt: m.createdAt, customer: m.customer, template: m.template, waMessageId: m.waMessageId,
    };
  }

  async get(id: string) {
    const m = await this.prisma.whatsAppMessage.findUnique({ where: { id }, include: messageInclude });
    if (!m) throw new NotFoundException('Message not found');
    return this.present(m);
  }

  async list(q: MessageQueryDto) {
    const where: Prisma.WhatsAppMessageWhereInput = {};
    if (q.status && q.status !== 'ALL') where.status = q.status as Prisma.EnumMessageStatusFilter['equals'];
    if (q.channel && q.channel !== 'ALL') where.channel = q.channel as 'CLOUD_API' | 'MANUAL';
    if (q.customerId) where.customerId = q.customerId;
    if (q.relatedId) where.relatedId = q.relatedId;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: karachiMidnightUtc(q.from) } : {}),
        ...(q.to ? { lt: new Date(karachiMidnightUtc(q.to).getTime() + 86_400_000) } : {}),
      };
    }
    if (q.search) {
      const s = q.search.trim();
      const digits = s.replace(/\D/g, '');
      where.OR = [
        { body: { contains: s, mode: 'insensitive' } },
        { customer: { name: { contains: s, mode: 'insensitive' } } }, { customer: { code: { contains: s, mode: 'insensitive' } } },
        ...(digits.length >= 4 ? [{ toNumber: { contains: digits.startsWith('0') ? digits.slice(1) : digits } }] : []),
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.whatsAppMessage.findMany({ where, include: messageInclude, orderBy: { createdAt: q.sortOrder }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.whatsAppMessage.count({ where }),
    ]);
    return paginate(rows.map((m) => this.present(m)), total, q);
  }

  /** Header cards: today and this month by status, plus queue size. */
  async summary() {
    const now = new Date();
    const today = karachiMidnightUtc(karachiDateIso(now));
    const month = karachiMidnightUtc(`${karachiDateIso(now).slice(0, 8)}01`);
    const [byStatus, todayCount, queued, failed, config] = await Promise.all([
      this.prisma.whatsAppMessage.groupBy({ by: ['status'], where: { createdAt: { gte: month } }, _count: { _all: true } }),
      this.prisma.whatsAppMessage.count({ where: { createdAt: { gte: today } } }),
      this.prisma.whatsAppMessage.count({ where: { status: 'QUEUED' } }),
      this.prisma.whatsAppMessage.count({ where: { status: 'FAILED', createdAt: { gte: month } } }),
      this.getConfig(),
    ]);
    const month_ = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
    const monthTotal = byStatus.reduce((a, s) => a + s._count._all, 0);
    const optedIn = await this.prisma.customer.count({ where: { deletedAt: null, whatsappOptIn: true } });
    return {
      today: todayCount, monthTotal, month: month_, queued, failed, optedIn,
      deliveredOrRead: (month_.DELIVERED ?? 0) + (month_.READ ?? 0), cloudReady: isCloudReady(config), enabled: config.enabled,
    };
  }

  async setOptIn(customerId: string, dto: OptInDto, ctx: RequestContext) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } });
    if (!c) throw new NotFoundException('Customer not found');
    if (c.whatsappOptIn === dto.optIn) return { id: c.id, whatsappOptIn: c.whatsappOptIn, whatsappOptInAt: c.whatsappOptInAt };
    const u = await this.prisma.customer.update({ where: { id: customerId }, data: { whatsappOptIn: dto.optIn, whatsappOptInAt: dto.optIn ? new Date() : null, version: { increment: 1 } } });
    await this.audit.log({ action: 'UPDATE', module: 'customers', recordId: c.id, oldValues: { whatsappOptIn: c.whatsappOptIn }, newValues: { whatsappOptIn: u.whatsappOptIn, note: dto.optIn ? 'Agreed to WhatsApp messages' : 'Stopped WhatsApp messages' } }, ctx);
    return { id: u.id, whatsappOptIn: u.whatsappOptIn, whatsappOptInAt: u.whatsappOptInAt };
  }

  // ---------------------------------------------------------------------------
  // Webhook (Meta calls these; no login)
  // ---------------------------------------------------------------------------

  /**
   * Webhooks are public, so the company comes from the URL (/api/whatsapp/webhook/<company code>).
   * The old URL without a code still works: the company whose verify token / App Secret matches is used.
   */
  async webhookVerify(companyCode: string | undefined, mode?: string, token?: string, challenge?: string): Promise<string> {
    const companyId = await this.webhookCompany(companyCode, (c) => !!token && !!c.verifyToken && safeEqual(token, c.verifyToken));
    return Tenant.run(companyId, () => this.verifyWebhook(mode, token, challenge));
  }

  async webhookReceive(companyCode: string | undefined, raw: Buffer | undefined, header: string | undefined, body: unknown) {
    const signatureOk = (c: WhatsAppConfig) =>
      !!c.appSecret && !!raw && !!header?.startsWith('sha256=') && safeEqual(`sha256=${createHmac('sha256', c.appSecret).update(raw).digest('hex')}`, header);
    const companyId = await this.webhookCompany(companyCode, signatureOk);
    await Tenant.run(companyId, async () => {
      await this.checkSignature(raw, header);
      await this.handleWebhook(body);
    });
  }

  private async webhookCompany(code: string | undefined, matches: (c: WhatsAppConfig) => boolean): Promise<string> {
    if (code) {
      const c = await this.prisma.company.findUnique({ where: { code: code.toLowerCase() }, select: { id: true } });
      if (!c) throw new ForbiddenException('Unknown company');
      return c.id;
    }
    const companies = await this.prisma.company.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    for (const c of companies) if (matches(await Tenant.run(c.id, () => this.getConfig()))) return c.id;
    throw new ForbiddenException('Verify token does not match');
  }

  async verifyWebhook(mode?: string, token?: string, challenge?: string): Promise<string> {
    const c = await this.getConfig();
    if (mode === 'subscribe' && token && c.verifyToken && safeEqual(token, c.verifyToken) && challenge) return challenge;
    throw new ForbiddenException('Verify token does not match');
  }

  /** Checks Meta's X-Hub-Signature-256 (HMAC-SHA256 of the raw body with the App Secret). */
  async checkSignature(raw: Buffer | undefined, header: string | undefined) {
    const c = await this.getConfig();
    if (!c.appSecret) throw new ForbiddenException('App Secret is not set in WhatsApp > Settings');
    if (!raw || !header?.startsWith('sha256=')) throw new ForbiddenException('Missing signature');
    const expected = `sha256=${createHmac('sha256', c.appSecret).update(raw).digest('hex')}`;
    if (!safeEqual(expected, header)) throw new ForbiddenException('Invalid signature');
  }

  async handleWebhook(payload: unknown) {
    const event = await this.prisma.whatsAppWebhookEvent.create({ data: { payload: (payload ?? {}) as Prisma.InputJsonValue } });
    try {
      const result = await this.processWebhook(payload);
      await this.prisma.whatsAppWebhookEvent.update({ where: { id: event.id }, data: { processed: true } });
      return result;
    } catch (e) {
      await this.prisma.whatsAppWebhookEvent.update({ where: { id: event.id }, data: { error: (e as Error).message.slice(0, 500) } });
      return { statuses: 0, optChanges: 0 };
    }
  }

  private async processWebhook(payload: unknown) {
    type Status = { id: string; status: string; timestamp?: string; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] };
    type Incoming = { from: string; type: string; text?: { body?: string }; button?: { text?: string } };
    const body = payload as { entry?: { changes?: { value?: { statuses?: Status[]; messages?: Incoming[] } }[] }[] };
    let statuses = 0;
    let optChanges = 0;
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const s of change.value?.statuses ?? []) {
          if (await this.applyStatus(s)) statuses++;
        }
        for (const msg of change.value?.messages ?? []) {
          const word = (msg.text?.body ?? msg.button?.text ?? '').trim().toUpperCase();
          if (['STOP', 'UNSUBSCRIBE', 'STOP ALL'].includes(word)) optChanges += await this.optByNumber(msg.from, false);
          else if (['START', 'SUBSCRIBE', 'YES'].includes(word)) optChanges += await this.optByNumber(msg.from, true);
        }
      }
    }
    return { statuses, optChanges };
  }

  private async applyStatus(s: { id: string; status: string; timestamp?: string; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] }) {
    const next = s.status?.toUpperCase();
    if (!['SENT', 'DELIVERED', 'READ', 'FAILED'].includes(next)) return false;
    const m = await this.prisma.whatsAppMessage.findUnique({ where: { waMessageId: s.id } });
    if (!m) return false;
    const at = s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date();
    const data: Prisma.WhatsAppMessageUpdateInput = {};
    if (next === 'DELIVERED' && !m.deliveredAt) data.deliveredAt = at;
    if (next === 'READ') { data.readAt = m.readAt ?? at; if (!m.deliveredAt) data.deliveredAt = at; }
    if (next === 'SENT' && !m.sentAt) data.sentAt = at;
    if (next === 'FAILED') {
      const err = s.errors?.[0];
      Object.assign(data, { failedAt: at, errorCode: err?.code != null ? String(err.code) : 'FAILED', errorMessage: (err?.error_data?.details || err?.message || err?.title || 'WhatsApp could not deliver this message').slice(0, 500) });
    }
    // Statuses can arrive out of order: never move back (read -> delivered), but a failure always wins.
    if (next === 'FAILED' || WHATSAPP_STATUS_RANK[next] > WHATSAPP_STATUS_RANK[m.status] && m.status !== 'FAILED') data.status = next as 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
    if (!Object.keys(data).length) return false;
    await this.prisma.whatsAppMessage.update({ where: { id: m.id }, data });
    return true;
  }

  /** Customer replied STOP / START on WhatsApp. */
  private async optByNumber(from: string, optIn: boolean) {
    const number = normalizePhone(from);
    if (!number) return 0;
    const customers = await this.prisma.customer.findMany({ where: { deletedAt: null, whatsappOptIn: !optIn, OR: [{ whatsapp: number }, { whatsapp: null, mobile: number }] } });
    for (const c of customers) {
      await this.prisma.customer.update({ where: { id: c.id }, data: { whatsappOptIn: optIn, whatsappOptInAt: optIn ? new Date() : null, version: { increment: 1 } } });
      await this.audit.log({ action: 'UPDATE', module: 'customers', recordId: c.id, oldValues: { whatsappOptIn: !optIn }, newValues: { whatsappOptIn: optIn, note: optIn ? 'Customer sent START on WhatsApp' : 'Customer sent STOP on WhatsApp' } }, SYSTEM_CTX);
    }
    return customers.length;
  }
}

function karachiDateIso(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
