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
        homePenalties: m.homePenalties,
        awayPenalties: m.awayPenalties,
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

  /**
   * Desglose de un partido finalizado: quién predijo qué y cuánto sumó.
   * Ordenado por puntos desc (exactos primero) y luego por nombre.
   * Para partidos no finalizados devuelve `available: false`.
   */
  async resultsForMatch(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { predictions: { include: { user: true } } },
    });

    if (!match || match.status !== 'FINISHED') {
      return { available: false as const };
    }

    const predictions = match.predictions
      .map((p) => ({
        user: {
          id: p.user.id,
          name: p.user.name,
          avatarUrl: p.user.avatarUrl,
        },
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        points: p.pointsAwarded,
        isExact: p.isExact,
      }))
      .sort(
        (a, b) =>
          b.points - a.points || a.user.name.localeCompare(b.user.name),
      );

    return {
      available: true as const,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      predictions,
    };
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
