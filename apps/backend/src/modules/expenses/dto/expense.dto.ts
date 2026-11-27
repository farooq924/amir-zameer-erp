import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EXPENSE_STATUSES, PAYMENT_METHODS, RECURRENCE_FREQUENCIES } from '@az/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { MONEY_RE } from '../../garments/dto/garment.dto';
import { DATE_RE } from '../../accounting/dto/accounting.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const METHOD_KEYS = PAYMENT_METHODS.map((m) => m.key);
const FREQ_KEYS = RECURRENCE_FREQUENCIES.map((f) => f.key);

export class ExpenseQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: [...EXPENSE_STATUSES.map((s) => s.key), 'ALL'] }) @IsOptional() @IsIn([...EXPENSE_STATUSES.map((s) => s.key), 'ALL']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE) to?: string;
}

export class CreateExpenseDto {
  @ApiPropertyOptional({ example: '2026-11-27' }) @IsOptional() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' }) expenseDate?: string;
  @ApiProperty() @IsUUID('all', { message: 'Choose a category' }) categoryId: string;
  @ApiProperty({ example: 'K-Electric bill for November' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(300) description: string;
  @ApiProperty({ example: '18500' }) @Matches(MONEY_RE, { message: 'Amount must be an amount like 18500' }) amount: string;
  @ApiProperty({ enum: METHOD_KEYS }) @IsIn(METHOD_KEYS, { message: 'Choose how it was paid' }) paymentMethod: (typeof METHOD_KEYS)[number];
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(120) paidTo?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) reference?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) notes?: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(100) idempotencyKey: string;
}

export class UpdateExpenseDto {
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' }) expenseDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(300) description?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY_RE, { message: 'Amount must be an amount like 18500' }) amount?: string;
  @ApiPropertyOptional({ enum: METHOD_KEYS }) @IsOptional() @IsIn(METHOD_KEYS) paymentMethod?: (typeof METHOD_KEYS)[number];
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(120) paidTo?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) reference?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) notes?: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) version: number;
}

export class ExpenseReasonDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(3) @MaxLength(300) reason: string;
}

export class ExpenseCategoryDto {
  @ApiProperty({ example: 'Security Guard' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) name: string;
  @ApiPropertyOptional({ description: 'Expense account in the chart of accounts' }) @IsOptional() @IsUUID() accountId?: string;
}

export class UpdateExpenseCategoryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() accountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class RecurringExpenseDto {
  @ApiProperty() @IsUUID('all', { message: 'Choose a category' }) categoryId: string;
  @ApiProperty({ example: 'Shop rent' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(300) description: string;
  @ApiProperty({ example: '85000' }) @Matches(MONEY_RE, { message: 'Amount must be an amount like 85000' }) amount: string;
  @ApiProperty({ enum: METHOD_KEYS }) @IsIn(METHOD_KEYS) paymentMethod: (typeof METHOD_KEYS)[number];
  @ApiProperty({ enum: FREQ_KEYS }) @IsIn(FREQ_KEYS, { message: 'Choose how often' }) frequency: (typeof FREQ_KEYS)[number];
  @ApiProperty({ example: '2026-12-01', description: 'Date of the next expense' }) @Matches(DATE_RE, { message: 'Next date must be like 2026-12-01' }) nextRunDate: string;
}

export class UpdateRecurringExpenseDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(300) description?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY_RE) amount?: string;
  @ApiPropertyOptional({ enum: METHOD_KEYS }) @IsOptional() @IsIn(METHOD_KEYS) paymentMethod?: (typeof METHOD_KEYS)[number];
  @ApiPropertyOptional({ enum: FREQ_KEYS }) @IsOptional() @IsIn(FREQ_KEYS) frequency?: (typeof FREQ_KEYS)[number];
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE) nextRunDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SummaryQueryDto {
  @ApiPropertyOptional({ example: '2026-11' }) @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24) months?: number;
}
