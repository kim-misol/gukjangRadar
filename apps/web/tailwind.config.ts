import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--color-paper)',
        ink: 'var(--color-ink)',
        'ink-soft': 'var(--color-ink-soft)',
        up: 'var(--color-up)',
        down: 'var(--color-down)',
        rule: 'var(--color-rule)',
        'rule-strong': 'var(--color-rule-strong)',
      },
      fontFamily: {
        serif: ['var(--font-noto-serif-kr)', 'serif'],
        sans: ['var(--font-noto-sans-kr)', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
