# AMIR ZAMEER - Tailoring & Fabric Management ERP

Production-grade ERP for AMIR ZAMEER (men's tailoring, fabric sales and stitching, Pakistan, PKR, Asia/Karachi).

| Layer | Stack |
|---|---|
| Backend | Node.js 22, NestJS 11, TypeScript, Prisma 6, PostgreSQL 16, Argon2id, Swagger |
| Frontend | React 19, Vite 6, Tailwind CSS 3, shadcn-style components (Radix UI), TanStack Query, Zustand, React Hook Form + Zod, Recharts |
| Tests | Jest + Supertest (real PostgreSQL), Vitest + React Testing Library, Playwright |
| Infra | Docker, Docker Compose, Nginx, Let's Encrypt (Phase 10) |

Current status: **Phase 1 (Foundation) complete** - see `docs/PHASE-1-REPORT.md` and `docs/ROADMAP.md`.

## Project structure
```
apps/backend     NestJS API (src/modules/*, prisma/ schema + migrations + seed, test/ e2e)
apps/frontend    React app (pages, layouts, features, components/ui, services, store)
packages/shared  Module list, permission catalogue, default roles, date presets (used by both apps)
docker/          Dockerfiles + Nginx config
docs/            Roadmap, ER diagram, database, testing, deployment, phase reports
```

## Local development
Requirements: Node.js 22+, pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp .env.example apps/backend/.env        # set DATABASE_URL and OWNER_* values
pnpm --filter @az/shared build
pnpm --filter @az/backend db:migrate      # apply migrations
pnpm --filter @az/backend db:seed         # roles, permissions, first Owner, workflow stages
pnpm dev:backend                          # API on http://localhost:4000  (Swagger: /api/docs)
pnpm dev:frontend                         # App on http://localhost:5173
```
Log in with `OWNER_USERNAME` / `OWNER_PASSWORD` from your `.env`, then change the password from the account menu.

## Quality checks (run before every phase sign-off)
```bash
pnpm --filter @az/shared build
pnpm -r typecheck
pnpm --filter @az/backend test            # unit + e2e on the *_test database
pnpm --filter @az/frontend test
pnpm build
E2E_PASSWORD=<owner password> pnpm --filter @az/frontend test:e2e   # with both apps running
```

## Docker (production-style)
```bash
cp .env.example .env    # fill in real secrets
docker compose up -d --build
docker compose exec backend node dist-seed/seed.js
```
The app is served on `127.0.0.1:8080`; the host Nginx terminates HTTPS (see `docs/DEPLOYMENT.md`).

## Ownership
Source code, database, hosting, domain and Meta Business account belong to AMIR ZAMEER.
No secrets are committed; all credentials come from environment variables.
