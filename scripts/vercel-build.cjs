// Vercel build: keep the database schema in step with the code being deployed.
//
// Production deploys run `prisma db push` before `next build`, so new columns
// exist before any page reads them (a deploy that skipped the manual push took
// the dashboard down with P2022 "column does not exist"). Without
// --accept-data-loss, Prisma refuses destructive changes (dropping a column or
// table with data): the build fails instead of deleting anything, and a human
// applies that change deliberately.
//
// Preview deploys don't push: previews usually share the production database,
// and a PR's schema must not reach it before the PR merges.
const { execSync } = require('node:child_process');

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('prisma generate');

if (process.env.VERCEL_ENV === 'production') {
  if (!process.env.DIRECT_URL) {
    console.error('[vercel-build] DIRECT_URL is not set; Prisma needs it to apply the schema. See docs/secrets.md.');
    process.exit(1);
  }
  console.log('[vercel-build] production: applying schema (non-destructive only)…');
  run('prisma db push --skip-generate');
} else {
  console.log(`[vercel-build] ${process.env.VERCEL_ENV || 'local'} build: schema not pushed (production deploys only).`);
}

run('next build');
