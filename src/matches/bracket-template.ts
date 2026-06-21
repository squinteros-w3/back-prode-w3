// Cuadro de eliminación del Mundial 2026 (48 equipos, 12 grupos A–L).
//
// Estructura FIJA y pública: define qué posición de grupo / ganador de partido
// juega cada cruce. No cambia en todo el torneo, así que vive como dato estático
// y nos hace dueños del cuadro sin depender de la API externa para armarlo.
//
// Los números de partido (73–104) coinciden con el numerado FIFA y con el
// `externalId` que usa la DB (los de grupo son 1–72), así que sirven para linkear
// cada slot del template con su fila en `Match` cuando el partido ya está cargado.
//
// Fuente: https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage
// (Match 74 = Ganador Grupo E; Match 79 = Ganador Grupo A, México como local A1).

export type SlotRef =
  | { kind: 'groupWinner'; group: string }
  | { kind: 'groupRunnerUp'; group: string }
  | { kind: 'bestThird'; groups: string[] }
  | { kind: 'matchWinner'; match: number }
  | { kind: 'matchLoser'; match: number };

export type BracketStage = 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final';

export interface TemplateMatch {
  /** Número FIFA del partido = `externalId` en la DB. */
  number: number;
  stage: BracketStage;
  home: SlotRef;
  away: SlotRef;
}

// Constructores cortos para que la tabla se lea como el cuadro real.
const w = (group: string): SlotRef => ({ kind: 'groupWinner', group });
const ru = (group: string): SlotRef => ({ kind: 'groupRunnerUp', group });
const third = (...groups: string[]): SlotRef => ({ kind: 'bestThird', groups });
const win = (match: number): SlotRef => ({ kind: 'matchWinner', match });
const lose = (match: number): SlotRef => ({ kind: 'matchLoser', match });

export const WC2026_BRACKET: readonly TemplateMatch[] = [
  // 32avos de final (Round of 32)
  { number: 73, stage: 'r32', home: ru('A'), away: ru('B') },
  { number: 74, stage: 'r32', home: w('E'), away: third('A', 'B', 'C', 'D', 'F') },
  { number: 75, stage: 'r32', home: w('F'), away: ru('C') },
  { number: 76, stage: 'r32', home: w('C'), away: ru('F') },
  { number: 77, stage: 'r32', home: w('I'), away: third('C', 'D', 'F', 'G', 'H') },
  { number: 78, stage: 'r32', home: ru('E'), away: ru('I') },
  { number: 79, stage: 'r32', home: w('A'), away: third('C', 'E', 'F', 'H', 'I') },
  { number: 80, stage: 'r32', home: w('L'), away: third('E', 'H', 'I', 'J', 'K') },
  { number: 81, stage: 'r32', home: w('D'), away: third('B', 'E', 'F', 'I', 'J') },
  { number: 82, stage: 'r32', home: w('G'), away: third('A', 'E', 'H', 'I', 'J') },
  { number: 83, stage: 'r32', home: ru('K'), away: ru('L') },
  { number: 84, stage: 'r32', home: w('H'), away: ru('J') },
  { number: 85, stage: 'r32', home: w('B'), away: third('E', 'F', 'G', 'I', 'J') },
  { number: 86, stage: 'r32', home: w('J'), away: ru('H') },
  { number: 87, stage: 'r32', home: w('K'), away: third('D', 'E', 'I', 'J', 'L') },
  { number: 88, stage: 'r32', home: ru('D'), away: ru('G') },
  // Octavos de final (Round of 16)
  { number: 89, stage: 'r16', home: win(74), away: win(77) },
  { number: 90, stage: 'r16', home: win(73), away: win(75) },
  { number: 91, stage: 'r16', home: win(76), away: win(78) },
  { number: 92, stage: 'r16', home: win(79), away: win(80) },
  { number: 93, stage: 'r16', home: win(83), away: win(84) },
  { number: 94, stage: 'r16', home: win(81), away: win(82) },
  { number: 95, stage: 'r16', home: win(86), away: win(88) },
  { number: 96, stage: 'r16', home: win(85), away: win(87) },
  // Cuartos de final
  { number: 97, stage: 'qf', home: win(89), away: win(90) },
  { number: 98, stage: 'qf', home: win(93), away: win(94) },
  { number: 99, stage: 'qf', home: win(91), away: win(92) },
  { number: 100, stage: 'qf', home: win(95), away: win(96) },
  // Semifinales
  { number: 101, stage: 'sf', home: win(97), away: win(98) },
  { number: 102, stage: 'sf', home: win(99), away: win(100) },
  // Tercer puesto y final
  { number: 103, stage: 'third', home: lose(101), away: lose(102) },
  { number: 104, stage: 'final', home: win(101), away: win(102) },
];
