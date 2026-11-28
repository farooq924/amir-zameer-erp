# ---- build ----
FROM node:22-bookworm-slim AS build
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --filter @az/backend... --filter @az/shared
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN pnpm --filter @az/shared build \
 && pnpm --filter @az/backend exec prisma generate \
 && pnpm --filter @az/backend build \
 && pnpm deploy --filter @az/backend --prod --legacy /out \
 && cp -r apps/backend/dist apps/backend/dist-seed apps/backend/prisma /out/ \
 && cd /out && npx prisma@6.19.3 generate --schema prisma/schema.prisma

# ---- runtime ----
FROM node:22-bookworm-slim
# pg_dump / pg_restore 18 from the PostgreSQL project (Debian's own client is too old for PostgreSQL 16-18 servers).
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl openssl tini \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update && apt-get install -y --no-install-recommends postgresql-client-18 \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 1001 app \
 && mkdir -p /backups /app-keys && chown app:app /backups /app-keys
WORKDIR /app
COPY --from=build --chown=app:app /out /app
USER app
ENV NODE_ENV=production PORT=4000 BACKUP_DIR=/backups BACKUP_KEY_FILE=/app-keys/backup.key PG_BIN_DIR=/usr/lib/postgresql/18/bin
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
# Apply pending migrations, run the idempotent seed, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
