/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Docker 多階段建置使用 standalone 輸出（最小 runtime 依賴）。
  // 只在 NEXT_OUTPUT_STANDALONE=1 時啟用：Windows 本機一般 build 不需要
  // standalone 追蹤（該步驟在無 symlink 權限的環境會失敗）。
  ...(process.env.NEXT_OUTPUT_STANDALONE === '1' ? { output: 'standalone' } : {}),
};

export default nextConfig;
