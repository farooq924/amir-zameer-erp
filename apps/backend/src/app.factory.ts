import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { env } from './config/env';

/** Shared by main.ts and e2e tests so tests exercise the real middleware stack. */
export async function createApp(): Promise<INestApplication> {
  const config = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: config.NODE_ENV === 'test' ? ['error'] : ['log', 'warn', 'error'],
  });
  if (config.TRUST_PROXY) app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({ origin: config.APP_URL, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

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
