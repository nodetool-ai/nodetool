/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.simpleicons.org',
      },
      {
        protocol: 'https',
        hostname: 'openrouter.ai',
      },
      {
        protocol: 'https',
        hostname: 'ml-explore.github.io',
      },
    ],
  },
  rewrites: async () => {
    return [
      {
        source: '/api/:path*',
        destination: 'https://api.nodetool.run/api/:path*',
      },
    ];
  }
};

export default nextConfig;
