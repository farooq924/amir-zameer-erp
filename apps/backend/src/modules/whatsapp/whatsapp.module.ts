import { Global, Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { CloudApiClient } from './cloud-api.client';
import { WhatsAppController, WhatsAppWebhookController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

/** Global so orders and payments can send automatic messages through WhatsAppService.notify(). */
@Global()
@Module({ imports: [SettingsModule], controllers: [WhatsAppController, WhatsAppWebhookController], providers: [WhatsAppService, CloudApiClient], exports: [WhatsAppService] })
export class WhatsAppModule {}
