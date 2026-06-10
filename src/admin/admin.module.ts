import { Module } from '@nestjs/common';
import { ScoringModule } from '../scoring/scoring.module';
import { WorldCupModule } from '../worldcup/worldcup.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [WorldCupModule, ScoringModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
