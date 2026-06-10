import { Module } from '@nestjs/common';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [LeaderboardModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
