import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types';
import { UpsertPredictionDto } from './dto/upsert-prediction.dto';
import { PredictionsService } from './predictions.service';

@Controller('predictions')
@UseGuards(JwtAuthGuard)
export class PredictionsController {
  constructor(private readonly predictions: PredictionsService) {}

  @Get('me')
  findMine(@CurrentUser() user: AuthUser) {
    return this.predictions.findMine(user.id);
  }

  @Put(':matchId')
  upsert(
    @CurrentUser() user: AuthUser,
    @Param('matchId') matchId: string,
    @Body() dto: UpsertPredictionDto,
  ) {
    return this.predictions.upsert(user.id, matchId, dto);
  }
}
