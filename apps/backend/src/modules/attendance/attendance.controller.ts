import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestContext } from '../../common/types/auth-user';
import { AttendanceService } from './attendance.service';
import { LeaveDto, ListQueryDto, MonthQueryDto, OvertimeDto, SaveAttendanceDto } from './dto/attendance.dto';
import { DateQueryDto } from './dto/date-query.dto';

@ApiTags('Attendance')
@ApiCookieAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('daily')
  @RequirePermissions('attendance', 'VIEW')
  @ApiOperation({ summary: 'Attendance sheet for one date (all employees working that day)' })
  daily(@Query() q: DateQueryDto) {
    return this.attendance.daily(q.date);
  }

  @Put('daily')
  @RequirePermissions('attendance', 'EDIT')
  save(@Body() dto: SaveAttendanceDto, @ReqContext() ctx: RequestContext) {
    return this.attendance.save(dto, ctx);
  }

  @Get('monthly')
  @RequirePermissions('attendance', 'VIEW')
  monthly(@Query() q: MonthQueryDto) {
    return this.attendance.monthly(q.month);
  }

  @Get('leaves')
  @RequirePermissions('attendance', 'VIEW')
  leaves(@Query() q: ListQueryDto) {
    return this.attendance.leaves(q);
  }

  @Post('leaves')
  @RequirePermissions('attendance', 'CREATE')
  createLeave(@Body() dto: LeaveDto, @ReqContext() ctx: RequestContext) {
    return this.attendance.createLeave(dto, ctx);
  }

  @Post('leaves/:id/approve')
  @RequirePermissions('attendance', 'APPROVE')
  approveLeave(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.attendance.decideLeave(id, true, ctx);
  }

  @Post('leaves/:id/reject')
  @RequirePermissions('attendance', 'APPROVE')
  rejectLeave(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.attendance.decideLeave(id, false, ctx);
  }

  @Get('overtime')
  @RequirePermissions('attendance', 'VIEW')
  overtime(@Query() q: ListQueryDto) {
    return this.attendance.overtime(q);
  }

  @Post('overtime')
  @RequirePermissions('attendance', 'CREATE')
  createOvertime(@Body() dto: OvertimeDto, @ReqContext() ctx: RequestContext) {
    return this.attendance.createOvertime(dto, ctx);
  }

  @Post('overtime/:id/approve')
  @RequirePermissions('attendance', 'APPROVE')
  approveOvertime(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.attendance.decideOvertime(id, true, ctx);
  }

  @Post('overtime/:id/reject')
  @RequirePermissions('attendance', 'APPROVE')
  rejectOvertime(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.attendance.decideOvertime(id, false, ctx);
  }
}
