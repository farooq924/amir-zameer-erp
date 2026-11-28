import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestContext } from '../../common/types/auth-user';
import { CreateGarmentDto, UpdateGarmentDto } from './dto/garment.dto';
import { GarmentsService } from './garments.service';

@ApiTags('Garments')
@ApiCookieAuth()
@Controller('garments')
export class GarmentsController {
  constructor(private readonly garments: GarmentsService) {}

  @Get()
  @RequirePermissions('garments', 'VIEW')
  @ApiOperation({ summary: 'Garment types with default prices; ?all=true includes inactive ones' })
  list(@Query('all') all?: string) {
    return this.garments.list(all === 'true' || all === '1');
  }

  @Post()
  @RequirePermissions('garments', 'CREATE')
  create(@Body() dto: CreateGarmentDto, @ReqContext() ctx: RequestContext) {
    return this.garments.create(dto, ctx);
  }

  @Patch(':id')
  @RequirePermissions('garments', 'EDIT')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGarmentDto, @ReqContext() ctx: RequestContext) {
    return this.garments.update(id, dto, ctx);
  }

  @Delete(':id')
  @RequirePermissions('garments', 'DELETE')
  @ApiOperation({ summary: 'Delete a garment type that is not used on any order (otherwise mark it inactive)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.garments.remove(id, ctx);
  }
}
