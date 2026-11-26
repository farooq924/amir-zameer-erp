import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested,
} from 'class-validator';
import { GARMENT_CATEGORIES } from '@az/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const UNITS = ['INCH', 'CM'] as const;
const DECIMAL = /^\d{1,3}(\.\d{1,2})?$/;

export class MeasurementValueInput {
  @ApiProperty({ example: 'chest' }) @IsString() @MaxLength(40)
  fieldKey: string;

  @ApiPropertyOptional({ example: '40.50', description: 'Empty = not measured' })
  @IsOptional() @Transform(({ value }) => (value === '' || value === null ? undefined : String(value)))
  @Matches(DECIMAL, { message: 'Measurements must be numbers with up to 2 decimals, e.g. 40.5' })
  value?: string;
}

export class CustomValueInput {
  @ApiProperty({ example: 'Pocket Height' }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(60)
  label: string;

  @ApiPropertyOptional({ example: '6.5' }) @IsOptional() @Transform(({ value }) => (value === '' || value === null ? undefined : String(value)))
  @Matches(DECIMAL, { message: 'Measurements must be numbers with up to 2 decimals' })
  value?: string;

  @ApiPropertyOptional({ example: 'Two pockets' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  textValue?: string;
}

export class SaveMeasurementDto {
  @ApiPropertyOptional({ description: 'Client-generated UUID (offline creation)' }) @IsOptional() @IsUUID()
  id?: string;

  @ApiProperty() @IsUUID()
  templateId: string;

  @ApiProperty({ enum: UNITS }) @IsIn(UNITS)
  unit: 'INCH' | 'CM';

  @ApiProperty({ type: [MeasurementValueInput] }) @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => MeasurementValueInput)
  values: MeasurementValueInput[];

  @ApiPropertyOptional({ type: [CustomValueInput] }) @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => CustomValueInput)
  customValues?: CustomValueInput[];

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  takenByName?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000)
  notes?: string;
}

export class TemplateFieldInput {
  @ApiPropertyOptional({ description: 'Existing field id (omit for a new field)' }) @IsOptional() @IsUUID()
  id?: string;

  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(60)
  label: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CreateTemplateDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(80)
  name: string;

  @ApiProperty({ enum: GARMENT_CATEGORIES.map((g) => g.key) }) @IsIn(GARMENT_CATEGORIES.map((g) => g.key))
  garmentCategory: (typeof GARMENT_CATEGORIES)[number]['key'];

  @ApiPropertyOptional({ enum: UNITS }) @IsOptional() @IsIn(UNITS)
  defaultUnit?: 'INCH' | 'CM';

  @ApiProperty({ type: [TemplateFieldInput] }) @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => TemplateFieldInput)
  fields: TemplateFieldInput[];
}

export class UpdateTemplateDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: UNITS }) @IsOptional() @IsIn(UNITS)
  defaultUnit?: 'INCH' | 'CM';

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [TemplateFieldInput], description: 'Full ordered field list. Fields left out are deactivated (never deleted).' })
  @IsOptional() @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => TemplateFieldInput)
  fields?: TemplateFieldInput[];
}

export class TemplateQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  includeInactive?: boolean;
}

export class HistoryQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  templateId?: string;
}

export class CompareQueryDto {
  @ApiProperty({ description: 'Older version id' }) @IsUUID() from: string;
  @ApiProperty({ description: 'Newer version id' }) @IsUUID() to: string;
}

export class RecentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() templateId?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @Transform(({ value }) => value !== 'false' && value !== false) @IsBoolean()
  latestOnly?: boolean = true;
}

