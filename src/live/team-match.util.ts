// Normalización de nombres de equipo para mapear partidos de elnine (datos de
// Stats Perform, nombres en español) contra nuestros equipos (también en
// español, ver src/worldcup/team-names.ts). Aislado para mantener src/live
// autocontenido y fácil de borrar.

// Alias para los pocos casos donde el nombre de elnine difiere del nuestro.
// Clave y valor van YA normalizados (sin acentos, lowercase).
const ALIASES: Record<string, string> = {
  'bosnia herzegovina': 'bosnia y herzegovina',
};

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** lowercase, sin acentos, sin puntuación/guiones. Aplica alias conocidos. */
export function normalizeTeamName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(COMBINING_MARKS, '') // saca acentos combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // guiones/puntuación -> espacio
    .trim()
    .replace(/\s+/g, ' ');
  return ALIASES[base] ?? base;
}

/** Clave de par no ordenada: matchea sin importar quién es local/visitante. */
export function pairKey(a: string, b: string): string {
  return [normalizeTeamName(a), normalizeTeamName(b)].sort().join('__');
}
