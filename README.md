# Orion Platform

This repository is the `orion-platform` monorepo for the CMS platform.

The Android player has been prepared as a separate standalone folder at:

- `/Users/aman/Documents/Coding/orion-android-player`

## Commands

Run these from `/Users/aman/Documents/Coding/Digital-Signage-Orion`.

```bash
npm install
npm run dev:web
npm run dev:api
npm run dev:worker
```

Useful scripts:

```bash
npm run build:web
npm run build:api
npm run build:worker
npm run lint:web
```

## Structure

```text
apps/
  web/
  api/
  worker/
packages/
  types/
  sdk/
  config/
  ui/
prisma/
```

## Notes

- `apps/web` is the current Next.js dashboard.
- `apps/api` is now wired as a NestJS app scaffold.
- `apps/api/legacy` keeps the old Express/Mongo prototype for reference during migration.
- `apps/worker` is reserved for BullMQ/background processing.
- `fix_ui.js` remains as a local helper script for the dashboard codebase.

## Auth & tenancy (Prisma)

The data model in `prisma/schema.prisma` separates **platform** users from **tenant** users:

| Concept | Model | Purpose |
|--------|--------|--------|
| Platform account | `User` with `platformRole` | Internal operators: `SUPER_ADMIN`, `PLATFORM_ADMIN`, `SALES`, `SUPPORT`. No org required for elevated UI. |
| Tenant | `Organization` | Customer / signage account (`DRAFT` → `ACTIVE`). Unique `slug`. |
| Membership | `OrganizationMembership` | Links a `User` to one org with `OrganizationRole` (`ORG_ADMIN`, `MANAGER`, `CONTENT_EDITOR`, `ANALYST_VIEWER`) and `MembershipStatus`. |
| Feature ACL | `MembershipFeaturePermission` | Per-membership `FeatureKey` + `FeatureAccessLevel` (`NONE` … `CONTROL`). The web app falls back to role defaults when a feature has no row. |
| Invite | `Invitation` | Pending org invites with token; acceptance creates/updates user + membership (`POST /api/auth/accept-invitation`). |

**API routes** (global prefix `/api`): `POST /api/auth/bootstrap/super-admin` (first super admin only), `POST /api/auth/login`, `GET /api/auth/me`, plus organization/member endpoints in `organizations` and `users` modules.

## Demo data (local seed)

With PostgreSQL running and `DATABASE_URL` set (copy `apps/api/.env.example` → `apps/api/.env`), apply the schema and seed demo users:

```bash
npm install
npx prisma db push
npm run db:seed
```

Default password for **all** seeded accounts (override with `ORION_SEED_PASSWORD`):

- **`OrionDemo!2026`**

| Email | Role |
|-------|------|
| `superadmin@demo.local` | Platform `SUPER_ADMIN` |
| `acme-admin@demo.local` | Org admin (`ORG_ADMIN`) — *Acme Digital Signage (Demo)* |
| `acme-manager@demo.local` | `MANAGER` |
| `acme-editor@demo.local` | `CONTENT_EDITOR` |
| `acme-analyst@demo.local` | `ANALYST_VIEWER` |

Organization slug: **`acme-demo`** (active). Re-running the seed updates passwords and syncs memberships (idempotent).
