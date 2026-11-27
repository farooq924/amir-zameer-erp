import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestContext } from '../../common/types/auth-user';
import {
  CompareQueryDto, CreateTemplateDto, HistoryQueryDto, RecentQueryDto, SaveMeasurementDto, TemplateQueryDto, UpdateTemplateDto,
} from './dto/measurement.dto';
import { MeasurementsService } from './measurements.service';
import { TemplatesService } from './templates.service';

@ApiTags('Measurements')
@ApiCookieAuth()
@Controller()
export class MeasurementsController {
  constructor(private readonly measurements: MeasurementsService, private readonly templates: TemplatesService) {}

  // ---- templates
  @Get('measurement-templates')
  @RequirePermissions('measurements', 'VIEW')
  listTemplates(@Query() q: TemplateQueryDto) {
    return this.templates.list(q.includeInactive);
  }

  @Get('measurement-templates/:id')
  @RequirePermissions('measurements', 'VIEW')
  getTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.get(id);
  }

  @Post('measurement-templates')
  @RequirePermissions('measurements', 'MANAGE_SETTINGS')
  createTemplate(@Body() dto: CreateTemplateDto, @ReqContext() ctx: RequestContext) {
    return this.templates.create(dto, ctx);
  }

  @Patch('measurement-templates/:id')
  @RequirePermissions('measurements', 'MANAGE_SETTINGS')
  updateTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto, @ReqContext() ctx: RequestContext) {
    return this.templates.update(id, dto, ctx);
  }

  // ---- customer measurements
  @Get('customers/:customerId/measurements')
  @RequirePermissions('measurements', 'VIEW')
  @ApiOperation({ summary: 'All measurement versions of a customer (newest first per template)' })
  history(@Param('customerId', ParseUUIDPipe) customerId: string, @Query() q: HistoryQueryDto) {
    return this.measurements.history(customerId, q.templateId);
  }

  @Post('customers/:customerId/measurements')
  @RequirePermissions('measurements', 'CREATE')
  @ApiOperation({ summary: 'Save a new measurement version (history is never overwritten)' })
  save(@Param('customerId', ParseUUIDPipe) customerId: string, @Body() dto: SaveMeasurementDto, @ReqContext() ctx: RequestContext) {
    return this.measurements.saveVersion(customerId, dto, ctx);
  }

  @Get('measurements')
  @RequirePermissions('measurements', 'VIEW')
  recent(@Query() q: RecentQueryDto) {
    return this.measurements.recent(q);
  }

  @Get('measurements/compare')
  @RequirePermissions('measurements', 'VIEW')
  compare(@Query() q: CompareQueryDto) {
    return this.measurements.compare(q.from, q.to);
  }

  @Get('measurements/:id')
  @RequirePermissions('measurements', 'VIEW')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.measurements.get(id);
  }
}
