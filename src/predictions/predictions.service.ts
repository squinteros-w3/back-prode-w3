import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prediction } from '@prisma/client';
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

    return this.prisma.prediction.upsert({
      where: { userId_matchId: { userId, matchId } },
      create: {
        userId,
        matchId,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
      },
      update: {
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
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
