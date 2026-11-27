import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';

@Module({ imports: [EmployeesModule], controllers: [ProductionController], providers: [ProductionService] })
export class ProductionModule {}
