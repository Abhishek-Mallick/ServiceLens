// One-off migration for databases seeded before the `Architecture.demo` flag.
//
// Marks the seeded showcase mesh (owned by demo@servicelens.com, named
// "E-Commerce Platform") as demo, and removes its placeholder probes that point
// at example.invalid — otherwise the scheduler would really probe those hosts,
// mark every demo service down, and page the owner.
//
//   npm run prisma:push && npm run db:migrate-demo
//
// Idempotent. Never touches non-demo architectures.

import { prisma } from '../lib/prisma';
import { grantDemoAccess } from '../lib/membership';

async function main() {
  const demoUser = await prisma.user.findUnique({ where: { email: 'demo@servicelens.com' }, select: { id: true } });
  if (!demoUser) {
    console.log('No demo user found — nothing to migrate.');
    return;
  }
  const archs = await prisma.architecture.findMany({
    where: { userId: demoUser.id, name: 'E-Commerce Platform' },
    select: { id: true, demo: true },
  });
  for (const a of archs) {
    if (!a.demo) await prisma.architecture.update({ where: { id: a.id }, data: { demo: true } });
    const removed = await prisma.probe.deleteMany({
      where: { service: { architectureId: a.id }, target: { contains: 'example.invalid' } },
    });
    console.log(`architecture ${a.id}: demo=true, removed ${removed.count} placeholder probe(s)`);
  }
  if (archs.length === 0) console.log('Seeded "E-Commerce Platform" not found — nothing to migrate.');

  // Existing users get read-only access to the demo, like new signups do.
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const u of users) await grantDemoAccess(u.id);
  console.log(`granted demo viewer access to ${users.length} user(s)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
