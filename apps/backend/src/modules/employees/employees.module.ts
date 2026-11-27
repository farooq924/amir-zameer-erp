import { Module } from '@nestjs/common';
import { AdvancesController, EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({ controllers: [EmployeesController, AdvancesController], providers: [EmployeesService], exports: [EmployeesService] })
export class EmployeesModule {}
