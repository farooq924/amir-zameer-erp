import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { WorkflowService } from './workflow.service';

@Module({ imports: [SettingsModule], controllers: [OrdersController], providers: [OrdersService, WorkflowService], exports: [OrdersService] })
export class OrdersModule {}
