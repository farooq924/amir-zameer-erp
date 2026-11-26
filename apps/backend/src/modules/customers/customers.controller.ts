import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { RequestContext } from '../../common/types/auth-user';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, CreateNoteDto, CustomerQueryDto, DuplicateQueryDto, SetCustomerStatusDto, UpdateCustomerDto } from './dto/customer.dto';

@ApiTags('Customers')
@ApiCookieAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions('customers', 'VIEW')
  @ApiOperation({ summary: 'Search by name, code or mobile; filter by status, type and city' })
  list(@Query() q: CustomerQueryDto) {
    return this.customers.list(q);
  }

  @Get('check-duplicates')
  @RequirePermissions('customers', 'VIEW')
  duplicates(@Query() q: DuplicateQueryDto) {
    return this.customers.findDuplicates(q);
  }

  @Get(':id')
  @RequirePermissions('customers', 'VIEW')
  profile(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.profile(id);
  }

  @Post()
  @RequirePermissions('customers', 'CREATE')
  create(@Body() dto: CreateCustomerDto, @ReqContext() ctx: RequestContext) {
    return this.customers.create(dto, ctx);
  }

  @Patch(':id')
  @RequirePermissions('customers', 'EDIT')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto, @ReqContext() ctx: RequestContext) {
    return this.customers.update(id, dto, ctx);
  }

  @Patch(':id/status')
  @RequirePermissions('customers', 'EDIT')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetCustomerStatusDto, @ReqContext() ctx: RequestContext) {
    return this.customers.setStatus(id, dto.status, ctx);
  }

  @Delete(':id')
  @RequirePermissions('customers', 'DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.customers.remove(id, ctx);
  }

  @Get(':id/orders')
  @RequirePermissions('customers', 'VIEW')
  orders(@Param('id', ParseUUIDPipe) id: string, @Query() q: PaginationQueryDto) {
    return this.customers.orders(id, q);
  }

  @Get(':id/payments')
  @RequirePermissions('customers', 'VIEW')
  payments(@Param('id', ParseUUIDPipe) id: string, @Query() q: PaginationQueryDto) {
    return this.customers.payments(id, q);
  }

  @Get(':id/ledger')
  @RequirePermissions('customers', 'VIEW')
  ledger(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.ledger(id);
  }

  @Get(':id/notes')
  @RequirePermissions('customers', 'VIEW')
  notes(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.notes(id);
  }

  @Post(':id/notes')
  @RequirePermissions('customers', 'EDIT')
  addNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateNoteDto, @ReqContext() ctx: RequestContext) {
    return this.customers.addNote(id, dto.note, ctx);
  }
}
