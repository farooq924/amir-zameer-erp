export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  username: string;
  isOwner: boolean;
  roles: { code: string; name: string }[];
  permissions: string[];
  sessionId: string;
}

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  userId: string | null;
}
