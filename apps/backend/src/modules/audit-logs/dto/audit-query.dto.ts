import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { DATE_RANGE_PRESETS, DateRangePreset } from '@az/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class DateRangeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DATE_RANGE_PRESETS.map((p) => p.key), default: 'this_month' })
  @IsOptional()
  @IsIn(DATE_RANGE_PRESETS.map((p) => p.key))
  preset?: DateRangePreset;

  @ApiPropertyOptional({ example: '2026-11-01' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}

export class AuditQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40)
  module?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60)
  action?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  userId?: string;
}
