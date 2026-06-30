# Supershop Management System — Agent Context

## Identity

Enterprise supermarket management platform. Single organization, multiple physical stores.
All inventory/financial mutations must be atomic, auditable, and concurrency-safe.

## Tech Stack (locked)

- Monorepo: pnpm workspaces + Turborepo
- Frontend: Next.js (App Router), HeroUI, Tailwind CSS, TanStack Query, Zustand, react-hook-form + Zod
- Backend: NestJS (Fastify adapter), Mongoose, class-validator/Zod DTOs
- Database: MongoDB (Atlas, REPLICA SET — required for transactions)
- Cache/Queues: Redis + BullMQ
- Auth/Identity: Supabase (IdP only — issues JWTs; NOT used for data storage)
- Realtime data sync: NestJS WebSocket Gateway (Socket.IO)
- Human comms (audio/video/messaging): Agora RTC + RTM
- Shared types: packages/shared (DTOs, enums, Zod schemas, domain types)

## Hard Rules

1. Supabase = AUTHENTICATION ONLY. ALL AUTHORIZATION (RBAC) lives in NestJS + MongoDB.
2. Every POS checkout, payment, stock movement, transfer, and journal posting MUST run
   inside a MongoDB multi-document transaction (session.withTransaction).
3. Mutating endpoints that create money/stock movements MUST accept an Idempotency-Key
   header and dedupe on it.
4. Stock is decremented via FEFO (First-Expired-First-Out) across batches.
5. Source of truth for stock = append-only `stock_movements` ledger; `inventory.currentQty`
   is a denormalized cache updated in the SAME transaction as the movement.
6. NEVER do data sync (inventory, dashboards, notifications) over Agora — use WebSockets.
   Agora is ONLY for human audio/video/RTM signaling.
7. All money stored as integer minor units (e.g. paisa), never floats. Currency configurable.
   Use the `Money` helpers in `@supershop/shared`.
8. Every collection has: \_id, createdAt, updatedAt, createdBy, updatedBy, (softDeletedAt?).
9. No secrets in code or git. All config via env + platform secret store. Enforce secret scanning.
10. TypeScript strict everywhere. No `any` without an explicit, justified `// eslint-disable`.

## API Conventions

- Versioned: /api/v1/... (health probes /health/live, /health/ready stay at root)
- Response envelope: { success, data, meta?, error? }
- Errors: RFC-7807-style problem objects with stable machine-readable `code`.
- Pagination: cursor-based for large/append-heavy lists; page-based allowed for admin tables.
- Validation: every input validated by a DTO/Zod schema at the boundary. Reject unknown fields.
- OpenAPI/Swagger auto-generated and kept current.

## Coding Standards

- Feature-module architecture in NestJS (module/controller/service/repository/schema/dto).
- Thin controllers, fat services, repositories wrap Mongoose. No business logic in controllers.
- Domain logic must be unit-testable without a live DB (inject repository interfaces).
- Conventional Commits. One concern per commit. Small, reviewable diffs.
- Lint (ESLint) + format (Prettier) gates pass before any phase DoD.

## Definition of Done (global)

Code + tests + types + docs. No phase is "done" until tests pass, Swagger is updated,
and the phase-specific DoD checklist is fully satisfied.

---

## Build deviations from the source blueprint (verified against the npm registry)

These were chosen for a clean-building foundation and are intentional:

- **Next.js 16** (blueprint said 15). Latest major, App Router unchanged, and the version
  compatible with React 19 + HeroUI 3's `react >=19` peer.
- **TypeScript 5.x** (latest is 6.0.x). NestJS 11 relies on legacy decorators +
  `emitDecoratorMetadata`; TS 6 moves toward TC39 standard decorators and would risk
  breaking Nest's DI reflection. Pinned `^5` (excludes 6) monorepo-wide.
- **HeroUI v3** needs no provider (the blueprint's "HeroUIProvider" was a v2 concept).
  Setup is CSS-first: `@import "tailwindcss"; @import "@heroui/styles";` (order matters).
- **Dependency ranges are major-floor caret** (`^16`, `^11`, ...) because pnpm
  `minimumReleaseAge: 10080` (7-day supply-chain wait, in pnpm-workspace.yaml) is on; this
  resolves to well-aged versions within each major.

## Pinned major versions

Node 22 · pnpm 11 · Turborepo 2 · Next 16 · React 19 · HeroUI 3 · Tailwind 4 ·
NestJS 11 (Fastify 5) · Mongoose 9 · ioredis 5 · Zod 4 · TypeScript 5 · ESLint 10.

## Repo layout

- `apps/web` — Next.js (POS, back-office, dashboards)
- `apps/api` — NestJS (feature modules, guards, transactions, WS gateway, BullMQ)
- `packages/shared` — DTOs, enums, Zod schemas, domain types, Money utils
- `packages/config-ts`, `packages/config-eslint` — shared tooling config
- `docker/` — Mongo (single-node replica set) + Redis + optional mongo-express
- `docs/SCHEMA.md` — database blueprint (collections, transaction boundaries, indexes)
