# Supershop Management System

Enterprise supermarket/supershop operations platform — procurement → inventory → POS →
finance → reporting. Single organization, multiple stores.

**Stack:** Next.js 16 + HeroUI 3 · NestJS 11 (Fastify) · MongoDB (replica set) · Redis ·
Supabase (auth) · Agora (RTC/RTM). pnpm + Turborepo monorepo. See [CLAUDE.md](./CLAUDE.md)
for architecture and [docs/SCHEMA.md](./docs/SCHEMA.md) for the data model.

## Prerequisites

- Node.js >= 22 and Corepack (`corepack enable` activates pnpm 11)
- Docker (for MongoDB replica set + Redis)

## Quick start

```bash
# 1. Install
pnpm install

# 2. Start infra (Mongo single-node replica set + Redis). The mongo-init service
#    runs rs.initiate() automatically so transactions work.
docker compose -f docker/docker-compose.yml up -d

# 3. Configure env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 4. Run web + api (Turbo builds packages/shared first)
pnpm dev
```

- Web: http://localhost:3000
- API liveness: http://localhost:3001/health/live
- API readiness (checks Mongo + Redis): http://localhost:3001/health/ready
- Optional Mongo UI: `docker compose -f docker/docker-compose.yml --profile tools up -d` → http://localhost:8081

## Scripts (run from repo root)

| Command          | What                               |
| ---------------- | ---------------------------------- |
| `pnpm dev`       | Run web + api in watch mode        |
| `pnpm build`     | Build all packages and apps        |
| `pnpm lint`      | ESLint across the monorepo         |
| `pnpm typecheck` | `tsc --noEmit` across the monorepo |
| `pnpm test`      | Run package/app tests              |
| `pnpm format`    | Prettier write                     |

## Monorepo layout

```
apps/web        Next.js 16 (App Router, HeroUI 3, Tailwind 4)
apps/api        NestJS 11 (Fastify, Mongoose, ioredis, Zod-validated env)
packages/shared @supershop/shared — enums, Money utils, domain types
packages/config-ts, packages/config-eslint — shared tooling config
docker/         MongoDB replica set + Redis (+ optional mongo-express)
```

## Security

- Secrets never reach git: `.env*` is gitignored; a pre-commit hook runs **gitleaks**
  (local binary or Docker) plus Prettier via lint-staged.
- pnpm supply-chain hardening is on (`minimumReleaseAge`, `blockExoticSubdeps`,
  `trustPolicy: no-downgrade`) in `pnpm-workspace.yaml`.

## Development is phased

This repo is built phase-by-phase (Phase 0 = this foundation). Each phase has a Definition
of Done that must be green before the next begins.
