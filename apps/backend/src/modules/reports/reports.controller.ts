import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import { CustomerOptionsQueryDto, ExportQueryDto, ReportQueryDto, SaveFilterDto, SavedFilterQueryDto } from './dto/report-query.dto';
import { pickColumns, toCsv, toPdf, toXlsx } from './exporters';
import { ReportsService } from './reports.service';

const MIME = { csv: 'text/csv; charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' } as const;

@ApiTags('Reports')
@ApiCookieAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @RequirePermissions('reports', 'VIEW')
  @ApiOperation({ summary: 'The 30 reports, with "allowed" for the signed-in user' })
  catalog(@CurrentUser() user: AuthUser) {
    return this.reports.catalog(user);
  }

  @Get('options')
  @RequirePermissions('reports', 'VIEW')
  options(@CurrentUser() user: AuthUser) {
    return this.reports.options(user);
  }

  @Get('options/customers')
  @RequirePermissions('reports', 'VIEW')
  customers(@Query() q: CustomerOptionsQueryDto) {
    return this.reports.customerOptions(q.q ?? '', q.id);
  }

  @Get('saved-filters')
  @RequirePermissions('reports', 'VIEW')
  saved(@CurrentUser() user: AuthUser, @Query() q: SavedFilterQueryDto) {
    return this.reports.savedFilters(user.id, q.reportKey);
  }

  @Post('saved-filters')
  @RequirePermissions('reports', 'VIEW')
  save(@CurrentUser() user: AuthUser, @Body() dto: SaveFilterDto) {
    return this.reports.saveFilter(user, dto);
  }

  @Delete('saved-filters/:id')
  @RequirePermissions('reports', 'VIEW')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.deleteFilter(user.id, id);
  }

  @Get(':key')
  @RequirePermissions('reports', 'VIEW')
  @ApiOperation({ summary: 'Run a report (filters, search, sort, page)' })
  run(@Param('key') key: string, @Query() q: ReportQueryDto, @CurrentUser() user: AuthUser) {
    return this.reports.run(key, q, user);
  }

  @Get(':key/all')
  @RequirePermissions('reports', 'PRINT')
  @ApiOperation({ summary: 'Every row of a report, for printing' })
  all(@Param('key') key: string, @Query() q: ReportQueryDto, @CurrentUser() user: AuthUser) {
    return this.reports.run(key, q, user, { all: true });
  }

  @Get(':key/export')
  @RequirePermissions('reports', 'EXPORT')
  @ApiOperation({ summary: 'Download a report as Excel, CSV or PDF' })
  async export(@Param('key') key: string, @Query() q: ExportQueryDto, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext, @Res() res: Response) {
    const r = await this.reports.run(key, q, user, { all: true });
    const cols = pickColumns(r, q.columns);
    const biz = await this.reports.business();
    const body = q.format === 'csv' ? toCsv(r, cols) : q.format === 'xlsx' ? await toXlsx(r, cols, biz) : await toPdf(r, cols, biz);
    await this.reports.logExport(key, q.format, q, r.rows.length, ctx);
    const stamp = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
    res.setHeader('Content-Type', MIME[q.format]);
    res.setHeader('Content-Disposition', `attachment; filename="${key}-${stamp}.${q.format}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(body);
  }
}
