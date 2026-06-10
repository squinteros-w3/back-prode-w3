import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LeaderboardEntry {
  rank: number;
  user: { id: string; name: string; avatarUrl: string | null };
  points: number;
  exacts: number;
  predictions: number;
}

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const [users, sums, exacts] = await Promise.all([
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
    ]);

    const sumByUser = new Map(
      sums.map((s) => [
        s.userId,
        { points: s._sum.pointsAwarded ?? 0, predictions: s._count._all },
      ]),
    );
    const exactByUser = new Map(exacts.map((e) => [e.userId, e._count._all]));

    const entries = users
      .map((u) => {
        const agg = sumByUser.get(u.id);
        return {
          user: u,
          points: agg?.points ?? 0,
          exacts: exactByUser.get(u.id) ?? 0,
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
