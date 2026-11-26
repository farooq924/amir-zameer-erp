import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsEmail, IsIn, IsInt, IsNumberString, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export const CUSTOMER_TYPES = ['WALK_IN', 'REGULAR', 'VIP', 'CORPORATE'] as const;
export const CUSTOMER_STATUSES = ['ACTIVE', 'INACTIVE', 'BLOCKED'] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? null : typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value);

class CustomerFieldsDto {
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(30)
  whatsapp?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsEmail() @MaxLength(160)
  email?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(300)
  address?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(80)
  city?: string | null;

  @ApiPropertyOptional({ enum: CUSTOMER_TYPES }) @IsOptional() @IsIn(CUSTOMER_TYPES)
  customerType?: (typeof CUSTOMER_TYPES)[number];

  @ApiPropertyOptional({ example: '2026-11-26' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  registrationDate?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  whatsappOptIn?: boolean;
}

export class CreateCustomerDto extends CustomerFieldsDto {
  @ApiPropertyOptional({ description: 'Client-generated UUID (offline creation)' }) @IsOptional() @IsUUID()
  id?: string;

  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  @ApiProperty({ example: '0300-1234567' }) @Transform(trim) @IsString() @MinLength(7) @MaxLength(30)
  mobile: string;

  @ApiPropertyOptional({ description: 'Amount the customer already owes at go-live (PKR)', example: '0.00' })
  @IsOptional() @IsNumberString() @Matches(/^\d{1,12}(\.\d{1,2})?$/, { message: 'openingBalance must be a positive amount with up to 2 decimals' })
  openingBalance?: string;

  @ApiPropertyOptional({ description: 'Save even if a customer with the same mobile exists' }) @IsOptional() @IsBoolean()
  allowDuplicate?: boolean;

  @ApiPropertyOptional({ enum: CUSTOMER_STATUSES }) @IsOptional() @IsIn(CUSTOMER_STATUSES)
  status?: (typeof CUSTOMER_STATUSES)[number];
}

export class UpdateCustomerDto extends CustomerFieldsDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(7) @MaxLength(30)
  mobile?: string;

  @ApiProperty({ description: 'Version you edited; prevents silently overwriting someone else\'s change' })
  @Type(() => Number) @IsInt() @Min(1)
  version: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  allowDuplicate?: boolean;
}

export class SetCustomerStatusDto {
  @ApiProperty({ enum: CUSTOMER_STATUSES }) @IsIn(CUSTOMER_STATUSES)
  status: (typeof CUSTOMER_STATUSES)[number];
}

export class CustomerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CUSTOMER_STATUSES }) @IsOptional() @IsIn(CUSTOMER_STATUSES)
  status?: (typeof CUSTOMER_STATUSES)[number];

  @ApiPropertyOptional({ enum: CUSTOMER_TYPES }) @IsOptional() @IsIn(CUSTOMER_TYPES)
  customerType?: (typeof CUSTOMER_TYPES)[number];

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ enum: ['name', 'code', 'createdAt', 'registrationDate'] }) @IsOptional() @IsIn(['name', 'code', 'createdAt', 'registrationDate'])
  sortBy?: 'name' | 'code' | 'createdAt' | 'registrationDate';
}

export class DuplicateQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) mobile?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) whatsapp?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() excludeId?: string;
}

export class CreateNoteDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000)
  note: string;
}
