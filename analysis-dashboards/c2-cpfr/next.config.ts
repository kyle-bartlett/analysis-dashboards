import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow builds even without env vars configured
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
