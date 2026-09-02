/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Proxy every /api/* request to the deployed NestJS API so the browser stays
  // same-origin (no CORS, first-party session cookie). Set API_PROXY_TARGET in
  // the Vercel web project, e.g. https://has-erp-api.vercel.app
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    if (!target) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${target}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
