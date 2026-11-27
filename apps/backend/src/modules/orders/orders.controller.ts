import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestContext } from '../../common/types/auth-user';
import {
  AdjustmentDto, AssignDto, CancelOrderDto, ChangeStageDto, CreateOrderDto, DeliverDto, OrderQueryDto, RecordPaymentDto, RefreshMeasurementDto,
  ReorderStagesDto, StageDto, UpdateOrderDto, UpdateStageDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';
import { WorkflowService } from './workflow.service';

@ApiTags('Orders')
@ApiCookieAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService, private readonly workflow: WorkflowService) {}

  @Get()
  @RequirePermissions('orders', 'VIEW')
  @ApiOperation({ summary: 'Search by order number, customer name, code or mobile; filter by stage, status, payment and due date' })
  list(@Query() q: OrderQueryDto) {
    return this.orders.list(q);
  }

  @Get('summary')
  @RequirePermissions('orders', 'VIEW')
  summary() {
    return this.orders.summary();
  }

  @Get('form-options')
  @RequirePermissions('orders', 'VIEW')
  @ApiOperation({ summary: 'Active garments, stages, employees and order settings for the order form' })
  formOptions() {
    return this.orders.formOptions();
  }

  @Get('customer-measurements/:customerId')
  @RequirePermissions('orders', 'VIEW')
  customerMeasurements(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.orders.customerMeasurements(customerId);
  }

  // ---- workflow stages (configurable)
  @Get('workflow-stages')
  @RequirePermissions('orders', 'VIEW')
  stages() {
    return this.workflow.list();
  }

  @Post('workflow-stages')
  @RequirePermissions('orders', 'MANAGE_SETTINGS')
  createStage(@Body() dto: StageDto, @ReqContext() ctx: RequestContext) {
    return this.workflow.create(dto, ctx);
  }

  @Put('workflow-stages/order')
  @RequirePermissions('orders', 'MANAGE_SETTINGS')
  reorderStages(@Body() dto: ReorderStagesDto, @ReqContext() ctx: RequestContext) {
    return this.workflow.reorder(dto, ctx);
  }

  @Patch('workflow-stages/:id')
  @RequirePermissions('orders', 'MANAGE_SETTINGS')
  updateStage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStageDto, @ReqContext() ctx: RequestContext) {
    return this.workflow.update(id, dto, ctx);
  }

  // ---- orders
  @Get(':id')
  @RequirePermissions('orders', 'VIEW')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(id);
  }

  @Post()
  @RequirePermissions('orders', 'CREATE')
  @ApiOperation({ summary: 'Book an order (copies the latest measurements and can take an advance payment)' })
  create(@Body() dto: CreateOrderDto, @ReqContext() ctx: RequestContext) {
    return this.orders.create(dto, ctx);
  }

  @Put(':id')
  @RequirePermissions('orders', 'EDIT')
  @ApiOperation({ summary: 'Revise an open order (items, prices, dates)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderDto, @ReqContext() ctx: RequestContext) {
    return this.orders.update(id, dto, ctx);
  }

  @Post(':id/stage')
  @RequirePermissions('orders', 'EDIT')
  changeStage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeStageDto, @ReqContext() ctx: RequestContext) {
    return this.orders.changeStage(id, dto, ctx);
  }

  @Post(':id/assign')
  @RequirePermissions('orders', 'EDIT')
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto, @ReqContext() ctx: RequestContext) {
    return this.orders.assign(id, dto, ctx);
  }

  @Post(':id/items/:itemId/measurement')
  @RequirePermissions('orders', 'EDIT')
  refreshMeasurement(
    @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: RefreshMeasurementDto, @ReqContext() ctx: RequestContext,
  ) {
    return this.orders.refreshMeasurement(id, itemId, dto.measurementId, ctx);
  }

  @Post(':id/deliveries')
  @RequirePermissions('orders', 'EDIT')
  @ApiOperation({ summary: 'Deliver all or some garments (partial delivery), optionally collecting payment' })
  deliver(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DeliverDto, @ReqContext() ctx: RequestContext) {
    return this.orders.deliver(id, dto, ctx);
  }

  @Post(':id/payments')
  @RequirePermissions('payments', 'CREATE')
  @ApiOperation({ summary: 'Receive a payment for this order (idempotent by key)' })
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordPaymentDto, @ReqContext() ctx: RequestContext) {
    return this.orders.recordPayment(id, dto, ctx);
  }

  @Post(':id/cancel')
  @RequirePermissions('orders', 'DELETE')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto, @ReqContext() ctx: RequestContext) {
    return this.orders.cancel(id, dto, ctx);
  }

  @Post(':id/adjustments')
  @RequirePermissions('orders', 'APPROVE')
  @ApiOperation({ summary: 'Authorised price change, discount, alteration charge or write-off' })
  adjust(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustmentDto, @ReqContext() ctx: RequestContext) {
    return this.orders.addAdjustment(id, dto, ctx);
  }
}
