import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import { LoginAttemptsQueryDto, SessionsQueryDto } from './dto/security.dto';
import { SecurityService } from './security.service';

@ApiTags('Security')
@ApiCookieAuth()
@Controller('security')
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  @Get('overview')
  @RequirePermissions('security', 'VIEW')
  @ApiOperation({ summary: 'Security checklist and login statistics' })
  overview(@CurrentUser() user: AuthUser) {
    return this.security.overview(user);
  }

  /** Every signed-in user may list (scope=mine) and end their own sessions. */
  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser, @Query() q: SessionsQueryDto) {
    return this.security.listSessions(user, q.scope);
  }

  @Post('sessions/revoke-others')
  @HttpCode(200)
  async revokeOthers(@CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return { revoked: await this.security.revokeOtherSessions(user, ctx) };
  }

  @Post('sessions/:id/revoke')
  @HttpCode(200)
  async revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    await this.security.revokeSession(user, id, ctx);
    return { success: true };
  }

  @Get('login-attempts')
  @RequirePermissions('security', 'VIEW')
  loginAttempts(@Query() q: LoginAttemptsQueryDto) {
    return this.security.loginAttempts(q);
  }

  @Get('locked-users')
  @RequirePermissions('security', 'VIEW')
  lockedUsers() {
    return this.security.lockedUsers();
  }

  @Post('users/:id/unlock')
  @HttpCode(200)
  @RequirePermissions('security', 'MANAGE_SETTINGS')
  async unlock(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    await this.security.unlockUser(id, ctx);
    return { success: true };
  }
}
