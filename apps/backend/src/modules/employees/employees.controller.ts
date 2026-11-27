import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestContext } from '../../common/types/auth-user';
import { AdvanceDto, ChangeSalaryDto, ChangeStatusDto, CreateEmployeeDto, EmployeeQueryDto, UpdateEmployeeDto } from './dto/employee.dto';
import { EmployeesService } from './employees.service';

@ApiTags('Employees')
@ApiCookieAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions('employees', 'VIEW')
  list(@Query() q: EmployeeQueryDto) {
    return this.employees.list(q);
  }

  @Get('summary')
  @RequirePermissions('employees', 'VIEW')
  summary() {
    return this.employees.summary();
  }

  @Get('options')
  @RequirePermissions('employees', 'VIEW')
  @ApiOperation({ summary: 'Current employees for pickers' })
  options() {
    return this.employees.options();
  }

  @Get(':id')
  @RequirePermissions('employees', 'VIEW')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.get(id);
  }

  @Post()
  @RequirePermissions('employees', 'CREATE')
  create(@Body() dto: CreateEmployeeDto, @ReqContext() ctx: RequestContext) {
    return this.employees.create(dto, ctx);
  }

  @Patch(':id')
  @RequirePermissions('employees', 'EDIT')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto, @ReqContext() ctx: RequestContext) {
    return this.employees.update(id, dto, ctx);
  }

  @Post(':id/status')
  @RequirePermissions('employees', 'EDIT')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeStatusDto, @ReqContext() ctx: RequestContext) {
    return this.employees.changeStatus(id, dto, ctx);
  }

  @Post(':id/salary')
  @RequirePermissions('payroll', 'EDIT')
  @ApiOperation({ summary: 'Change salary from a date (keeps salary history)' })
  salary(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeSalaryDto, @ReqContext() ctx: RequestContext) {
    return this.employees.changeSalary(id, dto, ctx);
  }

  @Delete(':id')
  @RequirePermissions('employees', 'DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.employees.remove(id, ctx);
  }

  @Post(':id/advances')
  @RequirePermissions('payroll', 'CREATE')
  @ApiOperation({ summary: 'Give a salary advance (recovered from coming salaries)' })
  advance(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdvanceDto, @ReqContext() ctx: RequestContext) {
    return this.employees.giveAdvance(id, dto, ctx);
  }
}

@ApiTags('Employees')
@ApiCookieAuth()
@Controller('advances')
export class AdvancesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions('payroll', 'VIEW')
  list(@Query('status') status?: string) {
    return this.employees.advances(status);
  }

  @Post(':id/write-off')
  @RequirePermissions('payroll', 'APPROVE')
  writeOff(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.employees.writeOffAdvance(id, ctx);
  }
}
