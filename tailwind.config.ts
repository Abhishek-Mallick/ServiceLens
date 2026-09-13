import type { Config } from 'tailwindcss';
import { colors, rounded, tailwindColors } from './lib/design-tokens';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    // The palette *replaces* Tailwind's: only DESIGN.md tokens (plus the
    // status-*/severity-* aliases) exist, so a non-token color class renders
    // nothing. tests/design-tokens.test.ts also rejects them at build time.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      ...tailwindColors(),
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui'],
        display: ['var(--font-display)', 'Tiempos Headline', 'Söhne', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderColor: { DEFAULT: colors['hairline-strong'] },
      ringColor: { DEFAULT: colors['accent-blue'] },
      ringOffsetColor: { DEFAULT: colors.canvas },
      // DESIGN.md radius scale (lg = 12px, the container radius).
      borderRadius: { ...rounded },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'pulse-edge': {
          '0%, 100%': { strokeOpacity: '0.4' },
          '50%': { strokeOpacity: '1' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-edge': 'pulse-edge 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
