import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

const providers: NextAuthOptions['providers'] = [
  CredentialsProvider({
    name: 'credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;
      const user = await prisma.user.findUnique({ where: { email: credentials.email } });
      if (!user?.password) return null;
      const ok = await bcrypt.compare(credentials.password, user.password);
      if (!ok) return null;
      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
];

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    })
  );
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers,
  callbacks: {
    // The OAuth `user.id` on first sign-in is the *provider's* account id
    // (GitHub's numeric id, Google's `sub`). Our Prisma User row has its own
    // cuid as the primary key — and that's what every FK in the schema
    // references. We resolve to the DB id by email on the first JWT issue,
    // then cache it on the token so subsequent requests skip the lookup.
    async jwt({ token, user }) {
      if (user?.email) {
        const db = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true } });
        if (db) token.id = db.id;
        else token.id = (user as { id?: string }).id;
      } else if (!token.id && token.email) {
        // Defensive: legacy tokens without `id` — fill it from the DB.
        const db = await prisma.user.findUnique({ where: { email: token.email as string }, select: { id: true } });
        if (db) token.id = db.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) (session.user as { id?: string }).id = token.id as string;
      return session;
    },
    // Upsert the Prisma User row *before* the JWT callback runs so the
    // `findUnique(byEmail)` above always finds a match.
    async signIn({ user, account }) {
      if (!user.email) return true;
      if (account?.provider === 'github') {
        await prisma.user.upsert({
          where: { email: user.email },
          update: { name: user.name, image: user.image, githubId: account.providerAccountId },
          create: {
            email: user.email,
            name: user.name ?? null,
            image: user.image ?? null,
            githubId: account.providerAccountId,
          },
        });
      } else if (account?.provider === 'google') {
        await prisma.user.upsert({
          where: { email: user.email },
          update: { name: user.name, image: user.image },
          create: {
            email: user.email,
            name: user.name ?? null,
            image: user.image ?? null,
          },
        });
      }
      return true;
    },
  },
};
