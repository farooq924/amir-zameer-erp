import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { resolveDateRange } from '../../common/utils/date-range';
import { DateRangeQueryDto } from '../audit-logs/dto/audit-query.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiCookieAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  private range(q: DateRangeQueryDto) {
    try {
      return resolveDateRange(q.preset ?? 'today', q.from, q.to);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('summary')
  @RequirePermissions('dashboard', 'VIEW')
  summary(@Query() q: DateRangeQueryDto) {
    return this.dashboard.summary(this.range(q));
  }

  @Get('charts')
  @RequirePermissions('dashboard', 'VIEW')
  charts(@Query() q: DateRangeQueryDto) {
    return this.dashboard.charts(this.range(q));
  }
}
