import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["playwright", "bullmq", "ioredis", "@prisma/client"],
};

export default nextConfig;
