import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import express from 'express';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Fail secure: in production, never run with obvious default JWT secrets.
  if (process.env.NODE_ENV === 'production') {
    const defaultSecrets = new Set(['has-erp-access-secret', 'has-erp-refresh-secret']);
    let missing = false;
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      const value = config.get<string>(key);
      if (!value || defaultSecrets.has(value)) {
        logger.error(`${key} must be set to a strong random value in production (JWT_ACCESS_SECRET and JWT_REFRESH_SECRET differ)`);
        missing = true;
      }
    }
    if (missing) {
      process.exit(1);
    }
  }

  app.setGlobalPrefix('api');

  app.use(helmet());
  app.use(cookieParser());
  // Allow larger JSON bodies so branding logos/favicons uploaded as data URLs
  // (base64) can pass through the PATCH /branding endpoint.
  app.use(express.json({ limit: '6mb' }));
  app.enableCors({
    origin: config.get<string>('WEB_URL', 'http://localhost:3000').split(','),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HAS ERP API')
    .setDescription('Modern web-based ERP / inventory / sales / accounting management system')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('API_PORT', 4000);
  await app.listen(port, config.get<string>('API_HOST', '0.0.0.0'));
  logger.log(`HAS ERP API running on http://localhost:${port}/api`);
  logger.log(`Swagger docs on http://localhost:${port}/api/docs`);
}

bootstrap();