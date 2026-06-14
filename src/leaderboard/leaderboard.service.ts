import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LeaderboardEntry {
  rank: number;
  user: { id: string; name: string; avatarUrl: string | null };
  points: number;
  exacts: number;
  /** Solo ganador/empate acertado (+1). NO incluye los exactos. */
  outcomes: number;
  /**
   * Partidos finalizados que NO acertó: predijo mal o no predijo.
   * Se cumple siempre: exacts + outcomes + misses = partidos finalizados.
   */
  misses: number;
  predictions: number;
}

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const [users, sums, exacts, outcomes, finishedMatches] = await Promise.all([
      this.prisma.user.findMany({
        select: { id: true, name: true, avatarUrl: true },
      }),
      this.prisma.prediction.groupBy({
        by: ['userId'],
        _sum: { pointsAwarded: true },
        _count: { _all: true },
      }),
      this.prisma.prediction.groupBy({
        by: ['userId'],
        where: { isExact: true },
        _count: { _all: true },
      }),
      // Solo los +1: acertó ganador/empate pero no el marcador exacto.
      this.prisma.prediction.groupBy({
        by: ['userId'],
        where: { pointsAwarded: { gt: 0 }, isExact: false },
        _count: { _all: true },
      }),
      // Total de partidos jugados: la base para calcular los fallados.
      this.prisma.match.count({ where: { status: 'FINISHED' } }),
    ]);

    const sumByUser = new Map(
      sums.map((s) => [
        s.userId,
        { points: s._sum.pointsAwarded ?? 0, predictions: s._count._all },
      ]),
    );
    const exactByUser = new Map(exacts.map((e) => [e.userId, e._count._all]));
    const outcomeByUser = new Map(
      outcomes.map((o) => [o.userId, o._count._all]),
    );

    const entries = users
      .map((u) => {
        const agg = sumByUser.get(u.id);
        const userExacts = exactByUser.get(u.id) ?? 0;
        const userOutcomes = outcomeByUser.get(u.id) ?? 0;
        return {
          user: u,
          points: agg?.points ?? 0,
          exacts: userExacts,
          outcomes: userOutcomes,
          // Un finalizado sin acertar (mal o sin predecir) cuenta como fallo.
          misses: finishedMatches - userExacts - userOutcomes,
          predictions: agg?.predictions ?? 0,
        };
      })
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.exacts - a.exacts ||
          a.user.name.localeCompare(b.user.name),
      );

    return entries.map((e, i) => ({ rank: i + 1, ...e }));
  }
}
