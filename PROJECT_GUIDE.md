# Orion Platform — Project Guide

A complete walkthrough of the Orion digital signage platform: what the product does, how the code is organized, how data flows, and how to run everything locally.

If you just want a quick start, see [`README.md`](./README.md). This document is the deep dive.

---

## 1. What is Orion?

Orion is a **multi-tenant digital signage CMS**. A customer ("Organization") signs up, creates media assets, groups them into campaigns and playlists, schedules them, and plays them on registered devices (screens). Operators of the platform itself (super admins, sales, support) manage tenants from a separate "Platform Portal".

High-level capabilities:

- **Asset Library** — upload images, videos, PDFs, HTML to cloud storage (S3) with presigned URLs.
- **Campaigns** — curated sequences of assets with durations.
- **Playlists** — orderings of campaigns, assignable to devices.
- **Schedule** — time/day rules dictating when playlists run.
- **Tickers** — scrolling text overlays with styles and priorities.
- **Devices** — registered players with telemetry (uptime, CPU/RAM, current content).
- **Proof of Play** — audit trail of what played where, and whether it succeeded.
- **Team & Permissions** — per-user role + per-feature access level inside each organization.
- **Audit Log** — every significant action recorded for compliance.

---

## 2. Repository layout

```text
Digital-Signage-Orion/
├── apps/
│   ├── web/              Next.js 16 dashboard (tenant + platform UI)
│   ├── api/              NestJS 11 REST API
│   └── worker/           Reserved for BullMQ background jobs (scaffold only)
├── packages/
│   ├── types/            Shared TypeScript types (SDK/contract)
│   ├── sdk/              Client SDK helpers
│   ├── ui/               Shared UI primitives
│   └── config/           Shared ESLint/TS config
├── prisma/
│   ├── schema.prisma     Single source of truth for the database
│   ├── migrations/       Prisma-managed SQL history
│   └── seed.ts           Local demo data
├── cms-dashboard/        Legacy Next.js build output (not active)
└── README.md / PROJECT_GUIDE.md
```

It's an **npm workspaces monorepo**; the root `package.json` lists `apps/*` and `packages/*`.

---

## 3. Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), React 19, Framer Motion, Lucide icons, `react-hot-toast`, `socket.io-client` |
| Backend | NestJS 11 on Express, global validation pipe, global `/api` prefix, CORS enabled |
| Auth | JWT (`@nestjs/jwt`) with bcrypt-hashed passwords; JWT guard on protected routes |
| ORM / DB | Prisma 6, PostgreSQL |
| Storage | AWS S3 (presigned PUT for uploads, presigned GET for downloads) via `@aws-sdk/client-s3` + `s3-request-presigner` |
| Realtime | `socket.io-client` wired on the web side (server channel TBD) |
| Tooling | TypeScript 5, ESLint 9, Prisma CLI, Nest CLI, `tsx` for seeds |

---

## 4. Data model (Prisma)

The domain splits cleanly into **platform users** (operators) and **tenant users** (customers working inside an org). Memberships bridge the two.

### Principals

- **`User`** — anyone with a login. Optional `platformRole` (`SUPER_ADMIN`, `PLATFORM_ADMIN`, `SALES`, `SUPPORT`) grants platform-wide access. Absent platform role ⇒ pure tenant user.
- **`Organization`** — a tenant. Has `status` (`DRAFT` → `ACTIVE` → `SUSPENDED`) and a unique `slug`.
- **`OrganizationMembership`** — joins a `User` to an `Organization` with an `OrganizationRole` (`ORG_ADMIN`, `MANAGER`, `CONTENT_EDITOR`, `ANALYST_VIEWER`) and `MembershipStatus`.
- **`MembershipFeaturePermission`** — fine-grained overrides: per `(membership, FeatureKey)` an `accessLevel` of `NONE | VIEW | EDIT | MANAGE | CONTROL`. The UI falls back to role defaults if no row exists.
- **`Invitation`** — signed-token invites by email; on accept, the target user + membership are created/updated.

### Content

