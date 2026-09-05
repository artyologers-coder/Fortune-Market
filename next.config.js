/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  experimental: {
    outputFileTracingIncludes: {
      "/api/admin/reseller/preview": ["./node_modules/**/.local-browsers/**"],
      "/api/admin/reseller/products": ["./node_modules/**/.local-browsers/**"],
      "/api/admin/reseller/products/[id]": ["./node_modules/**/.local-browsers/**"],
      "/api/products/import": ["./node_modules/**/.local-browsers/**"],
      "/api/cron/sync": ["./node_modules/**/.local-browsers/**"],
    },
  },
};

module.exports = nextConfig;
