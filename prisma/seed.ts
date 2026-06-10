import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

const ADMIN_EMAILS = (
  process.env.ADMIN_EMAILS ??
  'squinteros@w3itsolutions.net,sditoro@w3itsolutions.net'
)
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

async function main() {
  for (const email of ADMIN_EMAILS) {
    await prisma.user.upsert({
      where: { email },
      update: { role: Role.ADMIN },
      create: { email, name: email.split('@')[0], role: Role.ADMIN },
    });
    console.log(`Admin asegurado: ${email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
