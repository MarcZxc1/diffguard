import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable body parsing for webhook routes (we need raw body for HMAC)
  // Note: App Router handles this differently - raw body is accessed via request.arrayBuffer()
  
  // Enable server-side external packages
  serverExternalPackages: ["@prisma/client", "prisma", "pg", "argon2"],
};

export default nextConfig;
