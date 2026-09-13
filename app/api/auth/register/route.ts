import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { grantDemoAccess } from '@/lib/membership';
import { LIMITS, clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  const limit = rateLimit(`signup:${clientIp(req)}`, LIMITS.signupPer10Min, 10 * 60_000);
  if (!limit.ok) return tooManyRequests(limit, 'Too many sign-up attempts from this network. Try again in a few minutes.');
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });

  const hash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: { email: parsed.data.email, name: parsed.data.name, password: hash },
    select: { id: true, email: true, name: true },
  });
  await grantDemoAccess(user.id).catch((err) => console.error('[register] demo access failed:', err));
  return NextResponse.json({ user });
}
