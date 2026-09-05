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
    serverComponentsExternalPackages: ["@sparticuz/chromium"],
    outputFileTracingIncludes: {
      "/api/admin/reseller/preview": ["./node_modules/@sparticuz/chromium/**"],
      "/api/admin/reseller/products": ["./node_modules/@sparticuz/chromium/**"],
      "/api/admin/reseller/products/[id]": ["./node_modules/@sparticuz/chromium/**"],
      "/api/products/import": ["./node_modules/@sparticuz/chromium/**"],
      "/api/cron/sync": ["./node_modules/@sparticuz/chromium/**"],
    },
  },
};

module.exports = nextConfig;
