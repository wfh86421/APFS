# syntax=docker/dockerfile:1
#
# ShieldScan 網站（Next.js standalone）多階段鏡像
# NEXT_PUBLIC_API_URL 在 build 階段內嵌（client 端讀取）。

FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_OUTPUT_STANDALONE=1

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm -r --filter './packages/**' build \
  && pnpm --filter @shieldscan/web-scanner build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/apps/web-scanner/.next/standalone ./
COPY --from=build /app/apps/web-scanner/.next/static ./apps/web-scanner/.next/static
COPY --from=build /app/apps/web-scanner/public ./apps/web-scanner/public

EXPOSE 3000
CMD ["node", "apps/web-scanner/server.js"]
