import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { GroupsModule } from './groups/groups.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { LiveModule } from './live/live.module';
import { MatchesModule } from './matches/matches.module';
import { PredictionsModule } from './predictions/predictions.module';
import { PrismaModule } from './prisma/prisma.module';
import { StatsModule } from './stats/stats.module';
import { UsersModule } from './users/users.module';
import { WorldCupModule } from './worldcup/worldcup.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env: Record<string, unknown>) => {
        const secret = env.JWT_SECRET;
        if (typeof secret !== 'string' || secret.trim() === '') {
          throw new Error(
            'Falta la variable de entorno JWT_SECRET (requerida para firmar los JWT). Configurala antes de iniciar.',
          );
        }
        return env;
      },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: 120 },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    WorldCupModule,
    MatchesModule,
    PredictionsModule,
    GroupsModule,
    LeaderboardModule,
    StatsModule,
    AdminModule,
    LiveModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
