import { Module } from '@nestjs/common';
import { MeasurementsController } from './measurements.controller';
import { MeasurementsService } from './measurements.service';
import { TemplatesService } from './templates.service';

@Module({ controllers: [MeasurementsController], providers: [MeasurementsService, TemplatesService], exports: [MeasurementsService] })
export class MeasurementsModule {}
