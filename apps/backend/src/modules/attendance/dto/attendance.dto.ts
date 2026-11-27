import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ATTENDANCE_STATUSES, LEAVE_TYPES, PERIOD_RE } from '@az/shared';
import { MONEY_RE } from '../../garments/dto/garment.dto';
import { DATE_RE } from '../../employees/dto/employee.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const STATUS_KEYS = ATTENDANCE_STATUSES.map((s) => s.key);
const LEAVE_KEYS = LEAVE_TYPES.map((s) => s.key);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class AttendanceEntryDto {
  @ApiProperty() @IsUUID()
  employeeId: string;

  @ApiPropertyOptional({ enum: [...STATUS_KEYS, 'NONE'], description: 'NONE removes the mark' }) @IsIn([...STATUS_KEYS, 'NONE'])
  status: (typeof STATUS_KEYS)[number] | 'NONE';

  @ApiPropertyOptional({ example: '09:15' }) @IsOptional() @Transform(({ value }) => (value === '' ? undefined : value)) @Matches(TIME_RE, { message: 'Time must be like 09:15' })
  checkIn?: string;

  @ApiPropertyOptional({ example: '19:00' }) @IsOptional() @Transform(({ value }) => (value === '' ? undefined : value)) @Matches(TIME_RE, { message: 'Time must be like 19:00' })
  checkOut?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(600)
  lateMinutes?: number;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  notes?: string;
}

export class SaveAttendanceDto {
  @ApiProperty({ example: '2026-11-27' }) @Matches(DATE_RE, { message: 'Date must be a date' })
  date: string;

  @ApiProperty({ type: [AttendanceEntryDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => AttendanceEntryDto)
  entries: AttendanceEntryDto[];
}

export class MonthQueryDto {
  @ApiPropertyOptional({ example: '2026-11' }) @IsOptional() @Matches(PERIOD_RE, { message: 'Month must be like 2026-11' })
  month?: string;
}

export class LeaveDto {
  @ApiProperty() @IsUUID()
  employeeId: string;

  @ApiProperty({ enum: LEAVE_KEYS }) @IsIn(LEAVE_KEYS)
  leaveType: (typeof LEAVE_KEYS)[number];

  @ApiProperty() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' }) fromDate: string;
  @ApiProperty() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' }) toDate: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  reason?: string;
}

export class OvertimeDto {
  @ApiProperty() @IsUUID()
  employeeId: string;

  @ApiProperty() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' })
  date: string;

  @ApiProperty({ example: '2.5' }) @Matches(/^\d{1,2}(\.\d{1,2})?$/, { message: 'Hours must be like 2 or 2.5' })
  hours: string;

  @ApiPropertyOptional({ description: 'Default: the employee overtime rate' }) @IsOptional() @Matches(MONEY_RE, { message: 'Rate must be an amount like 200' })
  ratePerHour?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  notes?: string;
}

export class ListQueryDto extends MonthQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] }) @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'ALL'])
  status?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  employeeId?: string;
}
