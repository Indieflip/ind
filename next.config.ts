import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  images: { unoptimized: true },
};

export default nextConfig;
