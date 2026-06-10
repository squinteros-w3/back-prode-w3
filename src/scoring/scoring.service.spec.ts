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
});
