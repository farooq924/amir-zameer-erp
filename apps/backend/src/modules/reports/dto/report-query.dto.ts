import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { REPORT_EXPORT_FORMATS, REPORT_KEYS } from '@az/shared';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const Opt = () => (target: object, key: string) => {
  IsOptional()(target, key);
  IsString()(target, key);
  MaxLength(100)(target, key);
};

/** Every query parameter a report understands (each report uses only its own filters). */
export class ReportQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) preset?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE, { message: 'From date must be like 2026-11-01' }) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE, { message: 'To date must be like 2026-11-30' }) to?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE, { message: 'As on date must be like 2026-11-30' }) asOf?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) sort?: string;
  @ApiPropertyOptional({ enum: ['asc', 'desc'] }) @IsOptional() @IsIn(['asc', 'desc']) dir?: 'asc' | 'desc';
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number;
  @ApiPropertyOptional({ description: 'Comma separated column keys for export / print' }) @IsOptional() @IsString() @MaxLength(1000) columns?: string;
  @Opt() customer?: string;
  @Opt() employee?: string;
  @Opt() supplier?: string;
  @Opt() garment?: string;
  @Opt() stage?: string;
  @Opt() paymentStatus?: string;
  @Opt() paymentMethod?: string;
  @Opt() expenseCategory?: string;
  @Opt() expenseStatus?: string;
  @Opt() fabricCategory?: string;
  @Opt() fabric?: string;
  @Opt() movementType?: string;
  @Opt() stockStatus?: string;
  @Opt() account?: string;
  @Opt() auditModule?: string;
  @Opt() user?: string;
}

export class ExportQueryDto extends ReportQueryDto {
  @ApiProperty({ enum: REPORT_EXPORT_FORMATS }) @IsIn(REPORT_EXPORT_FORMATS as unknown as string[]) format!: (typeof REPORT_EXPORT_FORMATS)[number];
}

export class CustomerOptionsQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(60) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) id?: string;
}

export class SavedFilterQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(REPORT_KEYS) reportKey?: string;
}

export class SaveFilterDto {
  @ApiProperty() @IsIn(REPORT_KEYS) reportKey!: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @ApiProperty({ type: Object }) @IsObject() params!: Record<string, string>;
}
