import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PAYMENT_METHODS } from '@az/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { MONEY_RE } from '../../garments/dto/garment.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value);
const METHOD_KEYS = PAYMENT_METHODS.map((m) => m.key);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class SupplierFieldsDto {
  @ApiPropertyOptional({ example: '0300-1234567' }) @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(20)
  contactNumber?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(20)
  whatsapp?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(300)
  address?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(80)
  city?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000)
  notes?: string | null;
}

export class CreateSupplierDto extends SupplierFieldsDto {
  @ApiProperty({ example: 'Gul Ahmed Textiles' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: '25000.00', description: 'Amount the shop already owes this supplier at go-live' }) @IsOptional()
  @Matches(MONEY_RE, { message: 'Opening balance must be an amount like 25000 or 25000.50' })
  openingBalance?: string;
}

export class UpdateSupplierDto extends SupplierFieldsDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] }) @IsOptional() @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class SupplierQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'ALL'] }) @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'ALL'])
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';

  @ApiPropertyOptional({ description: 'Only suppliers we still owe money' }) @IsOptional() @IsIn(['true', 'false'])
  payable?: 'true' | 'false';
}

export class SupplierPaymentDto {
  @ApiProperty({ example: '10000.00' }) @Matches(MONEY_RE, { message: 'Amount must be an amount like 10000 or 10000.50' })
  amount: string;

  @ApiProperty({ enum: METHOD_KEYS }) @IsIn(METHOD_KEYS)
  method: (typeof METHOD_KEYS)[number];

  @ApiPropertyOptional({ description: 'Pay against one purchase. Default: oldest unpaid purchases first.' }) @IsOptional() @IsUUID()
  purchaseId?: string;

  @ApiPropertyOptional({ example: '2026-11-27' }) @IsOptional() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' })
  paymentDate?: string;

  @ApiPropertyOptional({ description: 'Cheque number, transaction id ...' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  notes?: string;

  @ApiProperty({ description: 'Client-generated key: the same payment sent twice is saved once' }) @IsString() @MinLength(8) @MaxLength(120)
  idempotencyKey: string;
}
