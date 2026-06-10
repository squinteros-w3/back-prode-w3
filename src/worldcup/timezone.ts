/**
 * worldcup26.ir entrega `local_date` (formato "MM/DD/YYYY HH:mm") como la hora
 * LOCAL DE LA SEDE de cada partido. Verificado contra el partido inaugural:
 * Mexico vs Sudafrica, 06/11/2026 13:00 == 13:00 hora oficial de Ciudad de Mexico.
 *
 * Por eso convertimos usando la zona horaria de cada estadio (stadium_id) y
 * guardamos el instante en UTC. El display al usuario se hace en horario argentino.
 */

// stadium_id (string, como lo devuelve la API) -> zona IANA de la sede.
export const STADIUM_TIMEZONES: Record<string, string> = {
  '1': 'America/Mexico_City', // Estadio Azteca, Ciudad de Mexico
  '2': 'America/Mexico_City', // Estadio Akron, Guadalajara
  '3': 'America/Monterrey', // Estadio BBVA, Monterrey
  '4': 'America/Chicago', // AT&T Stadium, Dallas (Arlington, TX)
  '5': 'America/Chicago', // NRG Stadium, Houston
  '6': 'America/Chicago', // Arrowhead, Kansas City
  '7': 'America/New_York', // Mercedes-Benz, Atlanta
  '8': 'America/New_York', // Hard Rock, Miami
  '9': 'America/New_York', // Gillette, Boston (Foxborough)
  '10': 'America/New_York', // Lincoln Financial, Philadelphia
  '11': 'America/New_York', // MetLife, New York/New Jersey
  '12': 'America/Toronto', // BMO Field, Toronto
  '13': 'America/Vancouver', // BC Place, Vancouver
  '14': 'America/Los_Angeles', // Lumen Field, Seattle
  '15': 'America/Los_Angeles', // Levi's, SF Bay Area
  '16': 'America/Los_Angeles', // SoFi, Los Angeles
};

/**
 * Convierte una hora de pared en una zona IANA al instante UTC equivalente,
 * respetando DST. Usa el offset que la zona tiene en ese instante.
 */
export function wallTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offset = tzOffsetMs(asUtc, timeZone);
  return new Date(asUtc - offset);
}

/** Offset (ms) de la zona respecto a UTC para un instante dado. */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  const asSeen = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour,
    map.minute,
    map.second,
  );
  return asSeen - utcMs;
}

/**
 * Parsea "MM/DD/YYYY HH:mm" (hora local de la sede) -> Date en UTC.
 * @param stadiumId id del estadio para resolver la zona; fallback si no mapea.
 */
export function parseLocalDateToUtc(
  localDate: string,
  stadiumId: string | null | undefined,
  fallbackTz: string,
): Date | null {
  const m = localDate
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, mm, dd, yyyy, hh, min] = m;
  const tz =
    (stadiumId && STADIUM_TIMEZONES[stadiumId]) || fallbackTz;
  return wallTimeToUtc(
    Number(yyyy),
    Number(mm),
    Number(dd),
    Number(hh),
    Number(min),
    tz,
  );
}
