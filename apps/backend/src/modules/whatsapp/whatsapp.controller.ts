import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ReqContext } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestContext } from '../../common/types/auth-user';
import { MessageQueryDto, OptInDto, PreviewDto, SendDto, TemplateDto } from './dto/whatsapp.dto';
import { WhatsAppService } from './whatsapp.service';

@ApiTags('WhatsApp')
@ApiCookieAuth()
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly wa: WhatsAppService) {}

  @Get('summary') @RequirePermissions('whatsapp', 'VIEW')
  summary() { return this.wa.summary(); }

  @Get('messages') @RequirePermissions('whatsapp', 'VIEW')
  list(@Query() q: MessageQueryDto) { return this.wa.list(q); }

  @Get('messages/:id') @RequirePermissions('whatsapp', 'VIEW')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.wa.get(id); }

  @Post('messages/:id/retry') @HttpCode(200) @RequirePermissions('whatsapp', 'CREATE')
  retry(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) { return this.wa.retry(id, ctx); }

  @Post('messages/:id/cancel') @HttpCode(200) @RequirePermissions('whatsapp', 'CREATE')
  cancel(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) { return this.wa.cancel(id, ctx); }

  @Post('queue/run') @HttpCode(200) @RequirePermissions('whatsapp', 'CREATE')
  runQueue() { return this.wa.processQueue(); }

  @Post('preview') @HttpCode(200) @RequirePermissions('whatsapp', 'VIEW')
  preview(@Body() dto: PreviewDto) { return this.wa.preview(dto); }

  @Post('send') @RequirePermissions('whatsapp', 'CREATE')
  send(@Body() dto: SendDto, @ReqContext() ctx: RequestContext) { return this.wa.send(dto, ctx); }

  @Put('customers/:id/opt-in') @RequirePermissions('customers', 'EDIT')
  optIn(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OptInDto, @ReqContext() ctx: RequestContext) { return this.wa.setOptIn(id, dto, ctx); }

  @Get('templates') @RequirePermissions('whatsapp', 'VIEW')
  templates() { return this.wa.templates(); }

  @Post('templates') @RequirePermissions('whatsapp', 'MANAGE_SETTINGS')
  createTemplate(@Body() dto: TemplateDto, @ReqContext() ctx: RequestContext) { return this.wa.createTemplate(dto, ctx); }

  @Put('templates/:id') @RequirePermissions('whatsapp', 'MANAGE_SETTINGS')
  updateTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TemplateDto, @ReqContext() ctx: RequestContext) { return this.wa.updateTemplate(id, dto, ctx); }

  @Post('templates/sync') @HttpCode(200) @RequirePermissions('whatsapp', 'MANAGE_SETTINGS')
  syncTemplates(@ReqContext() ctx: RequestContext) { return this.wa.syncTemplates(ctx); }

  @Get('config') @RequirePermissions('whatsapp', 'MANAGE_SETTINGS')
  config() { return this.wa.getPublicConfig(); }

  @Put('config') @RequirePermissions('whatsapp', 'MANAGE_SETTINGS') @ApiBody({ schema: { type: 'object' } })
  updateConfig(@Body() body: Record<string, unknown>, @ReqContext() ctx: RequestContext) { return this.wa.updateConfig(body, ctx); }

  @Post('config/test') @HttpCode(200) @RequirePermissions('whatsapp', 'MANAGE_SETTINGS')
  test() { return this.wa.testConnection(); }
}

/** Called by Meta (no login). URL to paste in Meta: https://<your domain>/api/whatsapp/webhook */
@ApiTags('WhatsApp')
@Controller('whatsapp/webhook')
@SkipThrottle()
export class WhatsAppWebhookController {
  constructor(private readonly wa: WhatsAppService) {}

  @Get() @Public() @Header('Content-Type', 'text/plain') @ApiExcludeEndpoint()
  verify(@Query('hub.mode') mode?: string, @Query('hub.verify_token') token?: string, @Query('hub.challenge') challenge?: string) {
    return this.wa.webhookVerify(undefined, mode, token, challenge);
  }

  @Get(':company') @Public() @Header('Content-Type', 'text/plain') @ApiExcludeEndpoint()
  verifyCompany(@Param('company') company: string, @Query('hub.mode') mode?: string, @Query('hub.verify_token') token?: string, @Query('hub.challenge') challenge?: string) {
    return this.wa.webhookVerify(company, mode, token, challenge);
  }

  @Post() @Public() @HttpCode(200) @ApiExcludeEndpoint()
  async receive(@Req() req: Request & { rawBody?: Buffer }, @Body() body: unknown) {
    await this.wa.webhookReceive(undefined, req.rawBody, req.headers['x-hub-signature-256'] as string | undefined, body);
    return { ok: true };
  }

  @Post(':company') @Public() @HttpCode(200) @ApiExcludeEndpoint()
  async receiveCompany(@Param('company') company: string, @Req() req: Request & { rawBody?: Buffer }, @Body() body: unknown) {
    await this.wa.webhookReceive(company, req.rawBody, req.headers['x-hub-signature-256'] as string | undefined, body);
    return { ok: true };
  }
}
