// Simulated features (chaos drills that write fake health, synthetic
// incidents/logs, random regression outcomes) are confined to the demo
// architecture. Real architectures must only ever show real data.

import { NextResponse } from 'next/server';
import { prisma } from './prisma';

export class DemoOnlyError extends Error {
  constructor(feature: string) {
    super(`${feature}: simulated feature, only available on the demo architecture.`);
    this.name = 'DemoOnlyError';
  }
}

export async function assertDemoArchitecture(architectureId: string, feature: string): Promise<void> {
  const arch = await prisma.architecture.findUnique({ where: { id: architectureId }, select: { demo: true } });
  if (!arch?.demo) throw new DemoOnlyError(feature);
}

export function demoOnlyResponse(feature: string) {
  return NextResponse.json({ error: new DemoOnlyError(feature).message, code: 'demo_only' }, { status: 400 });
}
