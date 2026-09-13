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
    // The palette replaces Tailwind's defaults instead of extending them.
    expect(cfg).not.toMatch(/extend:\s*{[^]*?\bcolors:/);
    expect(cfg).not.toContain('hsl(var(');
    const tw = tailwindColors();
    for (const [k, v] of Object.entries(colors)) expect(tw[k]).toBe(v);
    expect(tw['status-down']).toBe(statusColor.down);
  });

  it('globals.css takes every color from the theme', () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');
    expect(css).not.toMatch(RAW_COLOR);
    expect(css).not.toMatch(/--(?:background|foreground|muted|card|popover|primary|secondary|accent|destructive|border|input)\s*:/);
  });

  it('every screen is token-only: no raw colors, legacy color classes or box shadows', () => {
    const offenders: string[] = [];
    for (const dir of ['app', 'components', 'lib']) {
      for (const file of walk(path.join(ROOT, dir))) {
        if (file.endsWith('design-tokens.ts')) continue;
        const src = fs.readFileSync(file, 'utf8');
        const rel = path.relative(ROOT, file);
        for (const [what, re] of [['raw color', RAW_COLOR], ['legacy color class', LEGACY_CLASS], ['box shadow', SHADOW]] as const) {
          const m = src.match(re);
          if (m) offenders.push(`${rel}: ${what} "${m[0].trim()}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b(?![-\w])|\b(?:rgb|rgba|hsl|hsla)\(/;
// shadcn semantic names and Tailwind's default palette. Token names like
// accent-red or surface-card never match (the name must end the class).
const LEGACY_CLASS = new RegExp(
  String.raw`(?<![\w-])(?:bg|text|border|ring|divide|fill|stroke|from|to|via|outline|placeholder|shadow|ring-offset|decoration|caret)-` +
    String.raw`(?:background|foreground|muted|card|popover|secondary|destructive|success|warning|input|border|accent|white|black|` +
    String.raw`red|green|blue|yellow|amber|emerald|zinc|slate|gray|neutral|orange|purple|sky|rose|indigo|violet|pink|teal|cyan|lime|fuchsia|stone-\d+)` +
    String.raw`(?:-foreground|-\d{2,3})?(?![\w-])`
);
// DESIGN.md: elevation comes from surface steps and hairlines, never shadows.
const SHADOW = /(?<![\w-])(?:[\w\[\]=&-]+:)*shadow(?:-(?:sm|md|lg|xl|2xl|inner))?(?=[\s'"`])/;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(tsx?|css)$/.test(e.name) ? [p] : [];
  });
}
