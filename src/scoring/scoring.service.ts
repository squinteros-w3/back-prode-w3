import { Injectable, Logger } from '@nestjs/common';
import { PenaltyWinner } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ScoreResult {
  points: number;
  isExact: boolean;
}

/**
 * Contexto de eliminación: solo aplica cuando el cruce puede ir a penales.
 * - `predictedWinner`: lado que el usuario eligió al pronosticar un empate.
 * - `realHomePenalties`/`realAwayPenalties`: penales reales cargados por el admin.
 */
export interface KnockoutContext {
  isKnockout: boolean;
  predictedWinner: PenaltyWinner | null;
  realHomePenalties: number | null;
  realAwayPenalties: number | null;
}

export const POINTS_EXACT = 3;
export const POINTS_OUTCOME = 1;
export const POINTS_PENALTY_WINNER = 2;

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Puntaje: resultado exacto = 3, ganador/empate acertado (sin ser exacto) = 1, errado = 0.
   *
   * En eliminación, si se acierta el EMPATE EXACTO y además el ganador por
   * penales elegido coincide con el real, se suman +2 (total 5). El bonus solo
   * aplica con empate exacto: un empate inexacto sigue valiendo 1.
   */
  computePoints(
    predHome: number,
    predAway: number,
    realHome: number,
    realAway: number,
    knockout?: KnockoutContext,
  ): ScoreResult {
    if (predHome === realHome && predAway === realAway) {
      const bonus = this.penaltyBonus(realHome, realAway, knockout);
      return { points: POINTS_EXACT + bonus, isExact: true };
    }
    if (this.outcome(predHome, predAway) === this.outcome(realHome, realAway)) {
      return { points: POINTS_OUTCOME, isExact: false };
    }
    return { points: 0, isExact: false };
  }

  /**
   * +2 si: es eliminación, el resultado real fue empate (definido por penales),
   * el usuario eligió un ganador y coincide con quien ganó los penales.
   */
  private penaltyBonus(
    realHome: number,
    realAway: number,
    knockout?: KnockoutContext,
  ): number {
    if (!knockout?.isKnockout || realHome !== realAway) return 0;
    if (!knockout.predictedWinner) return 0;
    const { realHomePenalties: ph, realAwayPenalties: pa } = knockout;
    if (ph === null || pa === null || ph === pa) return 0;
    const realWinner: PenaltyWinner = ph > pa ? 'HOME' : 'AWAY';
    return knockout.predictedWinner === realWinner ? POINTS_PENALTY_WINNER : 0;
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
      const isKnockout = match.stage !== 'group';
      const predictions = await tx.prediction.findMany({ where: { matchId } });
      for (const p of predictions) {
        const { points, isExact } = this.computePoints(
          p.homeScore,
          p.awayScore,
          match.homeScore,
          match.awayScore,
          {
            isKnockout,
            predictedWinner: p.penaltyWinner,
            realHomePenalties: match.homePenalties,
            realAwayPenalties: match.awayPenalties,
          },
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
