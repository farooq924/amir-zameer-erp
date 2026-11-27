import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { FABRIC_UNITS, MOVEMENT_TYPES } from '@az/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { MONEY_RE, QTY_RE } from '../../garments/dto/garment.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value);
const UNIT_KEYS = FABRIC_UNITS.map((u) => u.key);
const MOVEMENT_KEYS = MOVEMENT_TYPES.map((m) => m.key);
const money = (label: string) => Matches(MONEY_RE, { message: `${label} must be an amount like 1500 or 1500.50` });
const quantity = (label: string) => Matches(QTY_RE, { message: `${label} must be a number with up to 3 decimals` });

export class CategoryDto {
  @ApiProperty({ example: 'Wash & Wear' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(80)
  name: string;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(300)
  description?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(80)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(300)
  description?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

class FabricFieldsDto {
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(80)
  brand?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(60)
  color?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(80)
  design?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(80)
  quality?: string | null;

  @ApiPropertyOptional({ description: 'Usual supplier' }) @IsOptional() @Transform(emptyToNull) @IsUUID()
  supplierId?: string | null;

  @ApiPropertyOptional({ example: '850.00', description: 'Usual buying price per unit' }) @IsOptional() @money('Purchase price')
  purchasePrice?: string;

  @ApiPropertyOptional({ example: '1200.00', description: 'Selling price per unit' }) @IsOptional() @money('Sale price')
  salePrice?: string;

  @ApiPropertyOptional({ enum: UNIT_KEYS }) @IsOptional() @IsIn(UNIT_KEYS)
  unit?: (typeof UNIT_KEYS)[number];

  @ApiPropertyOptional({ example: '20.000', description: 'Alert when stock falls to this level' }) @IsOptional() @quantity('Minimum stock')
  minimumStock?: string;

  @ApiPropertyOptional({ example: 'Rack A-3' }) @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(80)
  location?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CreateFabricDto extends FabricFieldsDto {
  @ApiProperty({ example: 'Gul Ahmed Wash & Wear' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: '50.000', description: 'Stock in hand when the fabric is added' }) @IsOptional() @quantity('Opening stock')
  openingStock?: string;

  @ApiPropertyOptional({ example: '850.00', description: 'Cost per unit of the opening stock (default: purchase price)' }) @IsOptional() @money('Opening cost')
  openingCost?: string;
}

export class UpdateFabricDto extends FabricFieldsDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  name?: string;
}

export class FabricQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ enum: ['all', 'low', 'out', 'in'] }) @IsOptional() @IsIn(['all', 'low', 'out', 'in'])
  stock?: 'all' | 'low' | 'out' | 'in';

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'] }) @IsOptional() @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';

  @ApiPropertyOptional({ enum: ['name', 'code', 'currentStock', 'createdAt'] }) @IsOptional() @IsIn(['name', 'code', 'currentStock', 'createdAt'])
  sortBy?: 'name' | 'code' | 'currentStock' | 'createdAt';
}

export class AdjustStockDto {
  @ApiProperty({ enum: ['IN', 'OUT'] }) @IsIn(['IN', 'OUT'])
  direction: 'IN' | 'OUT';

  @ApiProperty({ example: '2.500' }) @quantity('Quantity')
  quantity: string;

  @ApiPropertyOptional({ example: '850.00', description: 'Cost per unit when adding stock (default: average cost)' }) @IsOptional() @money('Unit cost')
  unitCost?: string;

  @ApiProperty({ example: 'Physical count correction' }) @Transform(trim) @IsString() @MinLength(3) @MaxLength(300)
  reason: string;

  @ApiProperty({ description: 'Client-generated key: the same adjustment sent twice is saved once' }) @IsString() @MinLength(8) @MaxLength(120)
  idempotencyKey: string;
}

export class MovementQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MOVEMENT_KEYS }) @IsOptional() @IsIn(MOVEMENT_KEYS)
  type?: (typeof MOVEMENT_KEYS)[number];

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  fabricId?: string;

  @ApiPropertyOptional({ example: '2026-11-01' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}

export class FabricPickerQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Also return this fabric even if inactive (the one already on a document)' }) @IsOptional() @IsUUID()
  include?: string;

  @ApiPropertyOptional({ description: 'Comma separated fabric ids: return exactly these fabrics' }) @IsOptional()
  @Matches(/^[0-9a-f-]{36}(,[0-9a-f-]{36}){0,49}$/i, { message: 'ids must be fabric ids separated by commas' })
  ids?: string;
}
