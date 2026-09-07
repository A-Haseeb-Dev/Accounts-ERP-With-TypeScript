import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';

  // Fail secure: in production, never run with obvious default JWT secrets.
  if (isProd) {
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

  // Trust the first hop (reverse proxy / load balancer) so req.ip — used by the
  // rate limiter and the account-lockout logic — reflects the real client IP
  // instead of the proxy's. Explicitly opt in via TRUST_PROXY; disabled unless
  // requested (never trust proxies blindly).
  const trustProxy = config.get<string>('TRUST_PROXY', 'false');
  app.set('trust proxy', trustProxy === 'true');

  // Security headers. Single-purpose, explicit:
  //  - Production: strict CSP (this API only ever serves JSON, never HTML), HSTS
  //    with preload, frame/object/type protections from helmet defaults.
  //  - Non-production: HSTS is skipped and the CSP relaxes inline/eval scripts so
  //    the interactive Swagger UI keeps working.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: isProd ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "https:", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'https:', 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
      strictTransportSecurity: isProd
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    }),
  );
  app.use(cookieParser());
  // Allow larger JSON bodies so branding logos/favicons uploaded as data URLs
  // (base64) can pass through the PATCH /branding endpoint.
  app.useBodyParser('json', { limit: '6mb' });

  // CORS: normalize configured origins (trim whitespace, strip trailing slashes)
  // so an origin like "https://app.example.com/" does not break credentialed
  // cross-origin requests.
  const webOrigins = (config.get<string>('WEB_URL', 'http://localhost:3000') ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''));
  app.enableCors({
    origin: webOrigins.length ? webOrigins : ['http://localhost:3000'],
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

  // The Swagger UI requires inline/eval scripts, which is incompatible with the
  // strict production CSP, and exposes the full API surface. Mount it only in
  // non-production environments.
  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('HAS ERP API')
      .setDescription('Modern web-based ERP / inventory / sales / accounting management system')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get<number>('API_PORT', 4000);
  await app.listen(port, config.get<string>('API_HOST', '0.0.0.0'));
  logger.log(`HAS ERP API running on http://localhost:${port}/api`);
  if (!isProd) {
    logger.log(`Swagger docs on http://localhost:${port}/api/docs`);
  }
}

bootstrap();