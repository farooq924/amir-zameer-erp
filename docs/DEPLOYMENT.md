# Deployment (summary - completed in Phase 10)

1. Ubuntu VPS with Docker + Docker Compose and Nginx on the host.
2. `git clone` the repository, `cp .env.example .env`, set strong values for `POSTGRES_PASSWORD`, `OWNER_PASSWORD`, `APP_URL=https://<domain>`.
3. `docker compose up -d --build`, then `docker compose exec backend node dist-seed/seed.js` once.
4. Host Nginx: proxy `https://<domain>` to `http://127.0.0.1:8080`; obtain SSL with `certbot --nginx -d <domain>`.
5. Backend runs with `COOKIE_SECURE=true` and `TRUST_PROXY=true` (set in docker-compose.yml).
6. PostgreSQL is not exposed to the internet (no published port).
7. Automated encrypted backups, restore testing and monitoring are delivered in Phase 10.
