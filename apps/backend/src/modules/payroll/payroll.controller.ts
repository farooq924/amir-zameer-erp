import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestContext } from '../../common/types/auth-user';
import { CreatePayrollDto, PayAllDto, SalaryPaymentDto, UpdatePayrollItemDto } from './dto/payroll.dto';
import { PayrollService } from './payroll.service';

@ApiTags('Payroll')
@ApiCookieAuth()
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get()
  @RequirePermissions('payroll', 'VIEW')
  list() {
    return this.payroll.list();
  }

  @Get('items/:itemId/payslip')
  @RequirePermissions('payroll', 'PRINT')
  payslip(@Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.payroll.payslip(itemId);
  }

  @Post('items/:itemId/payments')
  @RequirePermissions('payroll', 'CREATE')
  @ApiOperation({ summary: 'Pay salary to one employee (full or part)' })
  pay(@Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: SalaryPaymentDto, @ReqContext() ctx: RequestContext) {
    return this.payroll.pay(itemId, dto, ctx);
  }

  @Get(':id')
  @RequirePermissions('payroll', 'VIEW')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.get(id);
  }

  @Get(':id/payments')
  @RequirePermissions('payroll', 'VIEW')
  payments(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.salaryPayments(id);
  }

  @Post()
  @RequirePermissions('payroll', 'CREATE')
  @ApiOperation({ summary: 'Calculate the payroll of a month (draft)' })
  create(@Body() dto: CreatePayrollDto, @ReqContext() ctx: RequestContext) {
    return this.payroll.create(dto, ctx);
  }

  @Post(':id/recalculate')
  @RequirePermissions('payroll', 'EDIT')
  recalculate(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.payroll.recalculate(id, ctx);
  }

  @Patch(':id/items/:itemId')
  @RequirePermissions('payroll', 'EDIT')
  updateItem(@Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: UpdatePayrollItemDto, @ReqContext() ctx: RequestContext) {
    return this.payroll.updateItem(id, itemId, dto, ctx);
  }

  @Post(':id/approve')
  @RequirePermissions('payroll', 'APPROVE')
  approve(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.payroll.approve(id, ctx);
  }

  @Post(':id/reopen')
  @RequirePermissions('payroll', 'APPROVE')
  reopen(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.payroll.reopen(id, ctx);
  }

  @Post(':id/pay-all')
  @RequirePermissions('payroll', 'CREATE')
  payAll(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayAllDto, @ReqContext() ctx: RequestContext) {
    return this.payroll.payAll(id, dto, ctx);
  }

  @Delete(':id')
  @RequirePermissions('payroll', 'DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.payroll.remove(id, ctx);
  }
}
