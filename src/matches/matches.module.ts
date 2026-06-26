import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { BracketService } from './bracket.service';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

@Module({
  imports: [GroupsModule],
  controllers: [MatchesController],
  providers: [MatchesService, BracketService],
  exports: [BracketService],
})
export class MatchesModule {}
