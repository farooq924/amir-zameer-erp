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
RUN apt-get update && apt-get install -y --no-install-recommends openssl postgresql-client tini && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 1001 app
WORKDIR /app
COPY --from=build --chown=app:app /out /app
USER app
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
# Apply pending migrations, run the idempotent seed, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
