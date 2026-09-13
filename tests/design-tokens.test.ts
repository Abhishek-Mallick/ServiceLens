// Keeps lib/design-tokens.ts identical to DESIGN.md, makes Tailwind consume it,
// and enforces "no raw colors" in the token-only surfaces.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { colors, rounded, spacing, tailwindColors, statusColor } from '@/lib/design-tokens';

const ROOT = path.resolve(__dirname, '..');

function designBlock(name: string): Record<string, string> {
  const md = fs.readFileSync(path.join(ROOT, 'DESIGN.md'), 'utf8');
  const start = md.indexOf(`\n${name}:\n`);
  expect(start).toBeGreaterThan(-1);
  const out: Record<string, string> = {};
  for (const line of md.slice(start + name.length + 3).split('\n')) {
    const m = line.match(/^ {2}([\w-]+):\s*"?([^"]+?)"?\s*$/);
    if (!m) break;
    out[m[1]] = m[2];
  }
  return out;
}

describe('design tokens', () => {
  it('colors match DESIGN.md exactly', () => {
    expect(colors).toEqual(designBlock('colors'));
  });

  it('radius and spacing scales match DESIGN.md', () => {
    expect(rounded).toEqual(designBlock('rounded'));
    expect(spacing).toEqual(designBlock('spacing'));
  });

  it('Tailwind builds its palette from the tokens', () => {
    const cfg = fs.readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf8');
    expect(cfg).toMatch(/from '\.\/lib\/design-tokens'/);
    expect(cfg).toContain('...tailwindColors()');
    const tw = tailwindColors();
    for (const [k, v] of Object.entries(colors)) if (k !== 'primary') expect(tw[k]).toBe(v);
    expect(tw['status-down']).toBe(statusColor.down);
  });

  it('token-only surfaces contain no raw color literals', () => {
    const dir = path.join(ROOT, 'components/workspace');
    const offenders: string[] = [];
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      if (/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
