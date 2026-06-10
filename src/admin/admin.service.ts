import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { SyncService } from '../worldcup/sync.service';
import { ManualResultDto } from './dto/manual-result.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
    private readonly scoring: ScoringService,
  ) {}

  syncNow() {
    return this.sync.sync();
  }

  listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async setRole(userId: string, role: Role) {
    const exists = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!exists) throw new NotFoundException('Usuario no encontrado');
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, name: true, role: true },
    });
  }

  /** Correccion manual de un resultado: marca FINISHED y re-dispara el scoring. */
  async setResult(matchId: string, dto: ManualResultDto) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match) throw new NotFoundException('Partido no encontrado');

    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.FINISHED,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
      },
    });
    await this.scoring.scoreMatch(matchId);
    return this.prisma.match.findUnique({ where: { id: matchId } });
  }
}
