## API App

This app now runs on NestJS with a Prisma/PostgreSQL data model for multi-tenant access control.

Current foundation:
- `auth/` handles bootstrap, login, invitation acceptance, JWT session lookup, and guards
- `users/` manages internal platform users such as `SUPER_ADMIN`, `PLATFORM_ADMIN`, `SALES`, and `SUPPORT`
- `organizations/` manages tenant onboarding, first-admin invitation flow, membership invites, and member role changes
- `audit/` records role-sensitive actions for traceability
- `prisma/` centralizes the database client

Key endpoints:
- `POST /api/auth/bootstrap/super-admin`
- `POST /api/auth/login`
- `POST /api/auth/accept-invitation`
- `GET /api/auth/me`
- `GET /api/platform-users`
- `POST /api/platform-users`
- `GET /api/organizations`
- `GET /api/organizations/:organizationId`
- `POST /api/organizations`
- `PATCH /api/organizations/:organizationId/activate`
- `POST /api/organizations/:organizationId/first-admin-invitations`
- `GET /api/organizations/:organizationId/members`
- `POST /api/organizations/:organizationId/members/invitations`
- `PATCH /api/organizations/:organizationId/members/:membershipId/role`
- `DELETE /api/organizations/:organizationId/members/:membershipId`

Setup:
1. Copy `apps/api/.env.example` to `apps/api/.env`
2. Point `DATABASE_URL` at a running PostgreSQL instance
3. Run `npm run prisma:generate`
4. Run `npm run dev:api`

Legacy Express/Mongo prototype code is preserved in `legacy/` so domain logic can be migrated incrementally into Nest modules, Prisma models, queues, and Socket.IO gateways.
