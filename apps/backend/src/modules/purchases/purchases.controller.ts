import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestContext } from '../../common/types/auth-user';
import { CreatePurchaseDto, CreatePurchaseReturnDto, PurchaseQueryDto } from './dto/purchase.dto';
import { PurchasesService } from './purchases.service';

@ApiTags('Purchases')
@ApiCookieAuth()
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  @RequirePermissions('purchases', 'VIEW')
  list(@Query() q: PurchaseQueryDto) {
    return this.purchases.list(q);
  }

  @Get(':id')
  @RequirePermissions('purchases', 'VIEW')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchases.get(id);
  }

  @Post()
  @RequirePermissions('purchases', 'CREATE')
  @ApiOperation({ summary: 'Enter a supplier bill: stock goes up, supplier balance goes up' })
  create(@Body() dto: CreatePurchaseDto, @ReqContext() ctx: RequestContext) {
    return this.purchases.create(dto, ctx);
  }

  @Post(':id/returns')
  @RequirePermissions('purchases', 'EDIT')
  @ApiOperation({ summary: 'Return fabric to the supplier: stock goes down, supplier balance goes down' })
  createReturn(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreatePurchaseReturnDto, @ReqContext() ctx: RequestContext) {
    return this.purchases.createReturn(id, dto, ctx);
  }
}
