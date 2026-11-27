import { Injectable } from '@nestjs/common';
import { WhatsAppConfig } from './whatsapp.config';

export interface CloudSendResult {
  ok: boolean;
  waMessageId?: string;
  /** Network errors, rate limits and Meta server errors are worth trying again. */
  retryable: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/** Meta error codes that are temporary (rate limits, service busy). */
const RETRYABLE_CODES = new Set(['4', '80007', '130429', '131000', '131016', '131048', '131056', '133004']);

/** Thin wrapper around the official WhatsApp Cloud API (graph.facebook.com). */
@Injectable()
export class CloudApiClient {
  private base(c: WhatsAppConfig) {
    return `https://graph.facebook.com/${c.apiVersion}`;
  }

  async sendMessage(c: WhatsAppConfig, payload: Record<string, unknown>): Promise<CloudSendResult> {
    try {
      const res = await fetch(`${this.base(c)}/${c.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { code?: number; message?: string; error_data?: { details?: string } } };
      if (res.ok && body.messages?.[0]?.id) return { ok: true, waMessageId: body.messages[0].id, retryable: false };
      const code = body.error?.code != null ? String(body.error.code) : `HTTP_${res.status}`;
      const message = body.error?.error_data?.details || body.error?.message || `WhatsApp returned HTTP ${res.status}`;
      return { ok: false, retryable: res.status >= 500 || res.status === 429 || RETRYABLE_CODES.has(code), errorCode: code.slice(0, 40), errorMessage: message.slice(0, 500) };
    } catch (e) {
      return { ok: false, retryable: true, errorCode: 'NETWORK', errorMessage: `Could not reach WhatsApp: ${(e as Error).message}`.slice(0, 500) };
    }
  }

  /** Checks the token and phone number ID. Returns the business phone number shown by Meta. */
  async phoneNumberInfo(c: WhatsAppConfig): Promise<{ ok: boolean; displayPhoneNumber?: string; verifiedName?: string; quality?: string; error?: string }> {
    try {
      const res = await fetch(`${this.base(c)}/${c.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, {
        headers: { Authorization: `Bearer ${c.accessToken}` }, signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => ({}))) as { display_phone_number?: string; verified_name?: string; quality_rating?: string; error?: { message?: string } };
      if (!res.ok) return { ok: false, error: body.error?.message ?? `WhatsApp returned HTTP ${res.status}` };
      return { ok: true, displayPhoneNumber: body.display_phone_number, verifiedName: body.verified_name, quality: body.quality_rating };
    } catch (e) {
      return { ok: false, error: `Could not reach WhatsApp: ${(e as Error).message}` };
    }
  }

  /** Approved / pending templates of the WhatsApp Business Account. */
  async listTemplates(c: WhatsAppConfig): Promise<{ ok: boolean; templates?: { name: string; language: string; status: string; category: string; body?: string }[]; error?: string }> {
    try {
      const res = await fetch(`${this.base(c)}/${c.businessAccountId}/message_templates?fields=name,language,status,category,components&limit=200`, {
        headers: { Authorization: `Bearer ${c.accessToken}` }, signal: AbortSignal.timeout(20_000),
      });
      const body = (await res.json().catch(() => ({}))) as { data?: { name: string; language: string; status: string; category: string; components?: { type: string; text?: string }[] }[]; error?: { message?: string } };
      if (!res.ok) return { ok: false, error: body.error?.message ?? `WhatsApp returned HTTP ${res.status}` };
      return {
        ok: true,
        templates: (body.data ?? []).map((t) => ({ name: t.name, language: t.language, status: t.status, category: t.category, body: t.components?.find((x) => x.type === 'BODY')?.text })),
      };
    } catch (e) {
      return { ok: false, error: `Could not reach WhatsApp: ${(e as Error).message}` };
    }
  }
}
