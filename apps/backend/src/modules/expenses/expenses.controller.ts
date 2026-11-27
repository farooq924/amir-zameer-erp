import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import {
  CreateExpenseDto, ExpenseCategoryDto, ExpenseQueryDto, ExpenseReasonDto, RecurringExpenseDto, SummaryQueryDto, UpdateExpenseCategoryDto, UpdateExpenseDto,
  UpdateRecurringExpenseDto,
} from './dto/expense.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('Expenses')
@ApiCookieAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @RequirePermissions('expenses', 'VIEW')
  list(@Query() q: ExpenseQueryDto) {
    return this.expenses.list(q);
  }

  @Get('summary')
  @RequirePermissions('expenses', 'VIEW')
  summary(@Query() q: SummaryQueryDto) {
    return this.expenses.summary(q.month);
  }

  @Get('categories')
  @RequirePermissions('expenses', 'VIEW')
  categories() {
    return this.expenses.categories();
  }

  @Post('categories')
  @RequirePermissions('expenses', 'EDIT')
  createCategory(@Body() dto: ExpenseCategoryDto, @ReqContext() ctx: RequestContext) {
    return this.expenses.createCategory(dto, ctx);
  }

  @Patch('categories/:id')
  @RequirePermissions('expenses', 'EDIT')
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseCategoryDto, @ReqContext() ctx: RequestContext) {
    return this.expenses.updateCategory(id, dto, ctx);
  }

  @Get('recurring')
  @RequirePermissions('expenses', 'VIEW')
  recurring() {
    return this.expenses.recurring();
  }

  @Post('recurring')
  @RequirePermissions('expenses', 'EDIT')
  createRecurring(@Body() dto: RecurringExpenseDto, @ReqContext() ctx: RequestContext) {
    return this.expenses.createRecurring(dto, ctx);
  }

  @Patch('recurring/:id')
  @RequirePermissions('expenses', 'EDIT')
  updateRecurring(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRecurringExpenseDto, @ReqContext() ctx: RequestContext) {
    return this.expenses.updateRecurring(id, dto, ctx);
  }

  @Post('recurring/generate')
  @RequirePermissions('expenses', 'CREATE')
  @ApiOperation({ summary: 'Create all recurring expenses that are due' })
  generate(@CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.expenses.generateDue(user, ctx);
  }

  @Get(':id')
  @RequirePermissions('expenses', 'VIEW')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenses.get(id);
  }

  @Post()
  @RequirePermissions('expenses', 'CREATE')
  @ApiOperation({ summary: 'Record an expense (approved at once when the user may approve, otherwise waits for approval)' })
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.expenses.create(dto, user, ctx);
  }

  @Patch(':id')
  @RequirePermissions('expenses', 'EDIT')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseDto, @ReqContext() ctx: RequestContext) {
    return this.expenses.update(id, dto, ctx);
  }

  @Post(':id/approve')
  @RequirePermissions('expenses', 'APPROVE')
  approve(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.expenses.approve(id, ctx);
  }

  @Post(':id/reject')
  @RequirePermissions('expenses', 'APPROVE')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExpenseReasonDto, @ReqContext() ctx: RequestContext) {
    return this.expenses.reject(id, dto.reason, ctx);
  }

  @Post(':id/cancel')
  @RequirePermissions('expenses', 'APPROVE')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExpenseReasonDto, @ReqContext() ctx: RequestContext) {
    return this.expenses.cancel(id, dto.reason, ctx);
  }
}
