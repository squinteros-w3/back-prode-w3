import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { ElnineMatch, ElnineMatchesResponse } from './elnine.types';

// Slug del Mundial en elnine (Stats Perform). Constante estable.
const WORLD_CUP_SLUG = 'fifa-world-cup';

@Injectable()
export class ElnineApiService {
  private readonly logger = new Logger(ElnineApiService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get base(): string {
    return (
      this.config.get<string>('ELNINE_API_BASE') ?? 'https://api.elnine.com.ar'
    ).replace(/\/$/, '');
  }

  /**
   * Trae los partidos del Mundial que elnine tiene cacheados como "activos"
   * (GET /matches devuelve grupos por torneo). Best-effort: ante cualquier
   * fallo devuelve [] para no romper el overlay. El filtrado por estado
   * (live/finished) lo hace LiveService.
   */
  async getWorldCupMatches(): Promise<ElnineMatch[]> {
    const url = `${this.base}/matches`;
    try {
      const res = await firstValueFrom(
        this.http.get<ElnineMatchesResponse>(url, {
          timeout: 15000,
          headers: { Accept: 'application/json' },
        }),
      );
      const groups = res.data?.items ?? [];
      const wc = groups.find((g) => g.tournamentCalendarSlug === WORLD_CUP_SLUG);
      return wc?.matches ?? [];
    } catch (err) {
      this.logger.warn(`Fallo GET ${url}: ${(err as Error).message}`);
      return [];
    }
  }
}
