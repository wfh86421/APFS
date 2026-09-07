# SEC — 資安 Medium 四項（fix/security-r3）技術日誌

> 日期：2026-09-07｜代號：SEC｜分支：fix/security-r3

## 目標
依 docs/reviews/ShieldScan-現行HEAD增量複審-報告.md 修復四項 Medium：
X-Forwarded-For 信任面、限流逾限回 429、audit_logs 補 actor 身分、webhook 投遞防護。

## 關鍵決策
1. requestIp：僅信任 proxy/內網來源的 X-Forwarded-For（TRUSTED_PROXY_IPS 可擴充；畸形/私網值退回 socket 來源），
   並新增 isPrivateAddress 供來源與 Webhook 目標共用。
2. 限流：resolveAuth 逾限改拋 RATE_LIMITED，由 app.setErrorHandler 統一回 429＋Retry-After（不再與 401 混淆，
   亦不再把被限流租戶靜默降級為匿名收案）。
3. audit：audit_logs 新增 actor_key_id（UUID）欄＋冪等遷移；AuditLogEntry 補 actorKeyId；
   所有含 auth 的審計寫入帶 actorKeyId 與 tenantId。
4. webhook：註冊僅允許 https（例外需 WEBHOOK_ALLOW_LOCALHOST=1），並以 DNS lookup 阻擋內網/保留網段（防 SSRF/DNS rebinding）；
   投遞前重新解析主機、redirect:'error' 禁重導、附 x-shieldscan-signature（HMAC-SHA256）與 idempotency-key。

## 改動檔案（fix(security)（SEC））
apps/api/src/server.ts、infra/docker/postgres/init.sql、
packages/repository/src/types.ts、packages/repository/src/risk-postgres.ts

## 驗證結果
pnpm -r build ✅ / pnpm -r typecheck ✅ / pnpm test ✅（repository 16 pass＋2 skip）

## 未完成/待辦
- 推送後等 GitHub Actions CI 全綠（本機無 Docker/gh 認證，整合測試需 CI 驗證）。
- 上線前對既有 DB 重跑 init.sql/init-db.mjs（冪等）以補 audit_logs.actor_key_id。
- 後續建議：敏感讀取（報告/訪客/審計/設備）的讀取審計、集中式 Redis 限流、Webhook 持久化。