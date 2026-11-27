import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ReqContext } from '../../common/decorators/current-user.decorator';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import { ConflictQueryDto, ResolveConflictDto, SnapshotQueryDto, SyncLogQueryDto, SyncPushDto } from './dto/sync.dto';
import { SyncService } from './sync.service';

/**
 * Offline sync API. Every signed-in user may sync their own work; each entry is checked
 * against the same permission as the normal screen (e.g. customers CREATE).
 * Seeing and resolving other users' conflicts needs Synchronization APPROVE.
 */
@ApiTags('Sync')
@ApiCookieAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send entries saved offline. Idempotent: the same operation id is applied only once.' })
  push(@Body() dto: SyncPushDto, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.sync.push(dto, user, ctx);
  }

  @Get('snapshot')
  @ApiOperation({ summary: 'Data a device keeps for offline use (customers, templates, garments, open orders). Use since= for changes only.' })
  snapshot(@Query() q: SnapshotQueryDto, @CurrentUser() user: AuthUser) {
    return this.sync.snapshot(user, q.since);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.sync.summary(user);
  }

  @Get('operations')
  @ApiOperation({ summary: 'Sync log' })
  log(@Query() q: SyncLogQueryDto, @CurrentUser() user: AuthUser) {
    return this.sync.log(q, user);
  }

  @Get('conflicts')
  conflicts(@Query() q: ConflictQueryDto, @CurrentUser() user: AuthUser) {
    return this.sync.conflicts(q, user);
  }

  @Post('conflicts/:id/resolve')
  @HttpCode(200)
  resolve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveConflictDto, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.sync.resolve(id, dto, user, ctx);
  }
}
