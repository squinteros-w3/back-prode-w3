import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { ElnineMatch, ElnineMatchesResponse } from './elnine.types';

// Slug del Mundial en elnine (Stats Perform). Constante estable.
const WORLD_CUP_SLUG = 'fifa-world-cup';

// elnine está detrás de Cloudflare y rebota (403) las requests "de bot" (UA
// axios/sin headers de navegador), típico desde IPs de datacenter como Railway.
// Imitamos al front que la consume (elnine.com.ar) para pasar el Bot Fight Mode.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
  Origin: 'https://elnine.com.ar',
  Referer: 'https://elnine.com.ar/',
};

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
          headers: BROWSER_HEADERS,
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
