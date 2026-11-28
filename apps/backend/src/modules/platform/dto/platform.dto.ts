import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { PLAN_MODULES } from '@az/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export const COMPANY_PAYMENT_METHODS = ['JAZZCASH', 'EASYPAISA', 'BANK', 'CASH', 'OTHER'] as const;

export class OwnerAccountDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) fullName: string;
  @ApiProperty() @IsEmail() @MaxLength(160) email: string;
  @ApiProperty() @IsString() @Matches(/^[a-zA-Z0-9._-]{3,60}$/, { message: 'Username: 3-60 letters, numbers, dot, dash or underscore' }) username: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(128) password: string;
}

export class CreateCompanyDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(160) name: string;
  @ApiPropertyOptional({ description: 'Short id, e.g. "zameer-ansari". Made from the name when empty.' })
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{2,30}$/, { message: 'Code: 2-30 small letters, numbers or dashes' }) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) ownerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(160) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) city?: string;
  @ApiPropertyOptional({ description: 'Document number prefix, e.g. "ZA" -> ZA-2026-00001' })
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{1,4}$/, { message: 'Prefix: 1-4 letters' }) docPrefix?: string;
  @ApiProperty() @IsUUID() planId: string;
  @ApiPropertyOptional({ default: true, description: 'Start with a free trial (14 days by default)' }) @IsOptional() @IsBoolean() trial?: boolean;
  @ApiPropertyOptional({ default: 14 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90) trialDays?: number;
  @ApiPropertyOptional({ description: 'Paid until (YYYY-MM-DD) when not on trial; empty = no expiry' }) @IsOptional() @IsDateString() paidUntil?: string;
  @ApiProperty({ type: OwnerAccountDto }) @ValidateNested() @Type(() => OwnerAccountDto) owner: OwnerAccountDto;
}

export class UpdateCompanyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) ownerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() planId?: string;
  @ApiPropertyOptional({ enum: ['TRIAL', 'ACTIVE'] }) @IsOptional() @IsIn(['TRIAL', 'ACTIVE']) status?: 'TRIAL' | 'ACTIVE';
  @ApiPropertyOptional({ description: 'YYYY-MM-DD, or null' }) @IsOptional() @IsDateString() trialEndsAt?: string | null;
  @ApiPropertyOptional({ description: 'YYYY-MM-DD, or null for no expiry' }) @IsOptional() @IsDateString() paidUntil?: string | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60) graceDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional({ description: 'true = paid until never expires' }) @IsOptional() @IsBoolean() noExpiry?: boolean;
}

export class SuspendCompanyDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(300) reason: string;
}

export class CompanyListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRING', 'READ_ONLY'] })
  @IsOptional() @IsIn(['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRING', 'READ_ONLY']) status?: string;
}

export class RecordCompanyPaymentDto {
  @ApiProperty() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100_000_000) amount: number;
  @ApiProperty({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(36) months: number;
  @ApiProperty({ enum: COMPANY_PAYMENT_METHODS }) @IsIn(COMPANY_PAYMENT_METHODS) method: (typeof COMPANY_PAYMENT_METHODS)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @ApiPropertyOptional({ description: 'YYYY-MM-DD (default today)' }) @IsOptional() @IsDateString() paidAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class PaymentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() companyId?: string;
}

export class PlanDto {
  @ApiProperty() @IsString() @Matches(/^[A-Z0-9_]{2,30}$/, { message: 'Code: 2-30 capital letters, numbers or _' }) code: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiProperty() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000) monthlyPrice: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(1000) maxUsers: number;
  @ApiProperty({ isArray: true, enum: PLAN_MODULES }) @IsArray() @ArrayUnique() @IsIn(PLAN_MODULES, { each: true }) modules: string[];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000) monthlyPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) maxUsers?: number;
  @ApiPropertyOptional({ isArray: true, enum: PLAN_MODULES }) @IsOptional() @IsArray() @ArrayUnique() @IsIn(PLAN_MODULES, { each: true }) modules?: string[];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ResetOwnerPasswordDto {
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(128) password: string;
}
