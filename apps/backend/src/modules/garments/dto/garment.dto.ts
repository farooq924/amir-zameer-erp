import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { GARMENT_CATEGORIES } from '@az/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const CATEGORY_KEYS = GARMENT_CATEGORIES.map((c) => c.key);
export const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/;
export const QTY_RE = /^\d{1,8}(\.\d{1,3})?$/;

export class CreateGarmentDto {
  @ApiProperty({ example: 'Shalwar Kameez' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(80)
  name: string;

  @ApiProperty({ enum: CATEGORY_KEYS }) @IsIn(CATEGORY_KEYS)
  category: (typeof CATEGORY_KEYS)[number];

  @ApiPropertyOptional({ description: 'Measurement template used for this garment' }) @IsOptional() @IsUUID()
  measurementTemplateId?: string | null;

  @ApiPropertyOptional({ example: '2500.00' }) @IsOptional() @Matches(MONEY_RE, { message: 'Stitching price must be an amount like 2500 or 2500.50' })
  defaultStitchingPrice?: string;

  @ApiPropertyOptional({ example: '4.500', description: 'Fabric needed for one piece (meters)' })
  @IsOptional() @Matches(QTY_RE, { message: 'Fabric per piece must be a number with up to 3 decimals' })
  defaultFabricConsumption?: string;

  @ApiPropertyOptional({ example: '600.00', description: 'Wage paid to the tailor per piece (used in Phase 5)' })
  @IsOptional() @Matches(MONEY_RE, { message: 'Piece rate must be an amount like 600 or 600.50' })
  defaultPieceRate?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateGarmentDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: CATEGORY_KEYS }) @IsOptional() @IsIn(CATEGORY_KEYS)
  category?: (typeof CATEGORY_KEYS)[number];

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  measurementTemplateId?: string | null;

  @ApiPropertyOptional() @IsOptional() @Matches(MONEY_RE, { message: 'Stitching price must be an amount like 2500 or 2500.50' })
  defaultStitchingPrice?: string;

  @ApiPropertyOptional() @IsOptional() @Matches(QTY_RE, { message: 'Fabric per piece must be a number with up to 3 decimals' })
  defaultFabricConsumption?: string;

  @ApiPropertyOptional() @IsOptional() @Matches(MONEY_RE, { message: 'Piece rate must be an amount like 600 or 600.50' })
  defaultPieceRate?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}
