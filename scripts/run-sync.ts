// Corre un sync único contra worldcup26.ir usando el mismo SyncService de la app.
// Uso: npx ts-node -r tsconfig-paths/register scripts/run-sync.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SyncService } from '../src/worldcup/sync.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const sync = app.get(SyncService, { strict: false });
    const summary = await sync.sync();
    // eslint-disable-next-line no-console
    console.log('Sync OK:', JSON.stringify(summary));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Sync FALLO:', err);
  process.exit(1);
});
