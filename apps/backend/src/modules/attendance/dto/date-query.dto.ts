import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { DATE_RE } from '../../employees/dto/employee.dto';

export class DateQueryDto {
  @ApiPropertyOptional({ example: '2026-11-27' }) @IsOptional() @Matches(DATE_RE, { message: 'Date must be like 2026-11-27' })
  date?: string;
}
