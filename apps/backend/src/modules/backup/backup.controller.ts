import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, ReqContext } from '../../common/decorators/current-user.decorator';
import { Platform } from '../../common/decorators/platform.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import { BackupService } from './backup.service';
import { BackupListQueryDto, CreateBackupDto, PasswordConfirmDto, RestoreBackupDto, UpdateBackupConfigDto } from './dto/backup.dto';

/** Backups cover the whole platform (all companies), so only the TailoringERP Super Admin manages them. */
@ApiTags('Backup')
@ApiCookieAuth()
@Platform()
@Controller('backup')
export class BackupController {
  constructor(private readonly backups: BackupService) {}

  @Get('overview')
  @RequirePermissions('backup', 'VIEW')
  @ApiOperation({ summary: 'Backup status: last backup, schedule, key, folder' })
  overview() {
    return this.backups.overview();
  }

  @Get()
  @RequirePermissions('backup', 'VIEW')
  list(@Query() q: BackupListQueryDto) {
    return this.backups.list(q);
  }

  @Post()
  @RequirePermissions('backup', 'CREATE')
  @ApiOperation({ summary: 'Make an encrypted backup now' })
  create(@Body() dto: CreateBackupDto, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.backups.createNow(user, dto.note, ctx);
  }

  @Put('settings')
  @RequirePermissions('backup', 'APPROVE')
  updateSettings(@Body() dto: UpdateBackupConfigDto, @ReqContext() ctx: RequestContext) {
    return this.backups.updateConfig(dto, ctx);
  }

  @Post('scan')
  @HttpCode(200)
  @RequirePermissions('backup', 'CREATE')
  @ApiOperation({ summary: 'Add backups found in the backups folder (for example copied from another PC)' })
  scan(@ReqContext() ctx: RequestContext) {
    return this.backups.scan(ctx);
  }

  @Post('recovery-key')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @RequirePermissions('backup', 'APPROVE')
  @ApiOperation({ summary: 'Owner only: download the backup encryption key (password required)' })
  async recoveryKey(@Body() dto: PasswordConfirmDto, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext, @Res() res: Response) {
    const { fileName, text } = await this.backups.recoveryKey(user, dto.password, ctx);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(text);
  }

  @Get(':id/download')
  @RequirePermissions('backup', 'EXPORT')
  async download(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext, @Res() res: Response) {
    const { fileName, stream } = await this.backups.openDownload(id, ctx);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    stream.pipe(res);
  }

  @Post(':id/verify')
  @HttpCode(200)
  @RequirePermissions('backup', 'CREATE')
  verify(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.backups.verify(id, ctx);
  }

  @Post(':id/restore-test')
  @HttpCode(200)
  @RequirePermissions('backup', 'CREATE')
  @ApiOperation({ summary: 'Restore into a temporary database, compare row counts, then delete it' })
  restoreTest(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.backups.restoreTest(id, ctx);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @RequirePermissions('backup', 'APPROVE')
  @ApiOperation({ summary: 'Owner only: replace all current data with this backup (a safety backup is made first)' })
  restore(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RestoreBackupDto, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.backups.restore(id, user, dto.password, ctx);
  }

  @Delete(':id')
  @RequirePermissions('backup', 'APPROVE')
  async remove(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    await this.backups.remove(id, ctx);
    return { success: true };
  }
}
