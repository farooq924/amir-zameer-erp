import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ReqContext } from '../../common/decorators/current-user.decorator';
import { Platform } from '../../common/decorators/platform.decorator';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import {
  CompanyListQueryDto, CreateCompanyDto, PaymentListQueryDto, PlanDto, RecordCompanyPaymentDto, ResetOwnerPasswordDto, SuspendCompanyDto, UpdateCompanyDto, UpdatePlanDto,
} from './dto/platform.dto';
import { PlatformService } from './platform.service';

/** TailoringERP Super Admin panel. Every route here is Super Admin only and works across all companies. */
@ApiTags('Platform (Super Admin)')
@ApiCookieAuth()
@Platform()
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('overview') @ApiOperation({ summary: 'Companies, subscriptions and income at a glance' })
  overview() { return this.platform.overview(); }

  @Get('companies')
  companies(@Query() q: CompanyListQueryDto) { return this.platform.listCompanies(q); }

  @Get('companies/options')
  companyOptions() { return this.platform.companyOptions(); }

  @Post('companies') @ApiOperation({ summary: 'Create a company with its Owner login and default data' })
  create(@Body() dto: CreateCompanyDto, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) { return this.platform.createCompany(dto, user, ctx); }

  @Get('companies/:id')
  company(@Param('id', ParseUUIDPipe) id: string) { return this.platform.getCompany(id); }

  @Patch('companies/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompanyDto, @ReqContext() ctx: RequestContext) { return this.platform.updateCompany(id, dto, ctx); }

  @Post('companies/:id/suspend') @HttpCode(200)
  suspend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SuspendCompanyDto, @ReqContext() ctx: RequestContext) { return this.platform.suspend(id, dto.reason, ctx); }

  @Post('companies/:id/activate') @HttpCode(200)
  activate(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) { return this.platform.activate(id, ctx); }

  @Post('companies/:id/payments') @ApiOperation({ summary: 'Record a subscription payment (extends "paid until")' })
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordCompanyPaymentDto, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.platform.recordPayment(id, dto, user, ctx);
  }

  @Post('companies/:id/reset-owner-password') @HttpCode(200)
  resetOwner(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetOwnerPasswordDto, @ReqContext() ctx: RequestContext) {
    return this.platform.resetOwnerPassword(id, dto.password, ctx);
  }

  @Post('companies/:id/enter') @HttpCode(200) @ApiOperation({ summary: 'Support access: open this company as Super Admin (audited)' })
  enter(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) { return this.platform.enter(id, user, ctx); }

  @Post('exit-company') @HttpCode(200) @ApiOperation({ summary: 'Leave the company opened for support' })
  exit(@CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) { return this.platform.exit(user, ctx); }

  @Get('payments')
  payments(@Query() q: PaymentListQueryDto) { return this.platform.listPayments(q); }

  @Get('audit-logs')
  auditLogs(@Query() q: PaymentListQueryDto) { return this.platform.auditLogs(q); }

  @Get('plans')
  plans() { return this.platform.listPlans(); }

  @Post('plans')
  createPlan(@Body() dto: PlanDto, @ReqContext() ctx: RequestContext) { return this.platform.createPlan(dto, ctx); }

  @Patch('plans/:id')
  updatePlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto, @ReqContext() ctx: RequestContext) { return this.platform.updatePlan(id, dto, ctx); }
}
