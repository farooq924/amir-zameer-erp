import { Global, Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { PostingService } from './posting.service';

/** Global so any module can post journal entries through PostingService. */
@Global()
@Module({ controllers: [AccountingController], providers: [AccountingService, PostingService], exports: [PostingService, AccountingService] })
export class AccountingModule {}
