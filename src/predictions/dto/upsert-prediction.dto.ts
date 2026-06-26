import { PenaltyWinner } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpsertPredictionDto {
  @IsInt()
  @Min(0)
  @Max(99)
  homeScore: number;

  @IsInt()
  @Min(0)
  @Max(99)
  awayScore: number;

  // Ganador por penales elegido al pronosticar un empate en eliminación.
  @IsOptional()
  @IsEnum(PenaltyWinner)
  penaltyWinner?: PenaltyWinner;
}
