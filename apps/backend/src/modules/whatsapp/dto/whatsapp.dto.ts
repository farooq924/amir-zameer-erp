import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { WHATSAPP_PURPOSES, WHATSAPP_VARIABLE_KEYS } from '@az/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { DATE_RE } from '../../accounting/dto/accounting.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const PURPOSE_KEYS = WHATSAPP_PURPOSES.map((p) => p.key);
export const RELATED_TYPES = ['ORDER', 'PAYMENT', 'CUSTOMER'] as const;

export class MessageQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'ALL'] })
  @IsOptional() @IsIn(['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'ALL']) status?: string;
  @ApiPropertyOptional({ enum: ['CLOUD_API', 'MANUAL', 'ALL'] }) @IsOptional() @IsIn(['CLOUD_API', 'MANUAL', 'ALL']) channel?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() relatedId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE) to?: string;
}

export class TemplateDto {
  @ApiProperty({ example: 'order_ready', description: 'Exact template name approved in Meta WhatsApp Manager' })
  @Transform(trim) @IsString() @Matches(/^[a-z0-9_]{1,100}$/, { message: 'Template name: small letters, numbers and _ only (same as in Meta)' }) name: string;
  @ApiProperty({ example: 'en' }) @Transform(trim) @IsString() @Matches(/^[a-z]{2,3}(_[A-Z]{2})?$/, { message: 'Language code like en or en_US' }) language: string;
  @ApiProperty({ enum: ['UTILITY', 'MARKETING'] }) @IsIn(['UTILITY', 'MARKETING']) category: string;
  @ApiProperty({ enum: PURPOSE_KEYS }) @IsIn(PURPOSE_KEYS, { message: 'Choose what the template is for' }) purpose: string;
  @ApiProperty({ example: 'Dear {{1}}, your order {{2}} is ready.' }) @Transform(trim) @IsString() @MinLength(5) @MaxLength(1024) bodyPreview: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(20) @IsIn(WHATSAPP_VARIABLE_KEYS, { each: true, message: 'Unknown value in the template' }) variables: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class PreviewDto {
  @ApiPropertyOptional({ description: 'Template to use. Leave empty for a free text message.' }) @IsOptional() @IsUUID() templateId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) text?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional({ enum: RELATED_TYPES }) @IsOptional() @IsIn(RELATED_TYPES) relatedType?: (typeof RELATED_TYPES)[number];
  @ApiPropertyOptional() @IsOptional() @IsUUID() relatedId?: string;
  @ApiPropertyOptional({ example: '03001234567', description: 'Send to this number instead of the customer number' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(20) toNumber?: string;
}

export class SendDto extends PreviewDto {
  @ApiProperty({ enum: ['CLOUD_API', 'MANUAL'] }) @IsIn(['CLOUD_API', 'MANUAL']) channel: 'CLOUD_API' | 'MANUAL';
}

export class OptInDto {
  @ApiProperty() @Type(() => Boolean) @IsBoolean() optIn: boolean;
}
