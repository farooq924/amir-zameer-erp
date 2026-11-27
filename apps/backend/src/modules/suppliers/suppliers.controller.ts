import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestContext } from '../../common/types/auth-user';
import { CreateSupplierDto, SupplierPaymentDto, SupplierQueryDto, UpdateSupplierDto } from './dto/supplier.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('Suppliers')
@ApiCookieAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermissions('suppliers', 'VIEW')
  @ApiOperation({ summary: 'Suppliers with the balance we owe each one' })
  list(@Query() q: SupplierQueryDto) {
    return this.suppliers.list(q);
  }

  @Get('summary')
  @RequirePermissions('suppliers', 'VIEW')
  totals() {
    return this.suppliers.totals();
  }

  @Get('options')
  @RequirePermissions('purchases', 'VIEW')
  options() {
    return this.suppliers.options();
  }

  @Get(':id')
  @RequirePermissions('suppliers', 'VIEW')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.get(id);
  }

  @Get(':id/ledger')
  @RequirePermissions('suppliers', 'VIEW')
  ledger(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.ledger(id);
  }

  @Post()
  @RequirePermissions('suppliers', 'CREATE')
  create(@Body() dto: CreateSupplierDto, @ReqContext() ctx: RequestContext) {
    return this.suppliers.create(dto, ctx);
  }

  @Patch(':id')
  @RequirePermissions('suppliers', 'EDIT')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto, @ReqContext() ctx: RequestContext) {
    return this.suppliers.update(id, dto, ctx);
  }

  @Post(':id/payments')
  @RequirePermissions('suppliers', 'EDIT')
  @ApiOperation({ summary: 'Pay a supplier (applied to the oldest unpaid purchases unless a purchase is chosen)' })
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SupplierPaymentDto, @ReqContext() ctx: RequestContext) {
    return this.suppliers.recordPayment(id, dto, ctx);
  }
}
