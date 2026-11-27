import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PAYMENT_METHODS, PERIOD_RE } from '@az/shared';
import { MONEY_RE } from '../../garments/dto/garment.dto';
import { DATE_RE } from '../../employees/dto/employee.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const METHOD_KEYS = PAYMENT_METHODS.map((m) => m.key);

export class CreatePayrollDto {
  @ApiProperty({ example: '2026-11' }) @Matches(PERIOD_RE, { message: 'Month must be like 2026-11' })
  periodKey: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  notes?: string;
}

export class UpdatePayrollItemDto {
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY_RE, { message: 'Incentive must be an amount' }) incentives?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY_RE, { message: 'Bonus must be an amount' }) bonus?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY_RE, { message: 'Other deduction must be an amount' }) otherDeductions?: string;
  @ApiPropertyOptional({ description: 'Advance to recover this month (cannot be more than the open balance)' }) @IsOptional()
  @Matches(MONEY_RE, { message: 'Advance deduction must be an amount' }) advanceDeduction?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;
}

export class SalaryPaymentDto {
  @ApiProperty({ example: '25000' }) @Matches(MONEY_RE, { message: 'Amount must be an amount like 25000' })
  amount: string;

  @ApiProperty({ enum: METHOD_KEYS }) @IsIn(METHOD_KEYS)
  method: (typeof METHOD_KEYS)[number];

  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' }) paymentDate?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) reference?: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(100) idempotencyKey: string;
}

export class PayAllDto {
  @ApiProperty({ enum: METHOD_KEYS }) @IsIn(METHOD_KEYS)
  method: (typeof METHOD_KEYS)[number];

  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' }) paymentDate?: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(60) idempotencyKey: string;
}
