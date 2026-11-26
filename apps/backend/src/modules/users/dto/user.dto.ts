import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120)
  fullName: string;

  @ApiProperty() @IsEmail() @MaxLength(160)
  email: string;

  @ApiProperty({ description: 'Letters, numbers, dot, dash, underscore' })
  @Matches(/^[a-zA-Z0-9._-]{3,60}$/, { message: 'Username must be 3-60 characters: letters, numbers, dot, dash or underscore' })
  username: string;

  @ApiProperty() @IsString() @MinLength(10) @MaxLength(128)
  password: string;

  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsUUID('4', { each: true })
  roleIds: string[];

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsUUID('4', { each: true })
  roleIds?: string[];

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  employeeId?: string | null;
}

export class SetUserStatusDto {
  @ApiProperty() @IsBoolean()
  isActive: boolean;
}

export class ResetPasswordDto {
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(128)
  newPassword: string;
}
