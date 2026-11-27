import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestContext } from '../../common/types/auth-user';
import { OutgoingQueryDto, PaymentQueryDto, RefundDto, ReversePaymentDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@ApiCookieAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions('payments', 'VIEW')
  list(@Query() q: PaymentQueryDto) {
    return this.payments.list(q);
  }

  @Get('summary')
  @RequirePermissions('payments', 'VIEW')
  summary() {
    return this.payments.summary();
  }

  @Get('refundable')
  @RequirePermissions('payments', 'VIEW')
  refundable(@Query('search') search?: string) {
    return this.payments.refundable(search);
  }

  @Get('supplier-payments')
  @RequirePermissions('payments', 'VIEW')
  supplierPayments(@Query() q: OutgoingQueryDto) {
    return this.payments.supplierPayments(q);
  }

  @Get('salary-payments')
  @RequirePermissions('payments', 'VIEW')
  salaryPayments(@Query() q: OutgoingQueryDto) {
    return this.payments.salaryPayments(q);
  }

  @Post('refunds')
  @RequirePermissions('payments', 'APPROVE')
  @ApiOperation({ summary: 'Refund a customer from an overpaid or cancelled order' })
  refund(@Body() dto: RefundDto, @ReqContext() ctx: RequestContext) {
    return this.payments.refund(dto, ctx);
  }

  @Get(':id')
  @RequirePermissions('payments', 'VIEW')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.present(id);
  }

  @Post(':id/reverse')
  @RequirePermissions('payments', 'APPROVE')
  @ApiOperation({ summary: 'Reverse a wrong receipt (the order owes the amount again)' })
  reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReversePaymentDto, @ReqContext() ctx: RequestContext) {
    return this.payments.reverse(id, dto.reason, ctx);
  }
}
