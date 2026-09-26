/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fixtures live in <repo>/fixtures and are imported directly (single source of truth).
  experimental: { externalDir: true },
};

export default nextConfig;
