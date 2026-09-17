/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prisma and the pg driver are CJS with dynamic requires; bundling them breaks
  // the query engine lookup.
  serverExternalPackages: ["@prisma/client", "pg"],
};

export default nextConfig;
