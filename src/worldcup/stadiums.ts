// Sedes del Mundial 2026. Dato FIJO y público (16 estadios), así que vive como
// mapa estático: nos hace dueños del dato y evita una llamada extra a la API.
// El `stadium_id` lo entrega worldcup26.ir en cada partido; acá lo resolvemos a
// una ciudad lista para mostrar (sin el detalle entre paréntesis del nombre largo).
//
// Fuente: https://worldcup26.ir/get/stadiums (campos city_en / name_en).
// La zona horaria de cada sede vive aparte en `timezone.ts` (STADIUM_TIMEZONES).

export interface Stadium {
  /** Ciudad corta para mostrar al usuario. */
  city: string;
  /** Nombre del estadio. */
  venue: string;
}

export const STADIUMS: Record<string, Stadium> = {
  '1': { city: 'Ciudad de México', venue: 'Estadio Azteca' },
  '2': { city: 'Guadalajara', venue: 'Estadio Akron' },
  '3': { city: 'Monterrey', venue: 'Estadio BBVA' },
  '4': { city: 'Dallas', venue: 'AT&T Stadium' },
  '5': { city: 'Houston', venue: 'NRG Stadium' },
  '6': { city: 'Kansas City', venue: 'Arrowhead Stadium' },
  '7': { city: 'Atlanta', venue: 'Mercedes-Benz Stadium' },
  '8': { city: 'Miami', venue: 'Hard Rock Stadium' },
  '9': { city: 'Boston', venue: 'Gillette Stadium' },
  '10': { city: 'Filadelfia', venue: 'Lincoln Financial Field' },
  '11': { city: 'Nueva York', venue: 'MetLife Stadium' },
  '12': { city: 'Toronto', venue: 'BMO Field' },
  '13': { city: 'Vancouver', venue: 'BC Place' },
  '14': { city: 'Seattle', venue: 'Lumen Field' },
  '15': { city: 'San Francisco', venue: "Levi's Stadium" },
  '16': { city: 'Los Ángeles', venue: 'SoFi Stadium' },
};

/** Ciudad de la sede a partir del `stadiumId`, o null si no mapea / no hay dato. */
export function stadiumCity(stadiumId: string | null | undefined): string | null {
  return (stadiumId && STADIUMS[stadiumId]?.city) || null;
}
