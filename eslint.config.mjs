// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.turbo/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'pnpm-lock.yaml',
      // Next.js가 자동 생성하는 파일 — 직접 편집하지 않으며 triple-slash reference도 규약이다.
      '**/next-env.d.ts',
      // drizzle-kit이 생성하는 마이그레이션 산출물 — 손으로 고치지 않는다.
      '**/drizzle/**',
      // 브라우저 서비스워커 등 정적 자산 — Next.js/TS 빌드 대상이 아니다.
      '**/public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
