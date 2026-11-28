/**
 * WhatsApp messaging (Phase 8): template purposes, variables and the default templates.
 * Template bodies use Meta's {{1}}, {{2}} ... placeholders. `variables` lists, in order,
 * which ERP value goes into each placeholder.
 */

export const WHATSAPP_PURPOSES = [
  { key: 'ORDER_CONFIRMATION', label: 'Order booked', auto: true, context: 'ORDER' },
  { key: 'ORDER_READY', label: 'Order ready for collection', auto: true, context: 'ORDER' },
  { key: 'ORDER_DELIVERED', label: 'Order delivered', auto: true, context: 'ORDER' },
  { key: 'PAYMENT_RECEIVED', label: 'Payment received', auto: true, context: 'PAYMENT' },
  { key: 'PAYMENT_REMINDER', label: 'Balance reminder', auto: false, context: 'ORDER' },
  { key: 'DELIVERY_REMINDER', label: 'Delivery date reminder', auto: false, context: 'ORDER' },
  { key: 'GENERAL', label: 'General message', auto: false, context: 'CUSTOMER' },
] as const;
export type WhatsAppPurpose = (typeof WHATSAPP_PURPOSES)[number]['key'];
export type WhatsAppAutoPurpose = Extract<WhatsAppPurpose, 'ORDER_CONFIRMATION' | 'ORDER_READY' | 'ORDER_DELIVERED' | 'PAYMENT_RECEIVED'>;
export const WHATSAPP_AUTO_PURPOSES = WHATSAPP_PURPOSES.filter((p) => p.auto).map((p) => p.key) as WhatsAppAutoPurpose[];

/** Values the ERP can fill into a template. `context` = the record that must be selected to fill it. */
export const WHATSAPP_VARIABLES = [
  { key: 'customer_name', label: 'Customer name', context: 'CUSTOMER', sample: 'Muhammad Bilal' },
  { key: 'customer_code', label: 'Customer code', context: 'CUSTOMER', sample: 'AZC-00012' },
  { key: 'customer_balance', label: 'Customer outstanding balance', context: 'CUSTOMER', sample: '2,500' },
  { key: 'business_name', label: 'Shop name', context: 'ANY', sample: 'AMIR ZAMEER' },
  { key: 'business_phone', label: 'Shop phone', context: 'ANY', sample: '021-34567890' },
  { key: 'order_number', label: 'Order number', context: 'ORDER', sample: 'AZ-2026-00045' },
  { key: 'order_date', label: 'Order date', context: 'ORDER', sample: '27/11/2026' },
  { key: 'delivery_date', label: 'Delivery date', context: 'ORDER', sample: '04/12/2026' },
  { key: 'garments', label: 'Garments (e.g. 2 x Shalwar Kameez)', context: 'ORDER', sample: '2 x Shalwar Kameez' },
  { key: 'order_total', label: 'Order total', context: 'ORDER', sample: '6,500' },
  { key: 'paid_amount', label: 'Paid so far', context: 'ORDER', sample: '3,000' },
  { key: 'balance_amount', label: 'Balance due', context: 'ORDER', sample: '3,500' },
  { key: 'order_status', label: 'Order status', context: 'ORDER', sample: 'Stitching' },
  { key: 'receipt_number', label: 'Receipt number', context: 'PAYMENT', sample: 'RCP-2026-00031' },
  { key: 'payment_amount', label: 'Payment amount', context: 'PAYMENT', sample: '3,000' },
  { key: 'payment_method', label: 'Payment method', context: 'PAYMENT', sample: 'Cash' },
  { key: 'payment_date', label: 'Payment date', context: 'PAYMENT', sample: '27/11/2026' },
] as const;
export type WhatsAppVariable = (typeof WHATSAPP_VARIABLES)[number]['key'];
export const WHATSAPP_VARIABLE_KEYS = WHATSAPP_VARIABLES.map((v) => v.key) as string[];

export interface DefaultWhatsAppTemplate {
  name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING';
  purpose: WhatsAppPurpose;
  bodyPreview: string;
  variables: WhatsAppVariable[];
}

/** Created on first start. The owner submits the same names and text in Meta WhatsApp Manager for approval. */
export const DEFAULT_WHATSAPP_TEMPLATES: DefaultWhatsAppTemplate[] = [
  {
    name: 'order_confirmation', language: 'en', category: 'UTILITY', purpose: 'ORDER_CONFIRMATION',
    bodyPreview: 'Dear {{1}}, thank you for your order {{2}} at {{3}}. Total: Rs {{4}}, paid: Rs {{5}}, balance: Rs {{6}}. Expected delivery: {{7}}.',
    variables: ['customer_name', 'order_number', 'business_name', 'order_total', 'paid_amount', 'balance_amount', 'delivery_date'],
  },
  {
    name: 'order_ready', language: 'en', category: 'UTILITY', purpose: 'ORDER_READY',
    bodyPreview: 'Dear {{1}}, good news! Your order {{2}} is ready for collection at {{3}}. Balance due: Rs {{4}}.',
    variables: ['customer_name', 'order_number', 'business_name', 'balance_amount'],
  },
  {
    name: 'order_delivered', language: 'en', category: 'UTILITY', purpose: 'ORDER_DELIVERED',
    bodyPreview: 'Dear {{1}}, your order {{2}} has been delivered. Thank you for choosing {{3}}.',
    variables: ['customer_name', 'order_number', 'business_name'],
  },
  {
    name: 'payment_received', language: 'en', category: 'UTILITY', purpose: 'PAYMENT_RECEIVED',
    bodyPreview: 'Dear {{1}}, we have received Rs {{2}} for order {{3}} (receipt {{4}}). Remaining balance: Rs {{5}}. - {{6}}',
    variables: ['customer_name', 'payment_amount', 'order_number', 'receipt_number', 'balance_amount', 'business_name'],
  },
  {
    name: 'payment_reminder', language: 'en', category: 'UTILITY', purpose: 'PAYMENT_REMINDER',
    bodyPreview: 'Dear {{1}}, a balance of Rs {{2}} is pending on your order {{3}}. Please clear it on your next visit. - {{4}}',
    variables: ['customer_name', 'balance_amount', 'order_number', 'business_name'],
  },
  {
    name: 'delivery_reminder', language: 'en', category: 'UTILITY', purpose: 'DELIVERY_REMINDER',
    bodyPreview: 'Dear {{1}}, this is a reminder that your order {{2}} ({{3}}) is due on {{4}}. - {{5}}',
    variables: ['customer_name', 'order_number', 'garments', 'delivery_date', 'business_name'],
  },
];

/** Number of {{n}} placeholders a body needs (highest n). */
export function templatePlaceholderCount(body: string): number {
  let max = 0;
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

/** Fills {{1}}..{{n}} with the values of `variables` (missing values become "-"). */
export function renderWhatsAppTemplate(body: string, variables: readonly string[], values: Record<string, string | null | undefined>): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n: string) => {
    const key = variables[Number(n) - 1];
    const v = key ? values[key] : undefined;
    return v == null || v === '' ? '-' : String(v);
  });
}

export const WHATSAPP_STATUS_LABEL: Record<string, string> = {
  QUEUED: 'Queued', SENT: 'Sent', DELIVERED: 'Delivered', READ: 'Read', FAILED: 'Failed',
};
export const WHATSAPP_CHANNEL_LABEL: Record<string, string> = { CLOUD_API: 'Cloud API', MANUAL: 'Manual (WhatsApp app)' };

/** Status order so webhook updates never move a message backwards (read -> delivered). */
export const WHATSAPP_STATUS_RANK: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };
