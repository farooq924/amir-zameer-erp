import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested,
} from 'class-validator';
import { ACCOUNT_SUBTYPES, JOURNAL_SOURCES, PERIOD_RE } from '@az/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { MONEY_RE } from '../../garments/dto/garment.dto';

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const SUBTYPE_KEYS = ACCOUNT_SUBTYPES.map((s) => s.key);

export class DateRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-11-01' }) @IsOptional() @Matches(DATE_RE, { message: 'From must be a date like 2026-11-01' }) from?: string;
  @ApiPropertyOptional({ example: '2026-11-30' }) @IsOptional() @Matches(DATE_RE, { message: 'To must be a date like 2026-11-30' }) to?: string;
}

export class AsOfQueryDto {
  @ApiPropertyOptional({ example: '2026-11-30' }) @IsOptional() @Matches(DATE_RE, { message: 'Date must be like 2026-11-30' }) asOf?: string;
}

export class LedgerQueryDto extends DateRangeQueryDto {}

export class JournalQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE) to?: string;
  @ApiPropertyOptional({ enum: JOURNAL_SOURCES.map((s) => s.key) }) @IsOptional() @IsIn(JOURNAL_SOURCES.map((s) => s.key)) sourceType?: string;
}

export class AccountDto {
  @ApiProperty({ example: '5340' }) @Matches(/^\d{3,6}$/, { message: 'Code must be 3 to 6 digits, e.g. 5340' }) code: string;
  @ApiProperty({ example: 'Security Guard' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name: string;
  @ApiProperty({ enum: SUBTYPE_KEYS }) @IsIn(SUBTYPE_KEYS, { message: 'Choose a valid group' }) subType: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(300) description?: string;
}

export class UpdateAccountDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(300) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class JournalLineDto {
  @ApiProperty() @IsUUID() accountId: string;
  @ApiPropertyOptional({ example: '5000' }) @IsOptional() @Matches(MONEY_RE, { message: 'Debit must be an amount' }) debit?: string;
  @ApiPropertyOptional({ example: '0' }) @IsOptional() @Matches(MONEY_RE, { message: 'Credit must be an amount' }) credit?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(300) description?: string;
}

export class ManualJournalDto {
  @ApiPropertyOptional({ example: '2026-11-27' }) @IsOptional() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' }) entryDate?: string;
  @ApiProperty({ example: 'Owner added cash to the shop' }) @Transform(trim) @IsString() @MinLength(3) @MaxLength(300) description: string;
  @ApiProperty({ type: [JournalLineDto] }) @IsArray() @ArrayMinSize(2) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => JournalLineDto)
  lines: JournalLineDto[];
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(100) idempotencyKey: string;
}

export class ReasonDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(3) @MaxLength(300) reason: string;
}

export class PeriodActionDto {
  @ApiProperty({ example: '2026-11' }) @Matches(PERIOD_RE, { message: 'Month must be like 2026-11' }) month: string;
  @ApiProperty({ enum: ['close', 'reopen', 'lock'] }) @IsIn(['close', 'reopen', 'lock']) action: 'close' | 'reopen' | 'lock';
}
