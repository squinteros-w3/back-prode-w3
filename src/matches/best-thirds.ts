// Asignación de los mejores terceros a los 16avos (Round of 32).
//
// FIFA publica una tabla FIJA: según QUÉ 8 de los 12 grupos clasifican su
// tercero, cada combinación define a qué partido va el 3º de cada grupo (para
// equilibrar el cuadro y evitar revanchas tempranas). Hay C(12,8) = 495
// combinaciones posibles.
//
// Como la fase de grupos ya terminó, la combinación real de este Mundial está
// fija, así que cargamos esa entrada. La estructura permite agregar más
// combinaciones si hiciera falta; si la combinación no está en la tabla,
// `thirdAssignment` devuelve null y el cuadro cae al label "Mejor 3º (...)".
//
// Cada entrada mapea: número de partido FIFA → letra del grupo cuyo 3º lo juega.
// Los partidos con tercero son 74, 77, 79, 80, 81, 82, 85 y 87 (ver
// bracket-template.ts). La clave es la combinación de 8 letras ordenadas.
//
// Fuente: https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage

export type ThirdAssignment = Record<number, string>;

const TABLE: Record<string, ThirdAssignment> = {
  // Mundial 2026: terceros clasificados de los grupos B, D, E, F, I, J, K y L.
  BDEFIJKL: {
    74: 'D',
    77: 'F',
    79: 'E',
    80: 'K',
    81: 'B',
    82: 'I',
    85: 'J',
    87: 'L',
  },
};

/**
 * Devuelve la asignación 16avos→grupo para la combinación de grupos que
 * clasificaron su tercero, o null si esa combinación no está cargada.
 */
export function thirdAssignment(groups: string[]): ThirdAssignment | null {
  const key = [...groups].sort().join('');
  return TABLE[key] ?? null;
}
