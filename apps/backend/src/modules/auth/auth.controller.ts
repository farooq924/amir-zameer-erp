import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';
import { CurrentUser, ReqContext, buildRequestContext } from '../../common/decorators/current-user.decorator';
import { AllowReadOnly, CompanyOptional } from '../../common/decorators/platform.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto/login.dto';
import { CSRF_COOKIE, SESSION_COOKIE, SessionService } from './session.service';

/**
 * Cookies are marked Secure when COOKIE_SECURE=true, or automatically when the request arrived over HTTPS
 * through a trusted proxy (TRUST_PROXY=true), e.g. a Cloudflare Tunnel. Plain http://localhost keeps working.
 */
function cookieBase(req: Request): CookieOptions {
  return { secure: env().COOKIE_SECURE || req.secure, sameSite: 'strict', path: '/' };
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly sessions: SessionService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: () => env().LOGIN_RATE_LIMIT_PER_MINUTE, ttl: 60_000 } })
  @ApiOperation({ summary: 'Log in with username/email and password. Sets an HTTP-only session cookie.' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const ctx = buildRequestContext(req);
    const session = await this.auth.login(dto.identifier, dto.password, ctx);
    const maxAge = session.expiresAt.getTime() - Date.now();
    res.cookie(SESSION_COOKIE, session.token, { ...cookieBase(req), httpOnly: true, maxAge });
    // Readable by the SPA (double-submit CSRF token); useless to other origins thanks to SameSite + same-origin policy.
    res.cookie(CSRF_COOKIE, session.csrfToken, { ...cookieBase(req), httpOnly: false, maxAge });
    const validated = await this.sessions.validate(session.token);
    return { user: validated?.user, csrfToken: session.csrfToken, expiresAt: session.expiresAt };
  }

  @Post('logout')
  @CompanyOptional()
  @AllowReadOnly()
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'End the current session' })
  async logout(
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(user, ctx);
    res.clearCookie(SESSION_COOKIE, cookieBase(req));
    res.clearCookie(CSRF_COOKIE, cookieBase(req));
    return { success: true };
  }

  @Get('me')
  @CompanyOptional()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Current user, roles and effective permissions' })
  me(@CurrentUser() user: AuthUser, @Req() req: Request & { csrfToken?: string }) {
    return { user, csrfToken: req.csrfToken };
  }

  @Post('change-password')
  @CompanyOptional()
  @AllowReadOnly()
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Change own password. Other sessions are logged out.' })
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @ReqContext() ctx: RequestContext) {
    await this.auth.changePassword(user, dto.currentPassword, dto.newPassword, ctx);
    return { success: true };
  }
}
