import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { MeasurementsModule } from '../measurements/measurements.module';
import { OrdersModule } from '../orders/orders.module';
import { SettingsModule } from '../settings/settings.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({ imports: [CustomersModule, MeasurementsModule, OrdersModule, SettingsModule], controllers: [SyncController], providers: [SyncService] })
export class SyncModule {}
