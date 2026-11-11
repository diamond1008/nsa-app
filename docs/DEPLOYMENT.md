# Production deployment and rollback

The supported deployment is Docker Compose behind Caddy. PostgreSQL and the app containers share an internal network; only Caddy publishes ports 80/443.

## First deployment (Ubuntu 24.04 LTS VPS on iNET)

1. Provision an Ubuntu 24.04 LTS VPS (`>= 2 vCPU`, `4 GB RAM`, `40 GB SSD` recommended) with a 2 GB swapfile (`/swapfile`). Install Docker Engine (`>= 26`) with the Compose v2 plugin. Point the DNS A/AAAA record for `APP_DOMAIN` at the VPS public IP and allow inbound TCP 22, 80, 443 plus UDP 443 via UFW (`ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw enable`).
2. Clone a reviewed release commit. Copy `.env.production.example` to `.env.production` and replace every example value. Generate the database password and JWT secret from a cryptographically secure source.
3. Keep `.env.production` readable only by the deployment account. Do not paste it into tickets, logs, or commits.
4. Validate and start:

```sh
docker compose --env-file .env.production -f compose.production.yaml config --quiet
docker compose --env-file .env.production -f compose.production.yaml build --pull
docker compose --env-file .env.production -f compose.production.yaml up -d
docker compose --env-file .env.production -f compose.production.yaml ps
curl --fail https://training.example.com/health
curl --fail https://training.example.com/ready
```

The one-shot `migrate` service must finish successfully before the API starts. Never run `database/seeds/dev.sql` or `database/seeds/e2e.sql` in production.

## Routine release

Create and verify a backup first, pull the desired commit, build images, then run `up -d`. Inspect `docker compose ... logs --since 10m api caddy migrate` and both health endpoints. Structured API logs contain request ID, route, status, size, and duration, but intentionally exclude bodies and credentials.

## Rollback

Application-only rollback: check out the prior release tag/commit, rebuild, and run `up -d`. Database migrations should be backward-compatible for at least one application release.

If a migration itself must be reversed, stop writes first, take a fresh backup, inspect the migration `Down` section, and run exactly one reviewed rollback:

```sh
docker compose --env-file .env.production -f compose.production.yaml run --rm \
  --entrypoint sh migrate -c 'goose -dir /migrations postgres "$DATABASE_URL" down'
```

Restore from backup only as an incident procedure because it discards data written after the backup. See [OPERATIONS.md](OPERATIONS.md).
