import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ScoringModule } from '../scoring/scoring.module';
import { SyncService } from './sync.service';
import { WorldCupApiService } from './worldcup-api.service';

@Module({
  imports: [HttpModule, ScoringModule],
  providers: [WorldCupApiService, SyncService],
  exports: [SyncService],
})
export class WorldCupModule {}
