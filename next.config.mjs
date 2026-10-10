/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['pg', 'bcryptjs', 'pdf-lib'],
};

export default nextConfig;
