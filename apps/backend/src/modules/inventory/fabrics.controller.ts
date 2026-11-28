import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestContext } from '../../common/types/auth-user';
import {
  AdjustStockDto, CategoryDto, CreateFabricDto, FabricPickerQueryDto, FabricQueryDto, MovementQueryDto, UpdateCategoryDto, UpdateFabricDto,
} from './dto/inventory.dto';
import { FabricsService } from './fabrics.service';

@ApiTags('Fabric Inventory')
@ApiCookieAuth()
@Controller('inventory')
export class FabricsController {
  constructor(private readonly fabrics: FabricsService) {}

  @Get('summary')
  @RequirePermissions('inventory', 'VIEW')
  @ApiOperation({ summary: 'Stock value, low stock and out of stock counts' })
  summary() {
    return this.fabrics.summary();
  }

  @Get('fabrics')
  @RequirePermissions('inventory', 'VIEW')
  @ApiOperation({ summary: 'Fabrics with stock; filter by category, supplier and stock level' })
  list(@Query() q: FabricQueryDto) {
    return this.fabrics.list(q);
  }

  @Get('fabric-options')
  @RequirePermissions('inventory', 'VIEW')
  picker(@Query() q: FabricPickerQueryDto) {
    return this.fabrics.picker(q);
  }

  @Get('fabrics/:id')
  @RequirePermissions('inventory', 'VIEW')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.fabrics.get(id);
  }

  @Post('fabrics')
  @RequirePermissions('inventory', 'CREATE')
  create(@Body() dto: CreateFabricDto, @ReqContext() ctx: RequestContext) {
    return this.fabrics.create(dto, ctx);
  }

  @Delete('fabrics/:id')
  @RequirePermissions('inventory', 'DELETE')
  @ApiOperation({ summary: 'Delete a fabric that has no stock and no history (otherwise mark it inactive)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.fabrics.remove(id, ctx);
  }

  @Patch('fabrics/:id')
  @RequirePermissions('inventory', 'EDIT')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFabricDto, @ReqContext() ctx: RequestContext) {
    return this.fabrics.update(id, dto, ctx);
  }

  @Post('fabrics/:id/adjust')
  @RequirePermissions('inventory', 'APPROVE')
  @ApiOperation({ summary: 'Add or remove stock with a reason (needs approve permission)' })
  adjust(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustStockDto, @ReqContext() ctx: RequestContext) {
    return this.fabrics.adjust(id, dto, ctx);
  }

  @Get('movements')
  @RequirePermissions('inventory', 'VIEW')
  @ApiOperation({ summary: 'Stock ledger: every stock change, newest first' })
  movements(@Query() q: MovementQueryDto) {
    return this.fabrics.movements(q);
  }

  @Get('categories')
  @RequirePermissions('inventory', 'VIEW')
  categories() {
    return this.fabrics.categories();
  }

  @Post('categories')
  @RequirePermissions('inventory', 'CREATE')
  createCategory(@Body() dto: CategoryDto, @ReqContext() ctx: RequestContext) {
    return this.fabrics.createCategory(dto, ctx);
  }

  @Patch('categories/:id')
  @RequirePermissions('inventory', 'EDIT')
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto, @ReqContext() ctx: RequestContext) {
    return this.fabrics.updateCategory(id, dto, ctx);
  }
}
