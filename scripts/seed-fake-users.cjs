// Pobla usuarios falsos con predicciones de puntaje variado para ver el leaderboard.
// Re-ejecutable: borra y recrea los usuarios marcados con el email @seed.local.
// Uso: DATABASE_URL=... node scripts/seed-fake-users.cjs
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// { exact: aciertos exactos (+3), outcome: ganador acertado (+1), miss: fallados (+0) }
const PROFILES = [
  { name: 'Daniela Calcagno', exact: 4, outcome: 3, miss: 1 },
  { name: 'Gabriel Kaplan', exact: 3, outcome: 4, miss: 0 },
  { name: 'Germán Buchniv', exact: 3, outcome: 2, miss: 2 },
  { name: 'Iván Genes', exact: 2, outcome: 3, miss: 1 },
  { name: 'Luigi Pocay', exact: 2, outcome: 2, miss: 2 },
  { name: 'Marney Ruiz', exact: 1, outcome: 4, miss: 1 },
  { name: 'Sofía Di Tella', exact: 1, outcome: 3, miss: 2 },
  { name: 'Tomás Vera', exact: 1, outcome: 1, miss: 3 },
  { name: 'Lucía Franco', exact: 0, outcome: 2, miss: 2 },
];

const slug = (name) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.|\.$/g, '');

function buildPredictions(profile) {
  const preds = [];
  for (let i = 0; i < profile.exact; i++)
    preds.push({ homeScore: 2, awayScore: 1, pointsAwarded: 3, isExact: true });
  for (let i = 0; i < profile.outcome; i++)
    preds.push({ homeScore: 1, awayScore: 0, pointsAwarded: 1, isExact: false });
  for (let i = 0; i < profile.miss; i++)
    preds.push({ homeScore: 0, awayScore: 0, pointsAwarded: 0, isExact: false });
  return preds;
}

async function main() {
  const matches = await prisma.match.findMany({
    take: 12,
    orderBy: { kickoffAt: 'asc' },
    select: { id: true },
  });
  if (matches.length === 0) {
    console.error('No hay partidos en la DB. Sincronizá primero.');
    process.exit(1);
  }

  for (const profile of PROFILES) {
    const email = `${slug(profile.name)}@seed.local`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { name: profile.name },
      create: { email, name: profile.name },
    });

    // Limpia predicciones previas de este usuario falso y recrea.
    await prisma.prediction.deleteMany({ where: { userId: user.id } });

    const preds = buildPredictions(profile);
    if (preds.length > matches.length) {
      console.warn(
        `${profile.name}: ${preds.length} predicciones pero solo ${matches.length} partidos; se truncan.`,
      );
    }
    const data = preds.slice(0, matches.length).map((p, i) => ({
      ...p,
      userId: user.id,
      matchId: matches[i].id,
    }));
    await prisma.prediction.createMany({ data, skipDuplicates: true });

    const points = preds.reduce((s, p) => s + p.pointsAwarded, 0);
    console.log(
      `✓ ${profile.name.padEnd(20)} ${points} pts · ${profile.exact} exactos · ${profile.exact + profile.outcome} aciertos`,
    );
  }

  console.log('\nListo. Usuarios falsos con email @seed.local.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
