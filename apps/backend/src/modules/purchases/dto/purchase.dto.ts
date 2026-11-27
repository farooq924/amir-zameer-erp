import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { PAYMENT_METHODS } from '@az/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { MONEY_RE, QTY_RE } from '../../garments/dto/garment.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const METHOD_KEYS = PAYMENT_METHODS.map((m) => m.key);
const money = (label: string) => Matches(MONEY_RE, { message: `${label} must be an amount like 1500 or 1500.50` });
const quantity = (label: string) => Matches(QTY_RE, { message: `${label} must be a number with up to 3 decimals` });

export class PurchaseLineDto {
  @ApiProperty() @IsUUID()
  fabricId: string;

  @ApiProperty({ example: '50.000' }) @quantity('Quantity')
  quantity: string;

  @ApiProperty({ example: '850.00', description: 'Price per unit' }) @money('Rate')
  rate: string;
}

export class PurchasePaymentDto {
  @ApiProperty({ example: '20000.00' }) @money('Paid amount')
  amount: string;

  @ApiProperty({ enum: METHOD_KEYS }) @IsIn(METHOD_KEYS)
  method: (typeof METHOD_KEYS)[number];

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  reference?: string;
}

export class CreatePurchaseDto {
  @ApiPropertyOptional({ description: 'Client-generated UUID: a repeated request never creates a second purchase' }) @IsOptional() @IsUUID()
  id?: string;

  @ApiProperty() @IsUUID()
  supplierId: string;

  @ApiPropertyOptional({ example: 'INV-4471', description: "Supplier's bill number" }) @IsOptional() @Transform(trim) @IsString() @MaxLength(60)
  supplierInvoiceNo?: string;

  @ApiPropertyOptional({ example: '2026-11-27' }) @IsOptional() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' })
  purchaseDate?: string;

  @ApiProperty({ type: [PurchaseLineDto] }) @IsArray() @ArrayMinSize(1, { message: 'Add at least one fabric' }) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => PurchaseLineDto)
  items: PurchaseLineDto[];

  @ApiPropertyOptional({ example: '0.00' }) @IsOptional() @money('Discount')
  discount?: string;

  @ApiPropertyOptional({ example: '500.00', description: 'Freight, loading ...' }) @IsOptional() @money('Other charges')
  otherCharges?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ type: PurchasePaymentDto, description: 'Amount paid to the supplier now' }) @IsOptional()
  @ValidateNested() @Type(() => PurchasePaymentDto)
  payment?: PurchasePaymentDto;
}

export class PurchaseReturnLineDto {
  @ApiProperty() @IsUUID()
  fabricId: string;

  @ApiProperty({ example: '5.000' }) @quantity('Quantity')
  quantity: string;
}

export class CreatePurchaseReturnDto {
  @ApiPropertyOptional({ description: 'Client-generated UUID: a repeated request never creates a second return' }) @IsOptional() @IsUUID()
  id?: string;

  @ApiProperty({ type: [PurchaseReturnLineDto] }) @IsArray() @ArrayMinSize(1, { message: 'Enter the quantity to return' }) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => PurchaseReturnLineDto)
  items: PurchaseReturnLineDto[];

  @ApiProperty({ example: 'Colour does not match the sample' }) @Transform(trim) @IsString() @MinLength(3) @MaxLength(500)
  reason: string;
}

export class PurchaseQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  fabricId?: string;

  @ApiPropertyOptional({ enum: ['unpaid', 'paid', 'all'] }) @IsOptional() @IsIn(['unpaid', 'paid', 'all'])
  payment?: 'unpaid' | 'paid' | 'all';

  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' })
  from?: string;

  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' })
  to?: string;
}
