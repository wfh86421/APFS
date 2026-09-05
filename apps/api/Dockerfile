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

# 拆成獨立步驟：若建置失敗，輸出會明確指出是哪一步
RUN echo "[1/3] pnpm install" && pnpm install --frozen-lockfile
RUN echo "[2/3] build workspace packages" && pnpm -r --filter './packages/**' build
RUN echo "[3/3] build api" && pnpm --filter @shieldscan/api build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/infra ./infra

EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
