import { Injectable } from '@nestjs/common';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { PrismaService } from '../prisma/prisma.service';

export interface Medal {
  id: string;
  label: string;
  description: string;
  earned: boolean;
}

export interface UserStats {
  totalPoints: number;
  exactCount: number;
  outcomeCount: number;
  scoredPredictions: number;
  totalPredictions: number;
  bestStreak: number;
  rank: number | null;
  totalPlayers: number;
  medals: Medal[];
}

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  async getForUser(userId: string): Promise<UserStats> {
    const predictions = await this.prisma.prediction.findMany({
      where: { userId },
      include: { match: { select: { status: true, kickoffAt: true } } },
      orderBy: { match: { kickoffAt: 'asc' } },
    });

    let totalPoints = 0;
    let exactCount = 0;
    let outcomeCount = 0;
    let scoredPredictions = 0;
    let bestStreak = 0;
    let currentStreak = 0;

    for (const p of predictions) {
      const finished = p.match.status === 'FINISHED';
      if (finished) {
        scoredPredictions++;
        totalPoints += p.pointsAwarded;
        if (p.isExact) {
          exactCount++;
          currentStreak++;
          bestStreak = Math.max(bestStreak, currentStreak);
        } else {
          currentStreak = 0;
          if (p.pointsAwarded > 0) outcomeCount++;
        }
      }
    }

    const board = await this.leaderboard.getLeaderboard();
    const entry = board.find((e) => e.user.id === userId);

    return {
      totalPoints,
      exactCount,
      outcomeCount,
      scoredPredictions,
      totalPredictions: predictions.length,
      bestStreak,
      rank: entry?.rank ?? null,
      totalPlayers: board.length,
      medals: this.buildMedals({
        totalPoints,
        exactCount,
        bestStreak,
        totalPredictions: predictions.length,
      }),
    };
  }

  private buildMedals(s: {
    totalPoints: number;
    exactCount: number;
    bestStreak: number;
    totalPredictions: number;
  }): Medal[] {
    return [
      {
        id: 'debut',
        label: 'Debut',
        description: 'Cargaste tu primera predicción',
        earned: s.totalPredictions >= 1,
      },
      {
        id: 'primer-acierto',
        label: 'Primer acierto',
        description: 'Acertaste un resultado exacto',
        earned: s.exactCount >= 1,
      },
      {
        id: 'francotirador',
        label: 'Francotirador',
        description: '5 resultados exactos',
        earned: s.exactCount >= 5,
      },
      {
        id: 'oraculo',
        label: 'Oráculo',
        description: '10 resultados exactos',
        earned: s.exactCount >= 10,
      },
      {
        id: 'en-racha',
        label: 'En racha',
        description: '3 exactos seguidos',
        earned: s.bestStreak >= 3,
      },
      {
        id: 'centurion',
        label: 'Centurión',
        description: '30 puntos acumulados',
        earned: s.totalPoints >= 30,
      },
    ];
  }
}