- **`Asset`** — a file in S3 (`s3Key` is unique). Has `type` (`IMAGE | VIDEO | HTML | DOCUMENT`) and `status` (`UPLOADING → READY` or `ERROR`). Carries `mimeType`, `fileSize`, optional `width/height/durationMs`, and `tags[]`.
- **`Campaign`** — named collection of assets. `CampaignAsset` is the join with `position` + `durationSeconds`.
- **`Playlist`** — named sequence. `PlaylistItem` holds free-form items; `PlaylistCampaign` links playlists to campaigns in order. Playlists assign to `Device`s.
- **`ScheduleEvent`** — day-of-week + start/end time rules driving when a campaign plays. `status`, `priority`, `recurring`.
- **`Ticker`** — scrolling text with `speed`, `style`, `color`, `priority`, `status`.
- **`Device`** — a registered screen with location/IP/resolution + live-ish telemetry (`cpu`, `ram`, `temp`, `lastSync`, `status: ONLINE | OFFLINE | WARNING`) and a `currentPlaylistId`.
- **`ProofOfPlayLog`** — timestamped records of `(device, content, status)` — the audit log for playback.

### Platform audit

- **`AuditLog`** — generic `(actorUserId, organizationId?, action, targetType, targetId?, summary, metadata)`. Written from the API (e.g. `asset.uploaded`, `asset.deleted`).

All tenant-scoped tables cascade-delete with the Organization, so deleting a tenant is a clean sweep.

---

## 5. Authentication & authorization

1. **Bootstrap** — On an empty DB, `POST /api/auth/bootstrap/super-admin` creates the very first `SUPER_ADMIN`. After that, the endpoint is no-op.
2. **Login** — `POST /api/auth/login` returns a signed JWT (`JWT_SECRET`). The web app stores it and attaches `Authorization: Bearer <token>` on every API request (see `apps/web/src/lib/api.ts`).
3. **Me** — `GET /api/auth/me` (JWT-guarded) returns the resolved `RequestActor`: user id, email, `platformRole`, and active organization + role/permissions.
4. **Invitations** — Org admins post an `Invitation` to `organizations/:id/members/invitations`. The invitee accepts via `POST /api/auth/accept-invitation` with the token; the server creates the `User` (or updates existing) and an `OrganizationMembership`.

Authorization is enforced in the service layer. Every tenant-scoped service starts with `ensureOrganizationAccess(actor, organizationId)`, which:

- allows `SUPER_ADMIN` / `PLATFORM_ADMIN` unconditionally,
- else requires `actor.organization?.id === organizationId`,
- otherwise throws `ForbiddenException`.

Feature-level gates (e.g. "can this user edit assets?") are driven by `MembershipFeaturePermission` with role defaults computed in the web layer.

---

## 6. API surface

Base URL in dev: `http://localhost:3001/api`. Global prefix `/api` is set in `apps/api/src/main.ts`, with `cors: true`.

### Auth (`/api/auth`)
- `POST /bootstrap/super-admin` — first-run only.
- `POST /login` — email + password → JWT.
- `POST /accept-invitation` — token → user + membership.
- `GET /me` — JWT-guarded, returns current actor.

### Users (`/api/users`)
- `GET /` — list platform users.
- `POST /` — create platform user.

### Organizations (`/api/organizations`)
- `GET /`, `GET /:organizationId`, `POST /`, `PATCH /:organizationId/activate`
- `POST /:organizationId/first-admin-invitations` — seed the org's first admin.
- Members: `GET /:organizationId/members`, `POST /:organizationId/members`, `POST /:organizationId/members/invitations`
- Roles & permissions: `PATCH /:organizationId/members/:membershipId/role`, `PATCH /:organizationId/members/:membershipId/permissions`
- `DELETE /:organizationId/members/:membershipId`

### Assets (`/api/organizations/:organizationId/assets`)
- `POST /upload-url` — request presigned S3 PUT URL.
- `PATCH /:assetId/confirm` — finalize upload (API HEADs S3 to verify).
- `GET /` — list ready assets (paginated, filterable by `type`, `search`).
- `GET /:assetId` — asset + presigned download URL.
- `DELETE /:assetId` — delete S3 object + DB row.
- `PATCH /:assetId/tags` — update tags.

### Client data (`/api/client-data`)
Tenant-facing aggregate APIs used by the dashboard:
- `GET /dashboard`
- Campaigns: list/create/delete + asset attach/remove/reorder.
- Playlists: list/create/delete, reorder, assignment options, assign to devices.
- Schedule events: list/create/delete.
- Devices: list.
- Tickers: list/create/toggle/delete.
- Reports: `GET /reports`.

### Misc
- `GET /api/health` — liveness probe.
- `/uploads/*` — Express static mount at `ASSET_UPLOAD_DIR` (default `tmp/uploads`) with permissive CORS for legacy local-disk assets.

---

## 7. The asset upload flow (important)

Uploads use the standard **three-step S3 presigned URL** pattern:

