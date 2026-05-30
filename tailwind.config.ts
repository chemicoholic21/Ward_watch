import type { Config } from 'tailwindcss';

/**
 * Apple-minimal black theme. All colors resolve to the CSS variables defined
 * in app/globals.css — change the palette there, never here.
 */
const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // The next/font Poppins loader sets --font-sans on <html>; Tailwind
        // resolves font-sans -> Poppins -> SF Pro fallback.
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        // Surfaces
        bg: {
          DEFAULT: 'hsl(var(--bg))',
          elevated: 'hsl(var(--bg-elevated))',
          raised:   'hsl(var(--bg-raised))',
          input:    'hsl(var(--bg-input))',
        },
        // Text
        fg: {
          DEFAULT: 'hsl(var(--fg))',
          muted:   'hsl(var(--fg-muted))',
          subtle:  'hsl(var(--fg-subtle))',
        },
        // Borders
        line: {
          DEFAULT: 'hsl(var(--border))',
          strong:  'hsl(var(--border-strong))',
        },
        // Accent
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          fg:      'hsl(var(--accent-fg))',
        },
        // Severity
        critical: 'hsl(var(--critical))',
        warn:     'hsl(var(--warn))',
        ok:       'hsl(var(--ok))',
      },
      borderRadius: {
        // Apple uses small radii — 8–12px. Override Tailwind's defaults.
        sm: '6px',
        DEFAULT: '8px',
        md: '10px',
        lg: '12px',
        xl: '16px',
      },
      fontSize: {
        // Display sizes for hero stats — Apple-style: huge but light.
        'display-sm': ['1.875rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '300' }],
        'display':    ['2.5rem',   { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '300' }],
        'display-lg': ['3.5rem',   { lineHeight: '1.0',  letterSpacing: '-0.03em', fontWeight: '300' }],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'fade-in':    'fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-soft': 'pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
