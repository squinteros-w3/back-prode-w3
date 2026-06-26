import { Injectable } from '@nestjs/common';
import { GroupsService, StandingRow } from '../groups/groups.service';
import { PrismaService } from '../prisma/prisma.service';
import { stadiumCity } from '../worldcup/stadiums';
import {
  BracketStage,
  SlotRef,
  TemplateMatch,
  WC2026_BRACKET,
} from './bracket-template';

export interface BracketTeam {
  id: string;
  name: string;
  code: string | null;
  flagUrl: string | null;
}

export interface BracketSlot {
  /** Equipo ya definido (posición de grupo resuelta o ganador de partido). */
  team: BracketTeam | null;
  /** Etiqueta del cruce cuando el equipo aún no está definido. */
  label: string | null;
  score: number | null;
  penalties: number | null;
}

export interface BracketMatch {
  externalId: string;
  stage: BracketStage;
  /** ISO UTC; null mientras el partido no esté cargado en la DB. */
  kickoffAt: string | null;
  /** Ciudad de la sede; null si el partido aún no está cargado en la DB. */
  city: string | null;
  status: 'SCHEDULED' | 'FINISHED';
  home: BracketSlot;
  away: BracketSlot;
}

const STAGE_ORDER: Record<BracketStage, number> = {
  r32: 1,
  r16: 2,
  qf: 3,
  sf: 4,
  third: 5,
  final: 6,
};

