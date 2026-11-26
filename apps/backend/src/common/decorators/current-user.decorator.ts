import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser, RequestContext } from '../types/auth-user';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
  return req.user;
});

export function buildRequestContext(req: Request & { user?: AuthUser }): RequestContext {
  const ua = req.headers['user-agent'];
  return {
    ipAddress: req.ip ?? null,
    userAgent: typeof ua === 'string' ? ua.slice(0, 400) : null,
    sessionId: req.user?.sessionId ?? null,
    userId: req.user?.id ?? null,
  };
}

/** Injects IP / user agent / session info for audit logging. */
export const ReqContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestContext =>
  buildRequestContext(ctx.switchToHttp().getRequest()),
);
