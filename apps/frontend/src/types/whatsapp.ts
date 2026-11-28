export type WaStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
export type WaChannel = 'CLOUD_API' | 'MANUAL';

export interface WaMessage {
  id: string; toNumber: string; channel: WaChannel; messageType: string; body: string | null; status: WaStatus;
  attempts: number; nextRetryAt: string | null; errorCode: string | null; errorMessage: string | null;
  relatedType: string | null; relatedId: string | null; sentAt: string | null; deliveredAt: string | null; readAt: string | null; failedAt: string | null;
  createdAt: string; waMessageId: string | null;
  customer: { id: string; code: string; name: string } | null;
  template: { id: string; name: string; purpose: string } | null;
}

export interface WaTemplate {
  id: string; name: string; language: string; category: string; purpose: string; bodyPreview: string; variables: string[];
  metaStatus: string | null; isActive: boolean; messageCount: number; createdAt: string; updatedAt: string;
}

export interface WaConfig {
  enabled: boolean; apiVersion: string; phoneNumberId: string; businessAccountId: string; verifyToken: string;
  autoSend: Record<string, boolean>; requireOptIn: boolean; maxAttempts: number;
  hasAccessToken: boolean; accessTokenHint: string; hasAppSecret: boolean; appSecretHint: string; cloudReady: boolean;
}

export interface WaSummary {
  today: number; monthTotal: number; month: Partial<Record<WaStatus, number>>; queued: number; failed: number; optedIn: number;
  deliveredOrRead: number; cloudReady: boolean; enabled: boolean;
}

export interface WaPreview {
  text: string; toNumber: string | null; toNumberDisplay: string; link: string | null;
  customer: { id: string; name: string; code: string; whatsappOptIn: boolean } | null;
  template: { id: string; name: string; metaStatus: string | null } | null;
  cloudAvailable: boolean; cloudReasons: string[]; warnings: string[];
}
