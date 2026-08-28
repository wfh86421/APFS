# Docker 基礎設施

開發環境：

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

包含 PostgreSQL 16、Redis 7、ClickHouse 與 MinIO（S3-compatible）。
