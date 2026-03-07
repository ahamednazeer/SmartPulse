import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

function loadEnvFromFile() {
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getCorsOrigins(): string[] {
  const rawOrigins =
    process.env.CORS_ORIGIN ||
    'http://localhost:3000,http://127.0.0.1:3000,https://localhost:3000,https://127.0.0.1:3000,http://localhost,https://localhost,capacitor://localhost';
  const origins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0
    ? origins
    : [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://localhost:3000',
        'https://127.0.0.1:3000',
        'http://localhost',
        'https://localhost',
        'capacitor://localhost',
      ];
}

function getHttpsOptions():
  | {
      key: Buffer;
      cert: Buffer;
    }
  | undefined {
  const keyPath = process.env.HTTPS_KEY_PATH;
  const certPath = process.env.HTTPS_CERT_PATH;

  if (!keyPath || !certPath) {
    return undefined;
  }

  if (!existsSync(keyPath) || !existsSync(certPath)) {
    return undefined;
  }

  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
  };
}

loadEnvFromFile();

async function bootstrap() {
  const httpsOptions = getHttpsOptions();
  const app = await NestFactory.create(AppModule, {
    httpsOptions,
  });
  const configuredPort = Number(process.env.PORT);
  const port =
    Number.isFinite(configuredPort) && configuredPort > 0
      ? configuredPort
      : 3001;

  const host = process.env.HOST || '0.0.0.0';

  app.enableCors({
    origin: getCorsOrigins(),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  await app.listen(port, host);
  const protocol = httpsOptions ? 'https' : 'http';
  console.log(`SmartPulse API running on ${protocol}://${host}:${port}`);
}
void bootstrap();
