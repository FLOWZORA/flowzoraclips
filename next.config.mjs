/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep native binary packages out of the bundle — they are loaded by Node.js at runtime
  serverExternalPackages: ['@ffmpeg-installer/ffmpeg', 'fluent-ffmpeg'],
};

export default nextConfig;
