import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength,
  ValidateNested,
} from 'class-validator';
import { FABRIC_SOURCES, ORDER_ADJUSTMENT_TYPES, ORDER_LIFECYCLES, ORDER_TYPES, PAYMENT_METHODS, PAYMENT_STATUSES, STAGE_COLORS } from '@az/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { MONEY_RE, QTY_RE } from '../../garments/dto/garment.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ORDER_TYPE_KEYS = ORDER_TYPES.map((t) => t.key);
const FABRIC_SOURCE_KEYS = FABRIC_SOURCES.map((f) => f.key);
const METHOD_KEYS = PAYMENT_METHODS.map((m) => m.key);
const ADJ_KEYS = ORDER_ADJUSTMENT_TYPES.map((a) => a.key);
const money = (label: string) => Matches(MONEY_RE, { message: `${label} must be an amount like 1500 or 1500.50` });

export class OrderItemDto {
  @ApiPropertyOptional({ description: 'Existing item id (when revising an order)' }) @IsOptional() @IsUUID()
  id?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  garmentTypeId?: string | null;

  @ApiProperty({ example: 'Shalwar Kameez' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(100)
  garmentName: string;

  @ApiProperty({ example: 2 }) @Type(() => Number) @IsInt() @Min(1) @Max(999)
  quantity: number;

  @ApiProperty({ example: '2500.00', description: 'Stitching price for ONE piece' }) @money('Stitching price')
  stitchingPrice: string;

  @ApiPropertyOptional({ enum: FABRIC_SOURCE_KEYS }) @IsOptional() @IsIn(FABRIC_SOURCE_KEYS)
  fabricSource?: (typeof FABRIC_SOURCE_KEYS)[number];

  @ApiPropertyOptional({ description: 'Fabric from stock (shop fabric). It is reserved until the garment is delivered.' })
  @IsOptional() @Transform(({ value }) => (value === '' ? null : value)) @IsUUID()
  fabricId?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  fabricDescription?: string;

  @ApiPropertyOptional({ example: '9.000', description: 'Total fabric for this line (meters)' })
  @IsOptional() @Matches(QTY_RE, { message: 'Fabric quantity must be a number with up to 3 decimals' })
  fabricQuantity?: string;

  @ApiPropertyOptional({ example: '1200.00', description: 'Fabric price per meter' }) @IsOptional() @money('Fabric rate')
  fabricRate?: string;

  @ApiPropertyOptional({ example: '300.00', description: 'Extra charges for this line (buttons, embroidery ...)' }) @IsOptional() @money('Extra charges')
  additionalCharges?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Measurement version to copy. Default: the latest one for this garment.' }) @IsOptional() @IsUUID()
  measurementId?: string;

  @ApiPropertyOptional({ description: 'When revising: copy the latest measurement again' }) @IsOptional() @IsBoolean()
  refreshMeasurement?: boolean;
}

export class PaymentInputDto {
  @ApiProperty({ example: '2000.00' }) @money('Amount')
  amount: string;

  @ApiProperty({ enum: METHOD_KEYS }) @IsIn(METHOD_KEYS)
  method: (typeof METHOD_KEYS)[number];

  @ApiPropertyOptional({ description: 'Transaction id, cheque number ...' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  notes?: string;
}

class OrderFieldsDto {
  @ApiPropertyOptional({ enum: ORDER_TYPE_KEYS }) @IsOptional() @IsIn(ORDER_TYPE_KEYS)
  orderType?: (typeof ORDER_TYPE_KEYS)[number];

  @ApiPropertyOptional({ example: '2026-11-27' }) @IsOptional() @Matches(DATE_RE)
  orderDate?: string;

  @ApiPropertyOptional({ example: '2026-12-04' }) @IsOptional() @Matches(DATE_RE)
  expectedDeliveryDate?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000)
  specialInstructions?: string;

  @ApiPropertyOptional({ example: '0.00', description: 'Order-level extra charges (e.g. urgent delivery)' }) @IsOptional() @money('Extra charges')
  additionalCharges?: string;

  @ApiPropertyOptional({ example: '0.00' }) @IsOptional() @money('Discount')
  discount?: string;

  @ApiProperty({ type: [OrderItemDto] }) @IsArray() @ArrayMinSize(1, { message: 'Add at least one garment' }) @ArrayMaxSize(50)
  @ValidateNested({ each: true }) @Type(() => OrderItemDto)
  items: OrderItemDto[];
}

export class CreateOrderDto extends OrderFieldsDto {
  @ApiPropertyOptional({ description: 'Client-generated UUID: a repeated request never creates a second order' }) @IsOptional() @IsUUID()
  id?: string;

  @ApiProperty() @IsUUID()
  customerId: string;

  @ApiPropertyOptional({ description: 'Order this one was copied from (duplicate / alteration)' }) @IsOptional() @IsUUID()
  duplicatedFromId?: string;

  @ApiPropertyOptional({ type: PaymentInputDto, description: 'Advance received at booking' }) @IsOptional()
  @ValidateNested() @Type(() => PaymentInputDto)
  advance?: PaymentInputDto;
}

export class UpdateOrderDto extends OrderFieldsDto {
  @ApiProperty({ description: 'Version you edited' }) @Type(() => Number) @IsInt() @Min(1)
  version: number;

  @ApiPropertyOptional({ description: 'Why the order was revised' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  revisionNote?: string;
}

export class OrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() stageId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() customerId?: string;

  @ApiPropertyOptional({ enum: [...ORDER_LIFECYCLES, 'ACTIVE'] }) @IsOptional() @IsIn([...ORDER_LIFECYCLES, 'ACTIVE'])
  lifecycle?: (typeof ORDER_LIFECYCLES)[number] | 'ACTIVE';

  @ApiPropertyOptional({ enum: PAYMENT_STATUSES }) @IsOptional() @IsIn(PAYMENT_STATUSES)
  paymentStatus?: (typeof PAYMENT_STATUSES)[number];

  @ApiPropertyOptional({ enum: ['overdue', 'today', 'tomorrow', 'week'] }) @IsOptional() @IsIn(['overdue', 'today', 'tomorrow', 'week'])
  due?: 'overdue' | 'today' | 'tomorrow' | 'week';

  @ApiPropertyOptional({ enum: ORDER_TYPE_KEYS }) @IsOptional() @IsIn(ORDER_TYPE_KEYS)
  orderType?: (typeof ORDER_TYPE_KEYS)[number];

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndefined) @Matches(DATE_RE) from?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndefined) @Matches(DATE_RE) to?: string;

  @ApiPropertyOptional({ enum: ['orderDate', 'expectedDeliveryDate', 'orderNumber', 'createdAt', 'balanceAmount'] })
  @IsOptional() @IsIn(['orderDate', 'expectedDeliveryDate', 'orderNumber', 'createdAt', 'balanceAmount'])
  sortBy?: 'orderDate' | 'expectedDeliveryDate' | 'orderNumber' | 'createdAt' | 'balanceAmount';
}

export class ChangeStageDto {
  @ApiProperty() @IsUUID()
  stageId: string;

  @ApiPropertyOptional({ description: 'Only these items; default all undelivered items' }) @IsOptional() @IsArray() @IsUUID('4', { each: true })
  itemIds?: string[];

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  notes?: string;
}

export class AssignDto {
  @ApiPropertyOptional({ description: 'Employee id, or null to remove the assignment' }) @IsOptional() @IsUUID()
  employeeId?: string | null;

  @ApiPropertyOptional({ description: 'Only these items; default the whole order' }) @IsOptional() @IsArray() @IsUUID('4', { each: true })
  itemIds?: string[];
}

export class DeliveryItemDto {
  @ApiProperty() @IsUUID() orderItemId: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(999) quantity: number;
}

export class DeliverDto {
  @ApiProperty({ type: [DeliveryItemDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => DeliveryItemDto)
  items: DeliveryItemDto[];

  @ApiPropertyOptional({ description: 'Who collected the garments' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  receivedBy?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ type: PaymentInputDto, description: 'Payment collected at delivery' }) @IsOptional()
  @ValidateNested() @Type(() => PaymentInputDto)
  payment?: PaymentInputDto;
}

export class RecordPaymentDto extends PaymentInputDto {
  @ApiProperty({ description: 'Client-generated unique key: the same key never records the payment twice' })
  @IsString() @MinLength(8) @MaxLength(120)
  idempotencyKey: string;
}

export class CancelOrderDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(3) @MaxLength(500)
  reason: string;
}

export class AdjustmentDto {
  @ApiProperty({ enum: ADJ_KEYS }) @IsIn(ADJ_KEYS)
  type: (typeof ADJ_KEYS)[number];

  @ApiProperty({ example: '500.00', description: 'Always positive; the type decides if the balance goes up or down' }) @money('Amount')
  amount: string;

  @ApiProperty() @Transform(trim) @IsString() @MinLength(3) @MaxLength(500)
  reason: string;
}

export class RefreshMeasurementDto {
  @ApiPropertyOptional({ description: 'Measurement version; default the latest one' }) @IsOptional() @IsUUID()
  measurementId?: string;
}

export class StageDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(60)
  name: string;

  @ApiPropertyOptional({ enum: STAGE_COLORS }) @IsOptional() @IsIn(STAGE_COLORS)
  color?: (typeof STAGE_COLORS)[number];
}

export class UpdateStageDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ enum: STAGE_COLORS }) @IsOptional() @IsIn(STAGE_COLORS)
  color?: (typeof STAGE_COLORS)[number];

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class ReorderStagesDto {
  @ApiProperty({ description: 'All non-final stage ids in the new order' }) @IsArray() @IsUUID('4', { each: true })
  stageIds: string[];
}
