import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { parseLocalDateToUtc } from './timezone';
import { WorldCupApiService } from './worldcup-api.service';

export interface SyncSummary {
  teams: number;
  matches: number;
  scored: number;
  skipped: number;
}

const AR_TZ = 'America/Argentina/Buenos_Aires';

@Injectable()
export class SyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SyncService.name);
  private running = false;

  constructor(
    private readonly api: WorldCupApiService,
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Sync inicial best-effort para poblar datos en el primer arranque.
    try {
      const count = await this.prisma.match.count();
      if (count === 0) {
        this.logger.log('DB vacia: ejecutando sync inicial...');
        await this.sync();
      }
    } catch (err) {
      this.logger.warn(`Sync inicial omitido: ${(err as Error).message}`);
    }
  }

  // Dos syncs diarios en horario argentino: mediodia y noche.
  @Cron('0 12 * * *', { timeZone: AR_TZ, name: 'sync-mediodia' })
  async syncMidday(): Promise<void> {
    await this.safeSync('cron mediodia');
  }

  @Cron('0 23 * * *', { timeZone: AR_TZ, name: 'sync-noche' })
  async syncNight(): Promise<void> {
    await this.safeSync('cron noche');
  }

  private async safeSync(reason: string): Promise<void> {
    try {
      const s = await this.sync();
      this.logger.log(
        `Sync (${reason}) ok: ${s.teams} equipos, ${s.matches} partidos, ${s.scored} puntuados`,
      );
    } catch (err) {
      this.logger.error(`Sync (${reason}) fallo: ${(err as Error).message}`);
    }
  }

  /** Sincroniza equipos y partidos desde worldcup26.ir y dispara el scoring. */
  async sync(): Promise<SyncSummary> {
    if (this.running) {
      this.logger.warn('Sync ya en ejecucion, se ignora la llamada');
      return { teams: 0, matches: 0, scored: 0, skipped: 0 };
    }
    this.running = true;
    try {
      const fallbackTz =
        this.config.get<string>('DEFAULT_SOURCE_TZ') ?? 'America/New_York';

      const [rawTeams, rawGames] = await Promise.all([
        this.api.getTeams(),
        this.api.getGames(),
      ]);

      // 1) Upsert equipos -> mapa externalId -> internal id
      const teamIdByExternal = new Map<string, string>();
      for (const t of rawTeams) {
        const team = await this.prisma.team.upsert({
          where: { externalId: t.id },
          create: {
            externalId: t.id,
            name: t.name_en,
            code: t.fifa_code ?? null,
            group: t.groups ?? null,
            flagUrl: t.flag ?? null,
          },
          update: {
            name: t.name_en,
            code: t.fifa_code ?? null,
            group: t.groups ?? null,
            flagUrl: t.flag ?? null,
          },
        });
        teamIdByExternal.set(t.id, team.id);
      }

      // 2) Estado previo de partidos para detectar cambios y puntuar
      const existing = await this.prisma.match.findMany({
        select: {
          id: true,
          externalId: true,
          status: true,
          homeScore: true,
          awayScore: true,
        },
      });
      const prevByExternal = new Map(existing.map((m) => [m.externalId, m]));

      let matches = 0;
      let skipped = 0;
      const toScore: string[] = [];
      const toUnscore: string[] = [];

      for (const g of rawGames) {
        const homeTeamId = teamIdByExternal.get(g.home_team_id);
        const awayTeamId = teamIdByExternal.get(g.away_team_id);
        const kickoffAt = parseLocalDateToUtc(
          g.local_date,
          g.stadium_id,
          fallbackTz,
        );
        if (!homeTeamId || !awayTeamId || !kickoffAt) {
          skipped++;
          continue;
        }

        const finished = g.finished?.toUpperCase() === 'TRUE';
        const status = finished ? MatchStatus.FINISHED : MatchStatus.SCHEDULED;
        const homeScore = finished ? this.toInt(g.home_score) : null;
        const awayScore = finished ? this.toInt(g.away_score) : null;
        const matchday = Number.isFinite(Number(g.matchday))
          ? Number(g.matchday)
          : null;

        const saved = await this.prisma.match.upsert({
          where: { externalId: g.id },
          create: {
            externalId: g.id,
            homeTeamId,
            awayTeamId,
            kickoffAt,
            stage: g.type || 'group',
            group: g.group || null,
            matchday,
            status,
            homeScore,
            awayScore,
          },
          update: {
            homeTeamId,
            awayTeamId,
            kickoffAt,
            stage: g.type || 'group',
            group: g.group || null,
            matchday,
            status,
            homeScore,
            awayScore,
          },
        });
        matches++;

        const prev = prevByExternal.get(g.id);
        const scoreChanged =
          finished &&
          (prev?.status !== MatchStatus.FINISHED ||
            prev?.homeScore !== homeScore ||
            prev?.awayScore !== awayScore);
        if (scoreChanged) {
          toScore.push(saved.id);
        } else if (!finished && prev?.status === MatchStatus.FINISHED) {
          // El partido dejó de estar finalizado: limpiar puntos para evitar stale.
          toUnscore.push(saved.id);
        }
      }

      for (const matchId of toScore) {
        await this.scoring.scoreMatch(matchId);
      }
      for (const matchId of toUnscore) {
        await this.prisma.prediction.updateMany({
          where: { matchId },
          data: { pointsAwarded: 0, isExact: false },
        });
      }

      return {
        teams: teamIdByExternal.size,
        matches,
        scored: toScore.length,
        skipped,
      };
    } finally {
      this.running = false;
    }
  }

  private toInt(value: string): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }
}
