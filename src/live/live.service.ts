import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ElnineApiService } from './elnine-api.service';
import { normalizeTeamName, pairKey } from './team-match.util';

export interface LiveGoal {
  team: 'home' | 'away'; // orientado a NUESTRO home/away
  player: string;
  minute: number | null;
  addedMinute?: number;
  ownGoal?: boolean;
  penalty?: boolean;
}

export interface LiveState {
  matchId: string; // id interno de nuestro Match
  status: 'live' | 'finished';
  minute: number | null;
  period: string; // 1T | HT | 2T | FT | ...
  homeScore: number;
  awayScore: number;
  goals: LiveGoal[];
  fetchedAt: number;
}

const DEFAULT_POLL_MS = 60_000;
const MIN_POLL_MS = 60_000;
const GRACE_MS = 10 * 60_000; // cuánto retenemos un estado tras dejar de verlo
const WINDOW_BEFORE_MS = 15 * 60_000; // tolerancia antes del kickoff
const WINDOW_AFTER_MS = 3 * 60 * 60_000; // ventana tras el kickoff

interface WindowMatch {
  id: string;
  liveExternalId: string | null;
  homeName: string;
  awayName: string;
}

/**
 * Overlay de marcador en vivo basado en elnine. Es efímero (cache en memoria),
 * no toca scoring ni resultados: la fuente de verdad sigue siendo worldcup26.
 * Si esta carpeta se borra, no queda rastro salvo la columna nullable
 * Match.liveExternalId.
 */
@Injectable()
export class LiveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveService.name);
  private readonly cache = new Map<string, LiveState>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly elnine: ElnineApiService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Overlay de vivo deshabilitado (LIVE_ENABLED=false)');
      return;
    }
    const ms = this.pollMs;
    // Primer tick inmediato para no dejar la cache vacía ~90s tras cada reinicio
    // (solo consulta elnine si hay partidos en ventana, así que en frío no cuesta).
    void this.tick();
    this.timer = setInterval(() => void this.tick(), ms);
    this.logger.log(
      `Overlay de vivo activo (poll a elnine cada ${Math.round(ms / 1000)}s)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Estados de vivo vigentes, indexados por id interno de Match. */
  getActive(): Record<string, LiveState> {
    this.prune();
    return Object.fromEntries(this.cache);
  }

  private get enabled(): boolean {
    return this.config.get<string>('LIVE_ENABLED') !== 'false';
  }

  private get pollMs(): number {
    const raw = Number(this.config.get<string>('ELNINE_POLL_MS'));
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_POLL_MS;
    return Math.max(MIN_POLL_MS, raw);
  }

  private prune(): void {
    const cutoff = Date.now() - GRACE_MS;
    for (const [id, state] of this.cache) {
      if (state.fetchedAt < cutoff) this.cache.delete(id);
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      this.prune();

      const windowMatches = await this.loadWindowMatches();
      if (windowMatches.length === 0) {
        // Sin partidos en ventana: no consultamos elnine (cero llamadas).
        return;
      }

      const elnineMatches = await this.elnine.getWorldCupMatches();
      if (elnineMatches.length === 0) return;

      const byExternalId = new Map<string, WindowMatch>();
      const byPair = new Map<string, WindowMatch>();
      for (const m of windowMatches) {
        if (m.liveExternalId) byExternalId.set(m.liveExternalId, m);
        byPair.set(pairKey(m.homeName, m.awayName), m);
      }

      const now = Date.now();
      for (const em of elnineMatches) {
        const status = mapStatus(em.status, em.period);
        if (!status) continue; // pre/scheduled/postponed/suspended -> ignorar

        const match =
          byExternalId.get(em.id) ??
          byPair.get(pairKey(em.homeTeam.name, em.awayTeam.name));
        if (!match) continue;

        // Persistir el mapeo una sola vez (cosmético, best-effort).
        if (!match.liveExternalId) {
          match.liveExternalId = em.id;
          await this.persistMapping(match.id, em.id);
        }

        // Orientar el marcador a NUESTRO home/away (por si elnine lo invierte).
        const sameOrientation =
          normalizeTeamName(match.homeName) ===
          normalizeTeamName(em.homeTeam.name);
        const home = em.homeScore ?? 0;
        const away = em.awayScore ?? 0;

        const goals: LiveGoal[] = (em.goals ?? [])
          .map((g) => {
            // contestantId = equipo acreditado (en OG, el beneficiado).
            const elnineHome = g.contestantId === em.homeTeam.id;
            const isOurHome = elnineHome === sameOrientation;
            return {
              team: (isOurHome ? 'home' : 'away') as 'home' | 'away',
              player: g.scorerName,
              minute: g.timeMin,
              addedMinute: g.addedMinute,
              ownGoal: g.type === 'OG',
              penalty: g.type === 'PG',
            };
          })
          .sort(
            (a, b) =>
              (a.minute ?? 0) + (a.addedMinute ?? 0) - ((b.minute ?? 0) + (b.addedMinute ?? 0)),
          );

        this.cache.set(match.id, {
          matchId: match.id,
          status,
          minute: em.minute,
          period: em.period,
          homeScore: sameOrientation ? home : away,
          awayScore: sameOrientation ? away : home,
          goals,
          fetchedAt: now,
        });
      }
    } catch (err) {
      this.logger.warn(`Tick de vivo falló: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Partidos SCHEDULED dentro de la ventana de juego (kickoff -15m .. +3h). */
  private async loadWindowMatches(): Promise<WindowMatch[]> {
    const now = Date.now();
    const rows = await this.prisma.match.findMany({
      where: {
        status: 'SCHEDULED',
        kickoffAt: {
          gte: new Date(now - WINDOW_AFTER_MS),
          lte: new Date(now + WINDOW_BEFORE_MS),
        },
      },
      select: {
        id: true,
        liveExternalId: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      liveExternalId: r.liveExternalId,
      homeName: r.homeTeam.name,
      awayName: r.awayTeam.name,
    }));
  }

  private async persistMapping(
    matchId: string,
    externalId: string,
  ): Promise<void> {
    try {
      await this.prisma.match.update({
        where: { id: matchId },
        data: { liveExternalId: externalId },
      });
    } catch (err) {
      // P2002 (unique) u otra: el overlay sigue mapeando por nombre, no es crítico.
      this.logger.debug(
        `No se pudo persistir liveExternalId=${externalId}: ${(err as Error).message}`,
      );
    }
  }
}

/** Traduce el estado de elnine al nuestro. Devuelve null si no nos interesa. */
function mapStatus(status: string, period: string): 'live' | 'finished' | null {
  if (status === 'live') return 'live';
  if (status === 'finished' || period === 'FT') return 'finished';
  return null;
}
