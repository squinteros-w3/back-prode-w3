import { Injectable } from '@nestjs/common';
import { getLockInfo } from '../common/lock.util';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista de partidos con equipos, estado de bloqueo y la prediccion del usuario. */
  async listForUser(userId: string) {
    const matches = await this.prisma.match.findMany({
      include: {
        homeTeam: true,
        awayTeam: true,
        predictions: { where: { userId } },
      },
      orderBy: { kickoffAt: 'asc' },
    });

    const now = new Date();
    return matches.map((m) => {
      const { locksAt, locked } = getLockInfo(m.kickoffAt, now);
      const prediction = m.predictions[0] ?? null;
      return {
        id: m.id,
        externalId: m.externalId,
        stage: m.stage,
        group: m.group,
        matchday: m.matchday,
        kickoffAt: m.kickoffAt,
        status: m.status,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        locksAt,
        locked,
        homeTeam: this.team(m.homeTeam),
        awayTeam: this.team(m.awayTeam),
        prediction: prediction
          ? {
              homeScore: prediction.homeScore,
              awayScore: prediction.awayScore,
              pointsAwarded: prediction.pointsAwarded,
              isExact: prediction.isExact,
            }
          : null,
      };
    });
  }

  private team(t: {
    id: string;
    name: string;
    code: string | null;
    group: string | null;
    flagUrl: string | null;
  }) {
    return {
      id: t.id,
      name: t.name,
      code: t.code,
      group: t.group,
      flagUrl: t.flagUrl,
    };
  }
}
