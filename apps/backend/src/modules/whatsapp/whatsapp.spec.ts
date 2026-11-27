import { DEFAULT_WHATSAPP_TEMPLATES, renderWhatsAppTemplate, templatePlaceholderCount } from '@az/shared';
import { DEFAULT_WHATSAPP_CONFIG, isCloudReady, publicConfig, retryDelayMs } from './whatsapp.config';

describe('WhatsApp templates', () => {
  it('fills {{n}} placeholders in order and shows "-" for empty values', () => {
    expect(renderWhatsAppTemplate('Dear {{1}}, order {{2}} balance Rs {{3}}', ['customer_name', 'order_number', 'balance_amount'], { customer_name: 'Ali', order_number: 'AZ-2026-00001' }))
      .toBe('Dear Ali, order AZ-2026-00001 balance Rs -');
    expect(renderWhatsAppTemplate('{{ 1 }} and {{1}}', ['customer_name'], { customer_name: 'Ali' })).toBe('Ali and Ali');
  });
  it('every default template has one value per placeholder', () => {
    for (const t of DEFAULT_WHATSAPP_TEMPLATES) expect(templatePlaceholderCount(t.bodyPreview)).toBe(t.variables.length);
  });
});

describe('WhatsApp config', () => {
  it('backs off 1, 2, 4 ... minutes, at most one hour', () => {
    expect([1, 2, 3, 4, 7, 12].map((a) => retryDelayMs(a) / 60_000)).toEqual([1, 2, 4, 8, 60, 60]);
  });
  it('needs phone number id and token to be ready, and never exposes secrets', () => {
    expect(isCloudReady({ ...DEFAULT_WHATSAPP_CONFIG, enabled: true })).toBe(false);
    const c = { ...DEFAULT_WHATSAPP_CONFIG, enabled: true, phoneNumberId: '123', accessToken: 'EAAsecret1234', appSecret: 'abcdef' };
    expect(isCloudReady(c)).toBe(true);
    const p = publicConfig(c);
    expect(JSON.stringify(p)).not.toContain('EAAsecret');
    expect(p.accessTokenHint).toBe('...1234');
    expect(p.hasAppSecret).toBe(true);
  });
});
