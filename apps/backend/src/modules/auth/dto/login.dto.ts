import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner', description: 'Username or email' })
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  identifier: string;

  @ApiProperty({ example: '********' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({ description: 'Min 10 chars, upper + lower case and a number' })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  newPassword: string;
}
