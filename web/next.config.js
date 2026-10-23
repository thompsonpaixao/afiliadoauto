/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://afiliado-auto-api.thompsonpaixao.workers.dev/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
