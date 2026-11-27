import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength,
  ValidateNested,
} from 'class-validator';
import { CONFLICT_RESOLUTIONS, SYNC_ENTITY_KEYS, SYNC_MAX_BATCH, SYNC_OPERATIONS, SYNC_STORED_STATUSES } from '@az/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

const RESOLUTION_KEYS = CONFLICT_RESOLUTIONS.map((r) => r.key);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const DEVICE_RE = /^[A-Za-z0-9_.:-]{6,100}$/;

export class SyncOperationDto {
  @ApiProperty({ description: 'Client-generated UUID of this operation. Sending it again never applies it twice.' }) @IsUUID()
  id: string;

  @ApiProperty({ enum: SYNC_ENTITY_KEYS }) @IsIn(SYNC_ENTITY_KEYS)
  entityType: (typeof SYNC_ENTITY_KEYS)[number];

  @ApiProperty({ description: 'Client-generated UUID of the record (new records) or the record being changed' }) @IsUUID()
  entityId: string;

  @ApiProperty({ enum: SYNC_OPERATIONS }) @IsIn(SYNC_OPERATIONS)
  operation: (typeof SYNC_OPERATIONS)[number];

  @ApiPropertyOptional({ description: 'Record version the device edited (updates only)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  baseVersion?: number;

  @ApiProperty({ description: 'Same body the normal API endpoint accepts' }) @IsObject()
  payload: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Operations that must be applied first (e.g. the new customer of a new order)' })
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('4', { each: true })
  dependsOn?: string[];

  @ApiProperty({ description: 'When the user saved it on the device (ISO time)' }) @IsDateString()
  clientTimestamp: string;
}

export class SyncPushDto {
  @ApiProperty({ example: 'web-3f9a1c2b7d' }) @Matches(DEVICE_RE, { message: 'deviceId is invalid' })
  deviceId: string;

  @ApiPropertyOptional({ example: 'Chrome on Android' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  deviceName?: string;

  @ApiProperty({ type: [SyncOperationDto] }) @IsArray() @ArrayMaxSize(SYNC_MAX_BATCH)
  @ValidateNested({ each: true }) @Type(() => SyncOperationDto)
  operations: SyncOperationDto[];
}

export class SnapshotQueryDto {
  @ApiPropertyOptional({ description: 'Only records changed after this time (ISO). Omit for a full download.' }) @IsOptional() @IsDateString()
  since?: string;
}

export class SyncLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SYNC_STORED_STATUSES }) @IsOptional() @IsIn(SYNC_STORED_STATUSES)
  status?: (typeof SYNC_STORED_STATUSES)[number];

  @ApiPropertyOptional() @IsOptional() @Matches(DEVICE_RE) deviceId?: string;

  @ApiPropertyOptional({ enum: SYNC_ENTITY_KEYS }) @IsOptional() @IsIn(SYNC_ENTITY_KEYS)
  entityType?: (typeof SYNC_ENTITY_KEYS)[number];

  @ApiPropertyOptional({ description: 'all = every user (needs Synchronization APPROVE)' }) @IsOptional() @IsIn(['mine', 'all'])
  scope?: 'mine' | 'all';
}

export class ConflictQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'RESOLVED'] }) @IsOptional() @IsIn(['PENDING', 'RESOLVED'])
  status?: 'PENDING' | 'RESOLVED';

  @ApiPropertyOptional({ enum: ['mine', 'all'] }) @IsOptional() @IsIn(['mine', 'all'])
  scope?: 'mine' | 'all';
}

export class ResolveConflictDto {
  @ApiProperty({ enum: RESOLUTION_KEYS }) @IsIn(RESOLUTION_KEYS)
  resolution: (typeof RESOLUTION_KEYS)[number];

  @ApiPropertyOptional({ description: 'MERGED only: field -> "server" or "device"' }) @IsOptional() @IsObject()
  fields?: Record<string, 'server' | 'device'>;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(500)
  notes?: string;
}
