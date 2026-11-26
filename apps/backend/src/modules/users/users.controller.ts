import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import { CreateUserDto, ResetPasswordDto, SetUserStatusDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiCookieAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users', 'VIEW')
  list(@Query() q: PaginationQueryDto) {
    return this.users.list(q);
  }

  @Get(':id')
  @RequirePermissions('users', 'VIEW')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @Post()
  @RequirePermissions('users', 'CREATE')
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.users.create(dto, actor, ctx);
  }

  @Patch(':id')
  @RequirePermissions('users', 'EDIT')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.users.update(id, dto, actor, ctx);
  }

  @Patch(':id/status')
  @RequirePermissions('users', 'EDIT')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetUserStatusDto, @CurrentUser() actor: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.users.setStatus(id, dto.isActive, actor, ctx);
  }

  @Post(':id/reset-password')
  @RequirePermissions('users', 'MANAGE_SETTINGS')
  resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto, @ReqContext() ctx: RequestContext) {
    return this.users.resetPassword(id, dto.newPassword, ctx);
  }
}
