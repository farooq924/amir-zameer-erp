import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { CNIC_RE, EMPLOYEE_STATUSES, EMPLOYEE_TYPES, EMPLOYMENT_TYPES, PAYMENT_METHODS, SALARY_TYPES } from '@az/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { MONEY_RE } from '../../garments/dto/garment.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value);
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TYPE_KEYS = EMPLOYEE_TYPES.map((t) => t.key);
const EMPLOYMENT_KEYS = EMPLOYMENT_TYPES.map((t) => t.key);
const STATUS_KEYS = EMPLOYEE_STATUSES.map((t) => t.key);
const SALARY_KEYS = SALARY_TYPES.map((t) => t.key);
const METHOD_KEYS = PAYMENT_METHODS.map((m) => m.key);

export class SalaryDto {
  @ApiProperty({ enum: SALARY_KEYS }) @IsIn(SALARY_KEYS)
  salaryType: (typeof SALARY_KEYS)[number];

  @ApiPropertyOptional({ example: '30000' }) @IsOptional() @Matches(MONEY_RE, { message: 'Monthly salary must be an amount like 30000' })
  monthlySalary?: string;

  @ApiPropertyOptional({ example: '1500' }) @IsOptional() @Matches(MONEY_RE, { message: 'Daily wage must be an amount like 1500' })
  dailyWage?: string;

  @ApiPropertyOptional({ example: '600' }) @IsOptional() @Matches(MONEY_RE, { message: 'Per piece rate must be an amount like 600' })
  perPieceRate?: string;

  @ApiPropertyOptional({ example: '200' }) @IsOptional() @Matches(MONEY_RE, { message: 'Overtime rate must be an amount like 200' })
  overtimeRatePerHour?: string;
}

export class ChangeSalaryDto extends SalaryDto {
  @ApiProperty({ example: '2026-12-01' }) @Matches(DATE_RE, { message: 'Effective date must be a date' })
  effectiveFrom: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  reason?: string;
}

class EmployeeFieldsDto {
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(120)
  fatherName?: string | null;

  @ApiPropertyOptional({ example: '0300-1234567' }) @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(20)
  contactNumber?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(300)
  address?: string | null;

  @ApiPropertyOptional({ example: '35202-1234567-1' }) @IsOptional() @Transform(emptyToNull)
  @Matches(CNIC_RE, { message: 'CNIC must look like 35202-1234567-1' })
  cnic?: string | null;

  @ApiPropertyOptional({ example: 'Senior tailor' }) @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(80)
  designation?: string | null;

  @ApiPropertyOptional({ enum: EMPLOYMENT_KEYS }) @IsOptional() @IsIn(EMPLOYMENT_KEYS)
  employmentType?: (typeof EMPLOYMENT_KEYS)[number];

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(80)
  bankName?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(120)
  bankAccountTitle?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(40)
  bankAccountNumber?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000)
  notes?: string | null;
}

export class CreateEmployeeDto extends EmployeeFieldsDto {
  @ApiProperty({ example: 'Muhammad Aslam' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  @ApiProperty({ enum: TYPE_KEYS }) @IsIn(TYPE_KEYS)
  employeeType: (typeof TYPE_KEYS)[number];

  @ApiProperty({ example: '2026-11-01' }) @Matches(DATE_RE, { message: 'Joining date must be a date' })
  joiningDate: string;

  @ApiProperty({ type: SalaryDto }) @ValidateNested() @Type(() => SalaryDto)
  salary: SalaryDto;
}

export class UpdateEmployeeDto extends EmployeeFieldsDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: TYPE_KEYS }) @IsOptional() @IsIn(TYPE_KEYS)
  employeeType?: (typeof TYPE_KEYS)[number];

  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE, { message: 'Joining date must be a date' })
  joiningDate?: string;

  @ApiPropertyOptional({ description: 'Optimistic lock: the version you loaded' }) @IsOptional() @IsInt()
  version?: number;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: STATUS_KEYS }) @IsIn(STATUS_KEYS)
  status: (typeof STATUS_KEYS)[number];

  @ApiPropertyOptional({ description: 'Leaving date when the employee leaves the job' }) @IsOptional() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' })
  date?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  notes?: string;
}

export class EmployeeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: [...STATUS_KEYS, 'ALL', 'CURRENT'] }) @IsOptional() @IsIn([...STATUS_KEYS, 'ALL', 'CURRENT'])
  status?: string;

  @ApiPropertyOptional({ enum: TYPE_KEYS }) @IsOptional() @IsIn(TYPE_KEYS)
  type?: string;
}

export class AdvanceDto {
  @ApiProperty({ example: '5000' }) @Matches(MONEY_RE, { message: 'Amount must be an amount like 5000' })
  amount: string;

  @ApiPropertyOptional({ example: '1000', description: 'Recovered from each salary. 0 = recover the full balance from the next salary.' })
  @IsOptional() @Matches(MONEY_RE, { message: 'Instalment must be an amount like 1000' })
  installmentAmount?: string;

  @ApiPropertyOptional({ enum: METHOD_KEYS }) @IsOptional() @IsIn(METHOD_KEYS)
  paymentMethod?: (typeof METHOD_KEYS)[number];

  @ApiPropertyOptional({ example: '2026-11-27' }) @IsOptional() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' })
  advanceDate?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  reason?: string;

  @ApiProperty() @IsString() @MinLength(8) @MaxLength(120)
  idempotencyKey: string;
}
