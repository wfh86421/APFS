/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Docker 多階段建置使用 standalone 輸出（最小 runtime 依賴）。
  // 只在 NEXT_OUTPUT_STANDALONE=1 時啟用：Windows 本機一般 build 不需要
  // standalone 追蹤（該步驟在無 symlink 權限的環境會失敗）。
  ...(process.env.NEXT_OUTPUT_STANDALONE === '1' ? { output: 'standalone' } : {}),
  // 全站安全 headers（code review P1：CSP/防嵌/防 sniffing）。
  // CSP 採漸進式：保留 Next 所需 unsafe-inline（script/style）；非ce 化嚴格 CSP 列為後續。
  async headers() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    const connect = ["'self'"];
    if (apiUrl) connect.push(apiUrl);
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              `connect-src ${connect.join(' ')}`,
              "font-src 'self' data:",
              "media-src 'self' blob:",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
