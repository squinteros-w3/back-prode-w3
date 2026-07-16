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
  // Definición por penales (solo eliminación con empate). Ausentes si no hubo
  // tanda; la API los provee como string numérico ("4", "3").
  home_penalty_score?: string;
  away_penalty_score?: string;
  // Etiquetas del cruce cuando el equipo aún no está definido (eliminatoria).
  // Ej: "Winner Group A", "Runner-up Group B", "3rd Group A/B/C/D/F",
  // "Winner Match 73", "Loser Match 101".
  home_team_label?: string;
  away_team_label?: string;
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
