import { WHATSAPP_AUTO_PURPOSES } from '@az/shared';
import { z } from 'zod';

/** Stored in system_settings under this key (not in the public settings list, because it holds secrets). */
export const WHATSAPP_CONFIG_KEY = 'whatsapp.config';

const autoSendShape = Object.fromEntries(WHATSAPP_AUTO_PURPOSES.map((p) => [p, z.boolean()])) as Record<(typeof WHATSAPP_AUTO_PURPOSES)[number], z.ZodBoolean>;

export const WhatsAppConfigSchema = z.object({
  /** Send through the official Meta WhatsApp Cloud API. Off = manual sending from the WhatsApp app only. */
  enabled: z.boolean(),
  apiVersion: z.string().trim().regex(/^v\d{1,2}\.\d$/, 'Use a version like v21.0'),
  phoneNumberId: z.string().trim().regex(/^\d{0,30}$/, 'Phone number ID has digits only'),
  businessAccountId: z.string().trim().regex(/^\d{0,30}$/, 'WhatsApp Business Account ID has digits only'),
  accessToken: z.string().trim().max(1000),
  appSecret: z.string().trim().max(200),
  verifyToken: z.string().trim().min(8, 'Verify token needs at least 8 characters').max(100),
  autoSend: z.object(autoSendShape),
  /** Cloud API messages go only to customers who agreed (WhatsApp policy). */
  requireOptIn: z.boolean(),
  maxAttempts: z.number().int().min(1).max(10),
});
export type WhatsAppConfig = z.infer<typeof WhatsAppConfigSchema>;

export const DEFAULT_WHATSAPP_CONFIG: WhatsAppConfig = {
  enabled: false,
  apiVersion: 'v21.0',
  phoneNumberId: '',
  businessAccountId: '',
  accessToken: '',
  appSecret: '',
  verifyToken: '',
  autoSend: { ORDER_CONFIRMATION: true, ORDER_READY: true, ORDER_DELIVERED: false, PAYMENT_RECEIVED: true },
  requireOptIn: true,
  maxAttempts: 5,
};

/** Never send secrets back to the browser: only whether they are set and their last 4 characters. */
export function publicConfig(c: WhatsAppConfig) {
  const { accessToken, appSecret, ...rest } = c;
  return {
    ...rest,
    hasAccessToken: !!accessToken, accessTokenHint: accessToken ? `...${accessToken.slice(-4)}` : '',
    hasAppSecret: !!appSecret, appSecretHint: appSecret ? `...${appSecret.slice(-4)}` : '',
    cloudReady: isCloudReady(c),
  };
}

export function isCloudReady(c: WhatsAppConfig): boolean {
  return c.enabled && !!c.phoneNumberId && !!c.accessToken;
}

/**
 * Retry delay after a failed attempt: 1, 2, 4, 8 ... minutes, at most 60.
 * `attempt` is the number of attempts already made (1 = first try failed).
 */
export function retryDelayMs(attempt: number): number {
  return Math.min(60, 2 ** Math.max(0, attempt - 1)) * 60_000;
}
