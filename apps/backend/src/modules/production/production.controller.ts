import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestContext } from '../../common/types/auth-user';
import { OrderItemLookupDto, ProductionDto, ProductionQueryDto } from './dto/production.dto';
import { EmployeesService } from '../employees/employees.service';
import { ProductionService } from './production.service';

@ApiTags('Production')
@ApiCookieAuth()
@Controller('production')
export class ProductionController {
  constructor(private readonly production: ProductionService, private readonly employees: EmployeesService) {}

  @Get('employees')
  @RequirePermissions('production', 'VIEW')
  @ApiOperation({ summary: 'Current employees for the production pickers' })
  employeeOptions() {
    return this.employees.options();
  }

  @Get()
  @RequirePermissions('production', 'VIEW')
  list(@Query() q: ProductionQueryDto) {
    return this.production.list(q);
  }

  @Get('order-items')
  @RequirePermissions('production', 'VIEW')
  @ApiOperation({ summary: 'Find order garments to record work against' })
  lookup(@Query() q: OrderItemLookupDto) {
    return this.production.lookup(q.search);
  }

  @Post()
  @RequirePermissions('production', 'CREATE')
  @ApiOperation({ summary: 'Record completed pieces (per-piece wages)' })
  create(@Body() dto: ProductionDto, @ReqContext() ctx: RequestContext) {
    return this.production.create(dto, ctx);
  }

  @Delete(':id')
  @RequirePermissions('production', 'DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.production.remove(id, ctx);
  }
}
