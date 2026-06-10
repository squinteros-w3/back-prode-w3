import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ScoreResult {
  points: number;
  isExact: boolean;
}

export const POINTS_EXACT = 3;
export const POINTS_OUTCOME = 1;

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Puntaje: resultado exacto = 3, ganador/empate acertado (sin ser exacto) = 1, errado = 0.
   */
  computePoints(
    predHome: number,
    predAway: number,
    realHome: number,
    realAway: number,
  ): ScoreResult {
    if (predHome === realHome && predAway === realAway) {
      return { points: POINTS_EXACT, isExact: true };
    }
    if (this.outcome(predHome, predAway) === this.outcome(realHome, realAway)) {
      return { points: POINTS_OUTCOME, isExact: false };
    }
    return { points: 0, isExact: false };
  }

  private outcome(home: number, away: number): -1 | 0 | 1 {
    if (home > away) return 1;
    if (home < away) return -1;
    return 0;
  }

  /**
   * Recalcula (idempotente) los puntos de todas las predicciones de un partido
   * finalizado. Se invoca desde el sync o desde una correccion manual del admin.
   */
  async scoreMatch(matchId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId } });
      if (
        !match ||
        match.status !== 'FINISHED' ||
        match.homeScore === null ||
        match.awayScore === null
      ) {
        return;
      }
      const predictions = await tx.prediction.findMany({ where: { matchId } });
      for (const p of predictions) {
        const { points, isExact } = this.computePoints(
          p.homeScore,
          p.awayScore,
          match.homeScore,
          match.awayScore,
        );
        if (p.pointsAwarded !== points || p.isExact !== isExact) {
          await tx.prediction.update({
            where: { id: p.id },
            data: { pointsAwarded: points, isExact },
          });
        }
      }
      this.logger.log(
        `Partido ${matchId} puntuado: ${predictions.length} predicciones`,
      );
    });
  }
}
