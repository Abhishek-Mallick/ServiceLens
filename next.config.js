/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Never bundle these — keep their React/peer deps off the page graph.
    // Without this, @react-email/* can drag a parallel React tree into the
    // App Router bundle and break useContext on server Link rendering.
    serverComponentsExternalPackages: [
      'simple-git',
      'resend',
      '@react-email/components',
      '@react-email/render',
    ],
  },
  webpack: (config) => {
    config.externals.push({ 'utf-8-validate': 'commonjs utf-8-validate', bufferutil: 'commonjs bufferutil' });
    return config;
  },
};

module.exports = nextConfig;
