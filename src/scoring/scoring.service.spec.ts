import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from './scoring.service';

describe('ScoringService.computePoints', () => {
  const service = new ScoringService({} as unknown as PrismaService);

  it('da 3 puntos por resultado exacto', () => {
    expect(service.computePoints(2, 1, 2, 1)).toEqual({
      points: 3,
      isExact: true,
    });
  });

  it('da 3 puntos por empate exacto', () => {
    expect(service.computePoints(1, 1, 1, 1)).toEqual({
      points: 3,
      isExact: true,
    });
  });

  it('da 1 punto por acertar ganador sin ser exacto', () => {
    expect(service.computePoints(2, 0, 3, 1)).toEqual({
      points: 1,
      isExact: false,
    });
  });

  it('da 1 punto por acertar empate sin ser exacto', () => {
    expect(service.computePoints(0, 0, 2, 2)).toEqual({
      points: 1,
      isExact: false,
    });
  });

  it('da 0 puntos por errar el resultado', () => {
    expect(service.computePoints(2, 1, 0, 1)).toEqual({
      points: 0,
      isExact: false,
    });
  });

  describe('eliminación con penales', () => {
    const ko = (predictedWinner: 'HOME' | 'AWAY', pHome: number, pAway: number) => ({
      isKnockout: true,
      predictedWinner,
      realHomePenalties: pHome,
      realAwayPenalties: pAway,
    });

    it('da 5 puntos por empate exacto + ganador de penales acertado', () => {
      expect(service.computePoints(2, 2, 2, 2, ko('HOME', 4, 3))).toEqual({
        points: 5,
        isExact: true,
      });
    });

    it('da 3 puntos por empate exacto pero ganador de penales errado', () => {
      expect(service.computePoints(2, 2, 2, 2, ko('HOME', 3, 4))).toEqual({
        points: 3,
        isExact: true,
      });
    });

    it('da 1 punto por empate inexacto, sin bonus aunque acierte el ganador', () => {
      expect(service.computePoints(2, 2, 1, 1, ko('HOME', 5, 4))).toEqual({
        points: 1,
        isExact: false,
      });
    });

    it('no aplica bonus si no se cargaron penales', () => {
      expect(
        service.computePoints(2, 2, 2, 2, {
          isKnockout: true,
          predictedWinner: 'HOME',
          realHomePenalties: null,
          realAwayPenalties: null,
        }),
      ).toEqual({ points: 3, isExact: true });
    });

    it('no aplica bonus en fase de grupos', () => {
      expect(
        service.computePoints(2, 2, 2, 2, {
          isKnockout: false,
          predictedWinner: 'HOME',
          realHomePenalties: 4,
          realAwayPenalties: 3,
        }),
      ).toEqual({ points: 3, isExact: true });
    });
  });
});
