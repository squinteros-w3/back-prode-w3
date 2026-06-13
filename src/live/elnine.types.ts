// Tipos crudos de la API de elnine (api.elnine.com.ar). Solo modelamos lo que
// consumimos del endpoint GET /matches. Todo aislado acá para que borrar la
// carpeta src/live elimine cualquier dependencia hacia elnine.

export interface ElnineTeam {
  id: string;
  name: string;
  shortName: string;
  logoUuid: string;
}

// pre | 1T | HT | 2T | FT | (variantes de alargue/penales). String laxo a propósito.
export type ElninePeriod = string;

// live | finished | scheduled | postponed | suspended | pre. String laxo.
export type ElnineStatus = string;

export interface ElnineGoal {
  scorerName: string;
  assistPlayerName?: string;
  timeMin: number | null;
  addedMinute?: number; // tiempo adicionado (ej. 45+5)
  periodId: number;
  contestantId: string; // equipo al que se le acredita el gol (en OG, el beneficiado)
  type: string; // G (gol) | OG (en contra) | PG (penal) | ...
}

export interface ElnineMatch {
  id: string;
  homeTeam: ElnineTeam;
  awayTeam: ElnineTeam;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  period: ElninePeriod;
  status: ElnineStatus;
  goals?: ElnineGoal[];
  startTime: string; // ISO UTC
  competitionId: string;
  competitionName: string;
  tournamentCalendarId: string;
  tournamentCalendarSlug: string;
}

export interface ElnineTournamentGroup {
  tournamentCalendarId: string;
  tournamentCalendarSlug: string;
  matches: ElnineMatch[];
  fetchedAt: number;
  isStale: boolean;
}

export interface ElnineMatchesResponse {
  count: number;
  items: ElnineTournamentGroup[];
}
