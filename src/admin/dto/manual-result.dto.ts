import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ManualResultDto {
  @IsInt()
  @Min(0)
  @Max(99)
  homeScore: number;

  @IsInt()
  @Min(0)
  @Max(99)
  awayScore: number;

  // Penales (opcional): solo se usan en eliminación cuando hubo empate.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  homePenalties?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  awayPenalties?: number;
}
