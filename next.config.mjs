/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "50mb" } },
  serverExternalPackages: ["exceljs"],
};
export default nextConfig;
