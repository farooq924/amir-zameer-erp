import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestContext } from '../../common/types/auth-user';
import { AccountingService } from './accounting.service';
import {
  AccountDto, AsOfQueryDto, DateRangeQueryDto, JournalQueryDto, LedgerQueryDto, ManualJournalDto, PeriodActionDto, ReasonDto, UpdateAccountDto,
} from './dto/accounting.dto';

@ApiTags('Accounting')
@ApiCookieAuth()
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Get('overview')
  @RequirePermissions('accounting', 'VIEW')
  overview() {
    return this.accounting.overview();
  }

  @Post('sync')
  @RequirePermissions('accounting', 'VIEW')
  @ApiOperation({ summary: 'Post every document that has no journal entry yet (safe to run any time)' })
  sync() {
    return this.accounting.syncNow();
  }

  @Get('accounts')
  @RequirePermissions('accounting', 'VIEW')
  accounts() {
    return this.accounting.accounts();
  }

  @Post('accounts')
  @RequirePermissions('accounting', 'MANAGE_SETTINGS')
  createAccount(@Body() dto: AccountDto, @ReqContext() ctx: RequestContext) {
    return this.accounting.createAccount(dto, ctx);
  }

  @Patch('accounts/:id')
  @RequirePermissions('accounting', 'MANAGE_SETTINGS')
  updateAccount(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccountDto, @ReqContext() ctx: RequestContext) {
    return this.accounting.updateAccount(id, dto, ctx);
  }

  @Get('accounts/:id/ledger')
  @RequirePermissions('accounting', 'VIEW')
  ledger(@Param('id', ParseUUIDPipe) id: string, @Query() q: LedgerQueryDto) {
    return this.accounting.ledger(id, q);
  }

  @Get('journals')
  @RequirePermissions('accounting', 'VIEW')
  journals(@Query() q: JournalQueryDto) {
    return this.accounting.journals(q);
  }

  @Get('journals/:id')
  @RequirePermissions('accounting', 'VIEW')
  journal(@Param('id', ParseUUIDPipe) id: string) {
    return this.accounting.journal(id);
  }

  @Post('journals')
  @RequirePermissions('accounting', 'CREATE')
  @ApiOperation({ summary: 'Post a manual journal entry (debits must equal credits)' })
  createManual(@Body() dto: ManualJournalDto, @ReqContext() ctx: RequestContext) {
    return this.accounting.createManual(dto, ctx);
  }

  @Post('journals/:id/reverse')
  @RequirePermissions('accounting', 'APPROVE')
  reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @ReqContext() ctx: RequestContext) {
    return this.accounting.reverseManual(id, dto.reason, ctx);
  }

  @Get('reports/trial-balance')
  @RequirePermissions('accounting', 'VIEW')
  trialBalance(@Query() q: AsOfQueryDto) {
    return this.accounting.trialBalance(q.asOf);
  }

  @Get('reports/profit-loss')
  @RequirePermissions('accounting', 'VIEW')
  profitLoss(@Query() q: DateRangeQueryDto) {
    return this.accounting.profitAndLoss(q.from, q.to);
  }

  @Get('reports/balance-sheet')
  @RequirePermissions('accounting', 'VIEW')
  balanceSheet(@Query() q: AsOfQueryDto) {
    return this.accounting.balanceSheet(q.asOf);
  }

  @Get('reports/cash-flow')
  @RequirePermissions('accounting', 'VIEW')
  cashFlow(@Query() q: DateRangeQueryDto) {
    return this.accounting.cashFlow(q.from, q.to);
  }

  @Get('periods')
  @RequirePermissions('accounting', 'VIEW')
  periods() {
    return this.accounting.periods();
  }

  @Post('periods')
  @RequirePermissions('accounting', 'APPROVE')
  @ApiOperation({ summary: 'Close, reopen or lock a month' })
  setPeriod(@Body() dto: PeriodActionDto, @ReqContext() ctx: RequestContext) {
    return this.accounting.setPeriod(dto.month, dto.action, ctx);
  }
}
