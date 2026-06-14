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
    const [users, sums, exacts, outcomes, finishedMatches, lastMatch] =
      await Promise.all([
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
        // El último partido disputado: lo usamos para el desempate.
        this.prisma.match.findFirst({
          where: { status: 'FINISHED' },
          orderBy: { kickoffAt: 'desc' },
          select: { kickoffAt: true },
        }),
      ]);

    // Desempate (último escalón): quién dejó fija primero su predicción del
    // último partido disputado. Usamos updatedAt (no createdAt): si dudó y la
    // cambió, su marca se corre más tarde y pierde el desempate. Si la última
    // fecha tuvo partidos simultáneos, vale la predicción más temprana entre ellos.
    const lastPredByUser = new Map<string, Date>();
    if (lastMatch) {
      const lastMatchIds = (
        await this.prisma.match.findMany({
          where: { status: 'FINISHED', kickoffAt: lastMatch.kickoffAt },
          select: { id: true },
        })
      ).map((m) => m.id);
      const lastPreds = await this.prisma.prediction.groupBy({
        by: ['userId'],
        where: { matchId: { in: lastMatchIds } },
        _min: { updatedAt: true },
      });
      for (const p of lastPreds) {
        if (p._min.updatedAt) lastPredByUser.set(p.userId, p._min.updatedAt);
      }
    }

    // Entre dos empatados: el que dejó fija antes su predicción del último
    // partido va arriba; el que no predijo ese partido cae al fondo del empate.
    const tiebreakByLastPrediction = (a: string, b: string): number => {
      const ta = lastPredByUser.get(a);
      const tb = lastPredByUser.get(b);
      if (ta && tb) return ta.getTime() - tb.getTime();
      if (ta) return -1;
      if (tb) return 1;
      return 0;
    };

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
          tiebreakByLastPrediction(a.user.id, b.user.id) ||
          a.user.name.localeCompare(b.user.name),
      );

    return entries.map((e, i) => ({ rank: i + 1, ...e }));
  }
}
