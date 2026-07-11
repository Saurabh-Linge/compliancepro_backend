import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as path from 'path';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
    }),
  );

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // Production CORS configuration
  const allowedOrigins = process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL, 'http://localhost:4200']
    : true; // Fallback for dev

  await app.register(require('@fastify/cors'), {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.register(require('@fastify/multipart'), {
    limits: {
      fileSize: 20 * 1024 * 1024, // 20MB per file
      files: 10,                   // max 10 files
      fields: 30,                  // max 30 text fields
    },
  });

  await app.register(require('@fastify/static'), {
    root: path.join(process.cwd(), 'uploads'),
    prefix: '/uploads/',
  });

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3580;
  await app.listen(port, '0.0.0.0');
}

bootstrap();