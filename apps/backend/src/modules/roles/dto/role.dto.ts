import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'SENIOR_TAILOR' })
  @Matches(/^[A-Z][A-Z0-9_]{2,39}$/, { message: 'Code must be 3-40 upper-case letters, numbers or underscores' })
  code: string;

  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80)
  name: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300)
  description?: string;

  @ApiProperty({ type: [String], example: ['orders.view', 'production.edit'] })
  @IsArray() @ArrayMaxSize(500) @IsString({ each: true })
  permissions: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(80)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300)
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true })
  permissions?: string[];
}
