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
