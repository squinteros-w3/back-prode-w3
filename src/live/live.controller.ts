import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LiveService, type LiveState } from './live.service';

// Ruta propia (/api/live) para que borrar src/live se lleve el endpoint entero
// sin tocar el módulo de matches.
@Controller('live')
@UseGuards(JwtAuthGuard)
export class LiveController {
  constructor(private readonly live: LiveService) {}

  /** Marcadores en vivo vigentes, indexados por id interno de Match. */
  @Get()
  active(): Record<string, LiveState> {
    return this.live.getActive();
  }
}
