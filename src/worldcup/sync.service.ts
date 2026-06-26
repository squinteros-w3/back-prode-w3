import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MatchStatus } from '@prisma/client';
import { BracketService } from '../matches/bracket.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { spanishTeamName } from './team-names';
import { parseLocalDateToUtc } from './timezone';
import { RawGame, WorldCupApiService } from './worldcup-api.service';

export interface SyncSummary {
  teams: number;
  matches: number;
  scored: number;
  skipped: number;
}

@Injectable()
export class SyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SyncService.name);
  private running = false;

  constructor(
    private readonly api: WorldCupApiService,
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    private readonly config: ConfigService,
    private readonly bracket: BracketService,
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

  // Sync cada 5 minutos (resultados casi en vivo durante el torneo).
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'sync-tick' })
  async syncTick(): Promise<void> {
    await this.safeSync('cron 5min');
  }

  private async safeSync(reason: string): Promise<void> {
    try {
      const s = await this.sync();
      // Para no inundar los logs (corre cada minuto), solo loguea si hubo cambios.
      if (s.scored > 0) {
        this.logger.log(
          `Sync (${reason}): ${s.matches} partidos, ${s.scored} puntuados`,
        );
      } else {
        this.logger.debug(`Sync (${reason}) ok sin cambios`);
      }
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
        const name = spanishTeamName(t.name_en);
        const team = await this.prisma.team.upsert({
          where: { externalId: t.id },
          create: {
            externalId: t.id,
            name,
            code: t.fifa_code ?? null,
            group: t.groups ?? null,
            flagUrl: t.flag ?? null,
          },
          update: {
            name,
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
          manualResult: true,
        },
      });
      const prevByExternal = new Map(existing.map((m) => [m.externalId, m]));

      const counters = { matches: 0, skipped: 0 };
      const toScore: string[] = [];
      const toUnscore: string[] = [];

      const processGame = async (
        g: RawGame,
        koTeams: Map<string, { homeTeamId: string; awayTeamId: string }>,
      ): Promise<void> => {
        let homeTeamId = teamIdByExternal.get(g.home_team_id);
        let awayTeamId = teamIdByExternal.get(g.away_team_id);
        const kickoffAt = parseLocalDateToUtc(
          g.local_date,
          g.stadium_id,
          fallbackTz,
        );

        // Eliminatoria: la API manda el partido con su fecha pero con equipo "0"
        // hasta que termina la fase de grupos. Resolvemos el cruce desde
        // standings / ganadores previos (igual que el cuadro) para crear la fila
        // con su fecha apenas ambos lados estén definidos, y así poder cargarle
        // resultado. Los terceros (3º de grupo) se resuelven cuando se implemente
        // su asignación FIFA; hasta entonces esos cruces siguen sin crearse.
        if ((!homeTeamId || !awayTeamId) && g.type && g.type !== 'group') {
          const r = koTeams.get(g.id);
          if (r) {
            homeTeamId = homeTeamId ?? r.homeTeamId;
            awayTeamId = awayTeamId ?? r.awayTeamId;
          }
        }

        if (!homeTeamId || !awayTeamId || !kickoffAt) {
          counters.skipped++;
          return;
        }

        const finished = g.finished?.toUpperCase() === 'TRUE';
        const status = finished ? MatchStatus.FINISHED : MatchStatus.SCHEDULED;
        const homeScore = finished ? this.toInt(g.home_score) : null;
        const awayScore = finished ? this.toInt(g.away_score) : null;
        const matchday = Number.isFinite(Number(g.matchday))
          ? Number(g.matchday)
          : null;

        // Si el admin cargó el resultado a mano, el sync actualiza los metadatos
        // (equipos, horario, fase) pero NO pisa el marcador ni el estado.
        const prev = prevByExternal.get(g.id);
        const protectResult = prev?.manualResult === true;
        const metadata = {
          homeTeamId,
          awayTeamId,
          kickoffAt,
          stage: g.type || 'group',
          group: g.group || null,
          matchday,
        };
        const resultData = { status, homeScore, awayScore };
        // Snapshot de lo que reporta la API (para trazabilidad y aviso de
        // discrepancia). Se guarda SIEMPRE, incluso si protegemos el resultado.
        const apiSnapshot = { apiHomeScore: homeScore, apiAwayScore: awayScore };

        const saved = await this.prisma.match.upsert({
          where: { externalId: g.id },
          create: { externalId: g.id, ...metadata, ...resultData, ...apiSnapshot },
          update: protectResult
            ? { ...metadata, ...apiSnapshot }
            : { ...metadata, ...resultData, ...apiSnapshot },
        });
        counters.matches++;

        if (protectResult) {
          // El resultado lo maneja el admin: no re-puntuar ni revertir.
          return;
        }

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
      };

      // Dos pasadas: primero los partidos de grupo (definen las posiciones) y
      // después los de eliminatoria, resolviendo sus cruces con los resultados
      // de grupo de ESTE mismo sync (no del anterior).
      const groupGames = rawGames.filter((g) => !g.type || g.type === 'group');
      const koGames = rawGames.filter((g) => g.type && g.type !== 'group');
      const noKo = new Map<string, { homeTeamId: string; awayTeamId: string }>();
      for (const g of groupGames) await processGame(g, noKo);
      const koTeams = await this.bracket.resolveKnockoutTeamIds();
      for (const g of koGames) await processGame(g, koTeams);
      const { matches, skipped } = counters;

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
