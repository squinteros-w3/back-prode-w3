import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface RawTeam {
  id: string;
  name_en: string;
  fifa_code: string;
  groups: string;
  flag: string;
}

export interface RawGame {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: string;
  away_score: string;
  group: string;
  matchday: string;
  local_date: string; // "MM/DD/YYYY HH:mm" hora local de la sede
  stadium_id: string;
  finished: string; // "TRUE" | "FALSE"
  type: string; // group | r32 | r16 | qf | sf | third | final
}

@Injectable()
export class WorldCupApiService {
  private readonly logger = new Logger(WorldCupApiService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get base(): string {
    return (
      this.config.get<string>('WORLDCUP_API_BASE') ?? 'https://worldcup26.ir'
    ).replace(/\/$/, '');
  }

  async getTeams(): Promise<RawTeam[]> {
    const data = await this.get<{ teams: RawTeam[] }>('/get/teams');
    return data.teams ?? [];
  }

  async getGames(): Promise<RawGame[]> {
    const data = await this.get<{ games: RawGame[] }>('/get/games');
    return data.games ?? [];
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.base}${path}`;
    try {
      const res = await firstValueFrom(
        this.http.get<T>(url, { timeout: 20000 }),
      );
      return res.data;
    } catch (err) {
      this.logger.error(`Fallo GET ${url}: ${(err as Error).message}`);
      throw err;
    }
  }
}
