import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { browserSecurity, frontendOrigin } from './auth/browser-security';
export function configureApp(app: INestApplication) {
  app.enableCors({
    origin: frontendOrigin(),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  app.use(browserSecurity);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
