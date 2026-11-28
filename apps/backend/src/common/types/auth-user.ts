export interface AuthCompany {
  id: string;
  code: string;
  name: string;
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED';
  plan: { code: string; name: string; maxUsers: number };
  /** Module keys this company may use (core + plan). */
  modules: string[];
  access: 'FULL' | 'GRACE' | 'READ_ONLY' | 'SUSPENDED';
  endsAt: string | null;
  graceEndsAt: string | null;
  daysLeft: number | null;
}

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  username: string;
  isOwner: boolean;
  roles: { code: string; name: string }[];
  permissions: string[];
  sessionId: string;
  /** TailoringERP platform admin. */
  isSuperAdmin: boolean;
  /** The company this session works in (null = Super Admin platform area). */
  companyId: string | null;
  company: AuthCompany | null;
  /** True when a Super Admin has opened a company for support ("login as"). */
  supportMode: boolean;
}

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  userId: string | null;
}
