import './load-env';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'path';
import { AppModule } from './app.module';
import { getJwtSecret } from './common/config/jwt-secret';

async function bootstrap() {
  getJwtSecret();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
  });
  const uploadDirectory = process.env.ASSET_UPLOAD_DIR ?? 'tmp/uploads';
  app.useStaticAssets(resolve(uploadDirectory), {
    prefix: '/uploads/',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
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
