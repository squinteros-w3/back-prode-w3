import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ElnineApiService } from './elnine-api.service';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';

// Módulo autocontenido del overlay de vivo (elnine). PrismaService llega por
// el PrismaModule global. Para desactivar todo: quitar este import de
// app.module.ts y borrar la carpeta src/live.
@Module({
  imports: [HttpModule],
  controllers: [LiveController],
  providers: [ElnineApiService, LiveService],
})
export class LiveModule {}
