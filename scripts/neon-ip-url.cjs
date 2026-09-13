// Prints DIRECT_URL rewritten to dial Neon by IP, for networks whose DNS
// refuses *.neon.tech (some ISP routers do). Neon routes by endpoint id, which
// it accepts in the password as "endpoint=<id>;<password>" when the hostname
// can't be used. The certificate is issued for the hostname, so certificate
// checks are relaxed for this one connection (it is still encrypted).
//
// Usage (nothing is written to .env):
//   IP=$(dig +short @1.1.1.1 <your-endpoint>.<region>.aws.neon.tech | tail -1)
//   U=$(node --env-file=.env scripts/neon-ip-url.cjs "$IP")
//   DIRECT_URL="$U" DATABASE_URL="$U" npm run prisma:push
if (!process.env.DIRECT_URL || !process.argv[2]) {
  console.error('usage: node --env-file=.env scripts/neon-ip-url.cjs <ip>');
  process.exit(1);
}
const u = new URL(process.env.DIRECT_URL);
const id = u.hostname.split('.')[0].replace(/-pooler$/, '');
u.password = encodeURIComponent(`endpoint=${id};${decodeURIComponent(u.password)}`);
u.hostname = process.argv[2];
u.searchParams.set('sslmode', 'require');
u.searchParams.set('sslaccept', 'accept_invalid_certs');
process.stdout.write(u.toString());