@Injectable()
export class BracketService {
  // Cache en memoria con TTL corto. Ahora el cuadro se arma 100% desde la DB
  // (standings + resultados), así que esto solo evita recomputar en ráfagas de
  // requests; ya no hay ninguna llamada a la API externa en el render.
  private cache: { at: number; data: BracketMatch[] } | null = null;
  private readonly ttlMs = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
  ) {}

  async getBracket(): Promise<BracketMatch[]> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) {
      return this.cache.data;
    }

    const [standings, dbMatches] = await Promise.all([
      this.groups.getStandings(),
      this.prisma.match.findMany({
        where: { stage: { not: 'group' } },
        include: { homeTeam: true, awayTeam: true },
      }),
    ]);

    // Posiciones de grupo, listas solo cuando el grupo terminó de jugarse.
    const groupRows = new Map<string, StandingRow[]>(
      standings.map((g) => [g.group, g.standings]),
    );
    // Partidos de eliminatoria ya cargados (con equipos reales y resultados),
    // indexados por su número FIFA = externalId.
    const dbByExternal = new Map(dbMatches.map((m) => [m.externalId, m]));

    const bracket = WC2026_BRACKET.map<BracketMatch>((t) =>
      this.resolveMatch(t, groupRows, dbByExternal),
    ).sort(
      (a, b) =>
        STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] ||
        Number(a.externalId) - Number(b.externalId),
    );

    this.cache = { at: Date.now(), data: bracket };
    return bracket;
  }

  /**
   * IDs internos de equipo (home/away) ya resueltos para cada cruce de
   * eliminatoria, a partir de standings y ganadores de partidos previos.
   * Solo incluye los cruces donde AMBOS lados están definidos.
   *
   * Lo usa el sync: la API entrega los partidos de eliminatoria con su fecha
   * pero con equipo "0" hasta que termina la fase de grupos, así que sin esto
   * nunca se crearían en la DB y no se les podría cargar resultado. Con esto la
   * fila se crea (con su fecha) apenas el cruce queda definido, igual que el cuadro.
   */
  async resolveKnockoutTeamIds(): Promise<
    Map<string, { homeTeamId: string; awayTeamId: string }>
  > {
    const [standings, dbMatches] = await Promise.all([
      this.groups.getStandings(),
      this.prisma.match.findMany({
        where: { stage: { not: 'group' } },
        include: { homeTeam: true, awayTeam: true },
      }),
    ]);
    const groupRows = new Map<string, StandingRow[]>(
      standings.map((g) => [g.group, g.standings]),
    );
    const dbByExternal = new Map(dbMatches.map((m) => [m.externalId, m]));

    const resolved = new Map<string, { homeTeamId: string; awayTeamId: string }>();
    for (const t of WC2026_BRACKET) {
      const home = this.resolveSlot(t.home, groupRows, dbByExternal);
      const away = this.resolveSlot(t.away, groupRows, dbByExternal);
      if (home.team && away.team) {
        resolved.set(String(t.number), {
          homeTeamId: home.team.id,
          awayTeamId: away.team.id,
        });
      }
    }
    return resolved;
  }

  /** Arma un cruce: si ya está en la DB usa ese dato; si no, lo resuelve. */
  private resolveMatch(
    t: TemplateMatch,
    groupRows: Map<string, StandingRow[]>,
    dbByExternal: Map<string, DbMatch>,
  ): BracketMatch {
    const db = dbByExternal.get(String(t.number));

    // Partido ya cargado: la DB es autoritativa (equipos, marcador, penales).
    if (db) {
      return {
        externalId: String(t.number),
        stage: t.stage,
        kickoffAt: db.kickoffAt.toISOString(),
        city: stadiumCity(db.stadiumId),
        status: db.status,
        home: this.dbSlot(db.homeTeam, db.homeScore, db.homePenalties),
        away: this.dbSlot(db.awayTeam, db.awayScore, db.awayPenalties),
      };
    }

    // Todavía sin cargar: resolvemos cada slot desde standings / ganadores.
    return {
      externalId: String(t.number),
      stage: t.stage,
      kickoffAt: null,
      city: null,
      status: 'SCHEDULED',
      home: this.resolveSlot(t.home, groupRows, dbByExternal),
      away: this.resolveSlot(t.away, groupRows, dbByExternal),
    };
  }

  private resolveSlot(
    ref: SlotRef,
    groupRows: Map<string, StandingRow[]>,
    dbByExternal: Map<string, DbMatch>,
  ): BracketSlot {
    switch (ref.kind) {
      case 'groupWinner':
        return this.groupSlot(groupRows, ref.group, 0, `1º Grupo ${ref.group}`);
      case 'groupRunnerUp':
        return this.groupSlot(groupRows, ref.group, 1, `2º Grupo ${ref.group}`);
      case 'bestThird':
        // Fase 1: la asignación de los mejores terceros (tabla FIFA) llega luego.
        return this.labelSlot(`Mejor 3º (${ref.groups.join('/')})`);
      case 'matchWinner': {
        const team = this.matchOutcome(dbByExternal, ref.match, 'winner');
        return team
          ? this.teamSlot(team)
          : this.labelSlot(`Ganador Partido ${ref.match}`);
      }
      case 'matchLoser': {
        const team = this.matchOutcome(dbByExternal, ref.match, 'loser');
        return team
          ? this.teamSlot(team)
          : this.labelSlot(`Perdedor Partido ${ref.match}`);
      }
    }
  }

  /** Posición de grupo: solo se resuelve cuando el grupo terminó de jugarse. */
  private groupSlot(
    groupRows: Map<string, StandingRow[]>,
    group: string,
    index: 0 | 1,
    label: string,
  ): BracketSlot {
    const rows = groupRows.get(group);
    const complete =
      !!rows && rows.length >= 4 && rows.every((r) => r.mp === 3);
    const row = complete ? rows[index] : undefined;
    return row ? this.teamSlot(row.team) : this.labelSlot(label);
  }

  /** Ganador/perdedor de un partido ya finalizado (incluye definición por penales). */
  private matchOutcome(
    dbByExternal: Map<string, DbMatch>,
    matchNumber: number,
    which: 'winner' | 'loser',
  ): BracketTeam | null {
    const m = dbByExternal.get(String(matchNumber));
    if (!m || m.status !== 'FINISHED' || m.homeScore === null || m.awayScore === null) {
      return null;
    }

    let homeWins: boolean | null = null;
    if (m.homeScore > m.awayScore) homeWins = true;
    else if (m.awayScore > m.homeScore) homeWins = false;
    else if (m.homePenalties !== null && m.awayPenalties !== null) {
      if (m.homePenalties > m.awayPenalties) homeWins = true;
      else if (m.awayPenalties > m.homePenalties) homeWins = false;
    }
    if (homeWins === null) return null; // empate sin penales cargados todavía

    const wantHome = which === 'winner' ? homeWins : !homeWins;
    return this.toTeam(wantHome ? m.homeTeam : m.awayTeam);
  }

  private dbSlot(
    team: TeamRecord,
    score: number | null,
    penalties: number | null,
  ): BracketSlot {
    return { team: this.toTeam(team), label: null, score, penalties };
  }

  private teamSlot(team: BracketTeam): BracketSlot {
    return { team, label: null, score: null, penalties: null };
  }

  private labelSlot(label: string): BracketSlot {
    return { team: null, label, score: null, penalties: null };
  }

  private toTeam(t: TeamRecord): BracketTeam {
    return { id: t.id, name: t.name, code: t.code, flagUrl: t.flagUrl };
  }
}

interface TeamRecord {
  id: string;
  name: string;
  code: string | null;
  flagUrl: string | null;
}

interface DbMatch {
  externalId: string;
  status: 'SCHEDULED' | 'FINISHED';
  kickoffAt: Date;
  stadiumId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homePenalties: number | null;
  awayPenalties: number | null;
  homeTeam: TeamRecord;
  awayTeam: TeamRecord;
}
