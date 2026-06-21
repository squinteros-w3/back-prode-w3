import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types';
import { BracketService } from './bracket.service';
import { MatchesService } from './matches.service';

@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MatchesController {
  constructor(
    private readonly matches: MatchesService,
    private readonly bracket: BracketService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.matches.listForUser(user.id);
  }

  @Get('bracket')
  getBracket() {
    return this.bracket.getBracket();
  }

  @Get(':matchId/results')
  results(@Param('matchId') matchId: string) {
    return this.matches.resultsForMatch(matchId);
  }

  @Get(':matchId/live-predictions')
  livePredictions(@Param('matchId') matchId: string) {
    return this.matches.livePredictionsForMatch(matchId);
  }
}
