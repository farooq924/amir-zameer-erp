import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PERIOD_RE, TASK_TYPES } from '@az/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { MONEY_RE } from '../../garments/dto/garment.dto';
import { DATE_RE } from '../../employees/dto/employee.dto';

const TASK_KEYS = TASK_TYPES.map((t) => t.key);

export class ProductionDto {
  @ApiProperty() @IsUUID()
  employeeId: string;

  @ApiProperty() @IsUUID()
  orderItemId: string;

  @ApiProperty({ enum: TASK_KEYS }) @IsIn(TASK_KEYS)
  taskType: (typeof TASK_KEYS)[number];

  @ApiProperty({ example: 2 }) @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  quantity: number;

  @ApiPropertyOptional({ description: 'Default: garment piece rate, else the employee per piece rate' }) @IsOptional()
  @Matches(MONEY_RE, { message: 'Rate must be an amount like 600' })
  pieceRate?: string;

  @ApiPropertyOptional({ example: '2026-11-27' }) @IsOptional() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' })
  workDate?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @MaxLength(300)
  notes?: string;
}

export class ProductionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ example: '2026-11' }) @IsOptional() @Matches(PERIOD_RE, { message: 'Month must be like 2026-11' })
  month?: string;

  @ApiPropertyOptional({ enum: ['PAID', 'UNPAID', 'ALL'] }) @IsOptional() @IsIn(['PAID', 'UNPAID', 'ALL'])
  paid?: string;
}

export class OrderItemLookupDto {
  @ApiProperty({ description: 'Order number or customer name / mobile' }) @IsString() @MinLength(2) @MaxLength(60)
  search: string;
}
