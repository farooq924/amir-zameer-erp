import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestContext } from '../../common/types/auth-user';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RolesService } from './roles.service';

@ApiTags('Roles & Permissions')
@ApiCookieAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions('users', 'VIEW')
  list() {
    return this.roles.list();
  }

  @Get('permissions')
  @RequirePermissions('users', 'VIEW')
  catalogue() {
    return this.roles.catalogue();
  }

  @Post()
  @RequirePermissions('users', 'MANAGE_SETTINGS')
  create(@Body() dto: CreateRoleDto, @ReqContext() ctx: RequestContext) {
    return this.roles.create(dto, ctx);
  }

  @Patch(':id')
  @RequirePermissions('users', 'MANAGE_SETTINGS')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto, @ReqContext() ctx: RequestContext) {
    return this.roles.update(id, dto, ctx);
  }

  @Delete(':id')
  @RequirePermissions('users', 'MANAGE_SETTINGS')
  remove(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.roles.remove(id, ctx);
  }
}
