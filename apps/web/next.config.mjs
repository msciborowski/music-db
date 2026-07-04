/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile the workspace package we consume (ships TypeScript source).
  // @mdb/core is intentionally not used from the web bundle (see lib/text.ts).
  transpilePackages: ["@mdb/database"],
  // Keep Prisma + native pg out of the bundle (server-only, native engine).
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
