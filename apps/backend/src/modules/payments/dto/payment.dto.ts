import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PAYMENT_METHODS } from '@az/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { MONEY_RE } from '../../garments/dto/garment.dto';
import { DATE_RE } from '../../accounting/dto/accounting.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const METHOD_KEYS = PAYMENT_METHODS.map((m) => m.key);

export class PaymentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE) to?: string;
  @ApiPropertyOptional({ enum: METHOD_KEYS }) @IsOptional() @IsIn(METHOD_KEYS) method?: string;
  @ApiPropertyOptional({ enum: ['RECEIPT', 'REFUND', 'ALL'] }) @IsOptional() @IsIn(['RECEIPT', 'REFUND', 'ALL']) kind?: string;
  @ApiPropertyOptional({ enum: ['POSTED', 'REVERSED', 'ALL'] }) @IsOptional() @IsIn(['POSTED', 'REVERSED', 'ALL']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() customerId?: string;
}

export class OutgoingQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE) to?: string;
}

export class ReversePaymentDto {
  @ApiProperty({ example: 'Entered twice by mistake' }) @Transform(trim) @IsString() @MinLength(3) @MaxLength(300) reason: string;
}

export class RefundDto {
  @ApiProperty() @IsUUID('all', { message: 'Choose the order to refund' }) orderId: string;
  @ApiProperty({ example: '1500' }) @Matches(MONEY_RE, { message: 'Amount must be an amount like 1500' }) amount: string;
  @ApiProperty({ enum: METHOD_KEYS }) @IsIn(METHOD_KEYS, { message: 'Choose how the money was returned' }) method: (typeof METHOD_KEYS)[number];
  @ApiProperty({ example: 'Order cancelled by customer' }) @Transform(trim) @IsString() @MinLength(3) @MaxLength(300) reason: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) reference?: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(100) idempotencyKey: string;
}
