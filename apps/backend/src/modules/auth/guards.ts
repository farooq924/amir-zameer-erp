import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { safeEqual } from '../../common/utils/crypto';
import { CSRF_HEADER, SESSION_COOKIE, SessionService } from './session.service';

type AuthedRequest = Request & { user?: AuthUser; csrfToken?: string };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** 1. Every route requires a valid session unless marked @Public(). */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    const result = await this.sessions.validate(token);
    if (!result) throw new UnauthorizedException('Your session has expired. Please log in again.');
    req.user = result.user;
    req.csrfToken = result.csrfToken;
    return true;
  }
}

/** 2. State-changing requests must echo the session's CSRF token in the X-CSRF-Token header. */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (isPublic || SAFE_METHODS.has(req.method)) return true;
    const header = req.headers[CSRF_HEADER];
    if (typeof header !== 'string' || !req.csrfToken || !safeEqual(header, req.csrfToken)) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }
    return true;
  }
}

/** 3. Granular RBAC. The Owner role bypasses checks; everyone else needs every listed permission. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) throw new UnauthorizedException();
    if (user.isOwner) return true;
    const missing = required.filter((p) => !user.permissions.includes(p));
    if (missing.length > 0) {
      throw new ForbiddenException({ message: 'You do not have permission to perform this action', details: { missing } });
    }
    return true;
  }
}
