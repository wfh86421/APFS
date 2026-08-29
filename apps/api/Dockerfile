# syntax=docker/dockerfile:1
#
# ShieldScan API 多階段鏡像
# 建置：pnpm install → 依賴序建置 packages → 建置 apps/api
# 執行：node apps/api/dist/server.js

FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

# 整個 monorepo 為建置 context（.dockerignore 已排除 node_modules/.next/dist 等）
COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm -r --filter './packages/**' build \
  && pnpm --filter @shieldscan/api build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api

EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