```text
Browser                       API (Nest)                    S3
   │                              │                          │
   │ 1. POST /upload-url ─────────▶                          │
   │   { filename, mime, size }   │                          │
   │                              │  Create Asset row        │
   │                              │  (status=UPLOADING)      │
   │                              │  Generate s3Key          │
   │                              │  Presign PUT ────────────▶
   │ ◀──── { asset, uploadUrl } ──│                          │
   │                              │                          │
   │ 2. PUT <uploadUrl> ──────────┼─────────────────────────▶│
   │    (file body)               │                          │
   │ ◀────────── 200 OK ──────────┼──────────────────────────│
   │                              │                          │
   │ 3. PATCH /:assetId/confirm ──▶                          │
   │                              │  HEAD s3Key ────────────▶│
   │                              │ ◀──── size, contentType ─│
   │                              │  Update asset status=READY│
   │                              │  AuditLog "asset.uploaded"│
   │ ◀──── { asset, downloadUrl }─│                          │
```

Frontend: `apps/web/src/app/app/assets/page.tsx` → `handleFileUpload` (XHR for progress).
Backend: `apps/api/src/assets/assets.service.ts` (`requestUpload`, `confirmUpload`).
S3 wrapper: `apps/api/src/s3/s3.service.ts`.

### S3 configuration

All in `apps/api/.env`:

```env
S3_BUCKET=<bucket name>
S3_REGION=<e.g. ap-south-1>
S3_ACCESS_KEY_ID=<IAM user access key>
S3_SECRET_ACCESS_KEY=<IAM user secret>
S3_ENDPOINT=             # leave empty for AWS virtual-hosted, or set regional endpoint for path-style
S3_FORCE_PATH_STYLE=false  # true when using endpoint + path-style (MinIO, or to avoid bucket-subdomain DNS caches)
```

IAM policy needed on the bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject","s3:GetObject","s3:DeleteObject","s3:HeadObject"],
    "Resource": "arn:aws:s3:::YOUR_BUCKET/*"
  }]
}
```

**Bucket CORS** (Permissions → CORS) — required because the browser PUTs directly from the Next app:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": ["http://127.0.0.1:3000", "http://localhost:3000"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### Troubleshooting reference

| Symptom | Cause | Fix |
|---|---|---|
| `S3 upload network error` (browser XHR `onerror`) | Bucket CORS missing, or hostname doesn't resolve, or CORS preflight blocked | Add CORS JSON above; confirm bucket name/region |
| `getaddrinfo ENOTFOUND {bucket}.s3.{region}.amazonaws.com` in API logs | Bucket not created yet, or stale negative DNS cache on macOS | Create bucket, or `sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder`, or switch to path-style by setting `S3_ENDPOINT=https://s3.{region}.amazonaws.com` + `S3_FORCE_PATH_STYLE=true` |
| `getaddrinfo ENOTFOUND s3.{region}.amazonaws.com` | Process was launched inside a network-restricted sandbox | Start the API from a real terminal with normal network access |
| 403 `SignatureDoesNotMatch` on PUT | Wrong secret, clock skew, or content-type mismatch | Re-copy secret; ensure `xhr.setRequestHeader("Content-Type", file.type)` matches the presigned `ContentType` |
| 403 `AccessDenied` on HEAD during confirm | IAM user lacks `s3:HeadObject` / `s3:GetObject` | Extend IAM policy |
| `File not found in storage` (`BadRequestException`) | Browser PUT didn't reach S3 despite resolving | Check CORS, then retry; asset row is marked `ERROR` on failure |

---

## 8. Local development

### Prerequisites
- Node.js 20+ and npm 10+
- PostgreSQL 14+ (local or Docker)
- An S3 bucket (AWS or MinIO) for asset uploads

### One-time setup

```bash
# from repo root
npm install

# copy & edit env
cp apps/api/.env.example apps/api/.env
# then set DATABASE_URL, JWT_SECRET, S3_* values

# apply schema + seed demo data
npx prisma db push
npm run db:seed
```

### Daily commands

```bash
npm run dev:web        # Next.js on http://127.0.0.1:3000
npm run dev:api        # NestJS on http://localhost:3001/api
npm run dev:worker     # placeholder (BullMQ not wired yet)
```

Other scripts:

```bash
npm run build:web | build:api | build:worker
npm run lint:web
npm run db:push | db:seed | db:migrate | db:reset
npm run prisma:generate
```

### Demo accounts

Seeded by `prisma/seed.ts` (run `npm run db:seed`):

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@orion.dev` | `admin123` |
| Org Admin (Acme) | `orgadmin@acme.com` | `orgadmin123` |
| Content Editor (Acme) | `editor@acme.com` | `editor123` |
| Analyst Viewer (Acme) | `viewer@acme.com` | `viewer123` |

Log in at `http://127.0.0.1:3000/login`. Platform operators land on `/platform`; tenant users land on `/app`.

