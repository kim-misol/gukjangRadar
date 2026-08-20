import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@gukjang/core', '@gukjang/spec'],
};

export default nextConfig;
