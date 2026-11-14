import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  images: { unoptimized: true },
  async redirects() {
    return [
      { source: "/suppliers", destination: "/mercurial/fournisseurs", permanent: true },
      { source: "/suppliers/:id", destination: "/mercurial/fournisseurs/:id", permanent: true },
    ];
  },
};

export default nextConfig;
