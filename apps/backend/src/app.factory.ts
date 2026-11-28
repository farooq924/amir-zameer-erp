import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { env } from './config/env';

/** Shared by main.ts and e2e tests so tests exercise the real middleware stack. */
export async function createApp(): Promise<INestApplication> {
  const config = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // WhatsApp webhook signature is checked on the exact bytes Meta sent
    logger: config.NODE_ENV === 'test' ? ['error'] : ['log', 'warn', 'error'],
  });
  if (config.TRUST_PROXY) app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  // No upgrade-insecure-requests: the ERP is also opened on plain http://localhost on the shop PC.
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  // Browser features the ERP never uses are switched off for every page and API response.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
    next();
  });
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({ origin: config.APP_URL, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  serveFrontend(app, config.FRONTEND_DIST, config.NODE_ENV);

  const swaggerOn = config.SWAGGER_ENABLED ?? config.NODE_ENV !== 'production';
  if (swaggerOn) {
    const doc = new DocumentBuilder()
      .setTitle('AMIR ZAMEER ERP API')
      .setDescription('REST API for the AMIR ZAMEER Tailoring & Fabric Management ERP')
      .setVersion('0.1.0')
      .addCookieAuth('az_sid')
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-CSRF-Token' }, 'csrf')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  }
  return app;
}

/**
 * Serves the built web app (apps/frontend/dist) from the same port as the API, so one address
 * (e.g. a Cloudflare Tunnel to http://localhost:4000) runs the whole ERP. Skipped when the build is missing.
 */
function serveFrontend(app: NestExpressApplication, configured: string | undefined, nodeEnv: string): void {
  if (nodeEnv === 'test') return;
  const dir = configured ? resolve(configured) : resolve(__dirname, '..', '..', 'frontend', 'dist');
  const indexHtml = join(dir, 'index.html');
  if (!existsSync(indexHtml)) return;
  app.useStaticAssets(dir, {
    index: false,
    setHeaders: (res, filePath) => {
      // Hashed bundles never change; index.html must always be fresh after an update.
      if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      // The offline app (service worker + manifest) must be re-checked on every visit so updates arrive.
      else if (/(sw\.js|registerSW\.js|workbox-[\w-]+\.js|manifest\.webmanifest)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    },
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path === '/api' || req.path.startsWith('/api/')) return next();
    // Missing files (e.g. an old bundle) get a real 404 instead of the app page.
    if (/\.[a-z0-9]+$/i.test(req.path)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
}
