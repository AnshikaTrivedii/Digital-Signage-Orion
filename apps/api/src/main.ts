import './load-env';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'path';
import { AppModule } from './app.module';
import { getJwtSecret } from './common/config/jwt-secret';

function configuredCorsOrigins(): string[] {
  const configured = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured.length ? configured : ['http://localhost:3000'];
}

async function bootstrap() {
  getJwtSecret();
  const corsOrigins = configuredCorsOrigins();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: true,
    credentials: false,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id'],
  });
  const uploadDirectory = process.env.ASSET_UPLOAD_DIR ?? 'tmp/uploads';
  app.useStaticAssets(resolve(uploadDirectory), {
    prefix: '/uploads/',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', corsOrigins[0] ?? 'http://localhost:3000');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

  app.setGlobalPrefix('api');
  // whitelist strips unknown fields; do not forbidNonWhitelisted globally —
  // player clients (older APKs, PoP batches) send optional/telemetry fields and
  // route-level pipes already opt into lenient validation.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`Orion API ready on http://localhost:${port}/api`);
}

bootstrap();
