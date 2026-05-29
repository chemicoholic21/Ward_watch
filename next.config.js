/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '',
  },
  experimental: {
    // @elastic/elasticsearch ships `undici` (uses private class fields) which
    // webpack can't parse. Loading it via Node require() at runtime sidesteps
    // the bundler entirely.
    serverComponentsExternalPackages: ['@elastic/elasticsearch', 'undici'],
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
