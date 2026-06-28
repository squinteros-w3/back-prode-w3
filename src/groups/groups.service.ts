import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface StandingRow {
  team: { id: string; name: string; code: string | null; flagUrl: string | null };
  mp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

export interface GroupStanding {
  group: string;
  standings: StandingRow[];
}

export interface ThirdPlaceRow extends StandingRow {
  group: string;
  /** Posición entre los 12 terceros (1 = mejor). */
  rank: number;
  /** Cae dentro de los 8 que clasifican (provisorio hasta cerrar la fase). */
  qualified: boolean;
}

export interface ThirdPlaceRanking {
  /** True cuando los 12 grupos terminaron de jugar (ranking definitivo). */
  complete: boolean;
  rows: ThirdPlaceRow[];
}

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Calcula la tabla de cada grupo a partir de los partidos FINALIZADOS. */
  async getStandings(): Promise<GroupStanding[]> {
    const [teams, matches] = await Promise.all([
      this.prisma.team.findMany({ where: { group: { not: null } } }),
      this.prisma.match.findMany({
        where: {
          status: 'FINISHED',
          group: { not: null },
          homeScore: { not: null },
          awayScore: { not: null },
        },
      }),
    ]);

    const rows = new Map<string, StandingRow & { group: string }>();
    for (const t of teams) {
      rows.set(t.id, {
        team: { id: t.id, name: t.name, code: t.code, flagUrl: t.flagUrl },
        group: t.group as string,
        mp: 0,
        w: 0,
        d: 0,
        l: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0,
      });
    }

    for (const m of matches) {
      const h = rows.get(m.homeTeamId);
      const a = rows.get(m.awayTeamId);
      if (!h || !a) continue;
      const hs = m.homeScore as number;
      const as = m.awayScore as number;
      h.mp++;
      a.mp++;
      h.gf += hs;
      h.ga += as;
      a.gf += as;
      a.ga += hs;
      if (hs > as) {
        h.w++;
        h.pts += 3;
        a.l++;
      } else if (hs < as) {
        a.w++;
        a.pts += 3;
        h.l++;
      } else {
        h.d++;
        a.d++;
        h.pts++;
        a.pts++;
      }
    }

    const byGroup = new Map<string, (StandingRow & { group: string })[]>();
    for (const r of rows.values()) {
      r.gd = r.gf - r.ga;
      const arr = byGroup.get(r.group) ?? [];
      arr.push(r);
      byGroup.set(r.group, arr);
    }

    return [...byGroup.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, list]) => ({
        group,
        standings: list
          .sort(
            (x, y) =>
              y.pts - x.pts ||
              y.gd - x.gd ||
              y.gf - x.gf ||
              x.team.name.localeCompare(y.team.name),
          )
          .map(({ group: _g, ...row }) => row),
      }));
  }

  /**
   * Ranking de los terceros de cada grupo (los 8 mejores clasifican a 16avos).
   * Se calcula desde las tablas de grupo y se actualiza partido a partido.
   * Criterios FIFA: puntos → diferencia de gol → goles a favor.
   */
  async getThirdPlaceRanking(
    precomputed?: GroupStanding[],
  ): Promise<ThirdPlaceRanking> {
    const standings = precomputed ?? (await this.getStandings());

    // El tercero de cada grupo (índice 2). Un grupo aporta su tercero recién
    // cuando tiene los 4 equipos cargados.
    const thirds = standings
      .filter((g) => g.standings.length >= 3)
      .map((g) => ({ group: g.group, row: g.standings[2] }));

    const complete =
      standings.length > 0 &&
      standings.every((g) => g.standings.every((s) => s.mp === 3));

    const rows = thirds
      .sort(
        (a, b) =>
          b.row.pts - a.row.pts ||
          b.row.gd - a.row.gd ||
          b.row.gf - a.row.gf ||
          a.row.team.name.localeCompare(b.row.team.name),
      )
      .map<ThirdPlaceRow>(({ group, row }, i) => ({
        ...row,
        group,
        rank: i + 1,
        qualified: i < 8,
      }));

    return { complete, rows };
  }
}