### Environment variables

`apps/api/.env`:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (Prisma) |
| `JWT_SECRET` | Signing secret for auth tokens |
| `PORT` | API port (default 3001) |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | S3 bucket + creds |
| `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` | Optional; for MinIO or path-style addressing |
| `ASSET_UPLOAD_DIR` | Optional local dir mounted at `/uploads/*` (legacy) |

Root `.env` holds `DATABASE_URL` for Prisma CLI commands run from the repo root (`prisma db push`, `db:seed`).

---

## 9. Frontend structure

`apps/web/src/app` uses Next.js App Router with two portals:

- `/app/*` — **tenant portal** (Acme's signage operators): dashboard, assets, campaigns, playlists, schedule, tickers, devices, designer, control, reports, settings.
- `/platform/*` — **platform portal** (Orion operators): organizations, team, billing, reminders, support, settings, reports.

Shared concerns live in `apps/web/src/lib/`:
- `api.ts` — `apiRequest<T>()` wrapper around `fetch` with JWT injection and a typed `ApiError`.
- Auth/session state is read from `GET /api/auth/me`.

UI is Tailwind-styled with Framer Motion transitions; toasts via `react-hot-toast`.

---

## 10. Backend structure

`apps/api/src/`:

```
main.ts                    boot + ValidationPipe + CORS + /api prefix
app.module.ts              wires all feature modules
prisma/                    PrismaService (singleton)
auth/                      login, bootstrap, invitations, JWT guard, /me
users/                     platform user CRUD
organizations/             tenant CRUD, memberships, invitations
assets/                    presigned-URL upload flow (see §7)
client-data/               aggregate endpoints for tenant dashboard
s3/                        S3Service wrapping AWS SDK v3 (sign, head, delete)
audit/                     AuditService (writes AuditLog)
health.controller.ts       GET /api/health
```

Every tenant-scoped controller mounts at `organizations/:organizationId/...` and its service calls `ensureOrganizationAccess(actor, organizationId)` first.

---

## 11. Worker (reserved)

`apps/worker` is a scaffold only. The intended use is BullMQ jobs: thumbnailing, video probing (ffprobe) to set `durationMs`, proof-of-play aggregation, scheduled-event fan-out to devices. When added it will consume the same `DATABASE_URL` and `S3_*` env.

---

## 12. Deployment notes

- **API**: single Node process, stateless, bind `PORT`. Requires `DATABASE_URL`, `JWT_SECRET`, `S3_*`. Run `prisma migrate deploy` on boot.
- **Web**: `next build` then `next start` (or deploy to Vercel). It needs the public API URL baked in as `NEXT_PUBLIC_API_URL` (see `apps/web/src/lib/api.ts`).
- **Database**: any managed Postgres.
- **Storage**: any S3-compatible bucket; set CORS to your production web origin(s).

---

## 13. Conventions & gotchas

- **Don't commit real credentials.** Rotate keys if you paste them anywhere they get logged.
- **Path-style vs virtual-host S3**: AWS is deprecating path-style for new buckets, but it remains the simplest escape hatch when bucket-subdomain DNS misbehaves locally. Keep path-style in dev, virtual-host in prod.
- **Nest watcher reloads on `.ts` change but not on `.env` change.** Restart `npm run dev:api` after editing env.
- **Prisma schema changes**: run `npm run db:migrate` (creates migration) in dev; `prisma db push` skips migration history for quick prototyping.
- **S3 key shape** is `{organizationId}/assets/{assetId}/{sanitized_filename}`. Filenames are sanitized to `[a-zA-Z0-9._-]` on the backend.

---

## 14. Where to look for things

| Question | File |
|---|---|
| What's the DB shape? | `prisma/schema.prisma` |
| How do I add a new API route? | a feature module under `apps/api/src/<feature>/` |
| How does login work? | `apps/api/src/auth/auth.service.ts` + `apps/web/src/lib/api.ts` |
| How do uploads work? | `apps/api/src/assets/*` + `apps/web/src/app/app/assets/page.tsx` |
| How do I seed data? | `prisma/seed.ts`, run `npm run db:seed` |
| Where are demo creds? | §8 of this doc, or `prisma/seed.ts` |
| What env vars exist? | §8 of this doc, or `apps/api/.env.example` |

---

Happy hacking. If you add a significant module or change the asset pipeline, update this guide.
