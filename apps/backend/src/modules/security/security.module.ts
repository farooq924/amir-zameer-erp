import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BackupModule } from '../backup/backup.module';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';

@Module({ imports: [AuthModule, BackupModule], controllers: [SecurityController], providers: [SecurityService] })
export class SecurityModule {}
