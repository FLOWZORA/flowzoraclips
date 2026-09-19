/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep native binary packages out of the bundle — they are loaded by Node.js at runtime
  serverExternalPackages: ['youtubei.js', '@ffmpeg-installer/ffmpeg', 'fluent-ffmpeg'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
