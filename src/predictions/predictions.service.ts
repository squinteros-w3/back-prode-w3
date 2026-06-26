import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PenaltyWinner, Prediction } from '@prisma/client';
import { getLockInfo } from '../common/lock.util';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPredictionDto } from './dto/upsert-prediction.dto';

@Injectable()
export class PredictionsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    userId: string,
    matchId: string,
    dto: UpsertPredictionDto,
  ): Promise<Prediction> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match) {
      throw new NotFoundException('Partido no encontrado');
    }
    if (getLockInfo(match.kickoffAt).locked) {
      throw new ForbiddenException(
        'Las predicciones se cierran 15 minutos antes del partido',
      );
    }

    // En eliminación, un empate va a penales: el usuario debe elegir un ganador.
    // En grupos (o cuando el pronóstico no es empate) se ignora cualquier valor.
    const isKnockout = match.stage !== 'group';
    const isDraw = dto.homeScore === dto.awayScore;
    let penaltyWinner: PenaltyWinner | null = null;
    if (isKnockout && isDraw) {
      if (!dto.penaltyWinner) {
        throw new BadRequestException(
          'En eliminación, si pronosticás un empate tenés que elegir quién gana por penales',
        );
      }
      penaltyWinner = dto.penaltyWinner;
    }

    return this.prisma.prediction.upsert({
      where: { userId_matchId: { userId, matchId } },
      create: {
        userId,
        matchId,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        penaltyWinner,
      },
      update: {
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        penaltyWinner,
      },
    });
  }

  findMine(userId: string) {
    return this.prisma.prediction.findMany({
      where: { userId },
      include: {
        match: { include: { homeTeam: true, awayTeam: true } },
      },
      orderBy: { match: { kickoffAt: 'asc' } },
    });
  }
}
