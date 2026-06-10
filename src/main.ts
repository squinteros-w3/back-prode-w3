import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // El frontend (Astro BFF) llama al API server-side, pero habilitamos CORS
  // con credenciales por si se consume desde el navegador en algun caso.
  const frontUrl = process.env.FRONT_URL ?? 'http://localhost:4321';
  app.enableCors({ origin: frontUrl, credentials: true });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Backend escuchando en http://localhost:${port}/api`);
}
void bootstrap();
