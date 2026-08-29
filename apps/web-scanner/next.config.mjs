/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Docker 多階段建置使用 standalone 輸出（最小 runtime 依賴）。
  output: 'standalone',
};

export default nextConfig;
