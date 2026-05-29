/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '',
  },
  experimental: {
    // The mongodb driver ships native-ish modules that webpack doesn't need
    // to crawl. Marking it external means it loads via Node require() at
    // runtime, which is also faster than re-bundling on every cold start.
    serverComponentsExternalPackages: ['mongodb'],
  },
  async headers() {
    // Security headers (replaces the Express `helmet()` middleware).
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
