import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class BackupListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['AUTOMATIC', 'MANUAL'] })
  @IsOptional() @IsIn(['AUTOMATIC', 'MANUAL'])
  type?: 'AUTOMATIC' | 'MANUAL';

  @ApiPropertyOptional({ enum: ['RUNNING', 'COMPLETED', 'VERIFIED', 'FAILED', 'RESTORED'] })
  @IsOptional() @IsIn(['RUNNING', 'COMPLETED', 'VERIFIED', 'FAILED', 'RESTORED'])
  status?: string;
}

export class CreateBackupDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @IsString() @MaxLength(200)
  note?: string;
}

export class UpdateBackupConfigDto {
  @IsOptional() @IsBoolean() autoEnabled?: boolean;
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Daily time must be HH:MM, for example 23:00' }) dailyTime?: string;
  @IsOptional() @IsInt() @Min(3) @Max(365) keepAutomatic?: number;
  @IsOptional() @IsString() @MaxLength(400) copyFolder?: string;
  @IsOptional() @IsBoolean() verifyAfterBackup?: boolean;
}

export class PasswordConfirmDto {
  @IsString() @MinLength(1) @MaxLength(128)
  password: string;
}

export class RestoreBackupDto extends PasswordConfirmDto {
  /** The user must type RESTORE to confirm. */
  @IsString() @IsIn(['RESTORE'], { message: 'Type RESTORE to confirm' })
  confirm: string;
}
