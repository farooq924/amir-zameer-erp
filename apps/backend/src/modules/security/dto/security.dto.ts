import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class SessionsQueryDto {
  @ApiPropertyOptional({ enum: ['mine', 'all'], default: 'mine' })
  @IsOptional() @IsIn(['mine', 'all'])
  scope: 'mine' | 'all' = 'mine';
}

export class LoginAttemptsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['all', 'failed', 'success'], default: 'all' })
  @IsOptional() @IsIn(['all', 'failed', 'success'])
  result: 'all' | 'failed' | 'success' = 'all';
}
