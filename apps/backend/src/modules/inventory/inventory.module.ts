import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { FabricsController } from './fabrics.controller';
import { FabricsService } from './fabrics.service';
import { StockService } from './stock.service';

@Module({ imports: [SettingsModule], controllers: [FabricsController], providers: [FabricsService, StockService], exports: [FabricsService, StockService] })
export class InventoryModule {}
