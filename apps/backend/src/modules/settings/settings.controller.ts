import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestContext } from '../../common/types/auth-user';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@ApiCookieAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Business profile is needed by every logged-in user (headers, receipts). */
  @Get()
  getAll() {
    return this.settings.getAll();
  }

  @Put(':group')
  @RequirePermissions('settings', 'MANAGE_SETTINGS')
  @ApiBody({ schema: { type: 'object' } })
  update(@Param('group') group: string, @Body() body: Record<string, unknown>, @ReqContext() ctx: RequestContext) {
    return this.settings.updateGroup(group, body, ctx);
  }
}
