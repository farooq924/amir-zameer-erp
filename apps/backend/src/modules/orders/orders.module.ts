import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { SettingsModule } from '../settings/settings.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { WorkflowService } from './workflow.service';

@Module({ imports: [SettingsModule, InventoryModule], controllers: [OrdersController], providers: [OrdersService, WorkflowService], exports: [OrdersService] })
export class OrdersModule {}
