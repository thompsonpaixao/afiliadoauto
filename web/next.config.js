/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (apiUrl && apiUrl.trim()) {
      const cleanApi = apiUrl.trim().replace(/\/+$/, '');
      return [
        {
          source: '/api/:path*',
          destination: `${cleanApi}/api/:path*`,
        },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;
