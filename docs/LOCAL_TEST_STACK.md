# Local layout test stack

This stack runs an isolated PostgreSQL database and a filesystem-backed S3-compatible server in Docker. It does not read or modify the repository's root `.env`. Local configuration is generated at `tmp/local-stack/local.env` and is ignored by Git. Database rows and S3 objects persist across restarts.

## Start

Install project dependencies and have Docker Desktop or Colima available. On this Mac, `local:up` starts the installed Colima VM if needed. Run from the repository root:

```bash
npm run local:up
```

The command starts PostgreSQL on `127.0.0.1:55432` and the S3 API on `127.0.0.1:59000`. It creates the `orion-assets` bucket, applies Prisma migrations, and seeds demo accounts. Re-running it preserves database rows and uploaded objects.

In separate terminals, start the API and CMS with the generated local configuration:

```bash
npm run local:api
npm run local:web
```

Open `http://localhost:3000` and log in as `orgadmin@acme.com` / `orgadmin123` to use the seeded organization. Canvas is under the client menu. `npm run local:status` shows both services; `npm run local:down` stops them without deleting data. The local API is at `http://127.0.0.1:3001/api`.

To verify signed uploads and downloads again, run:

```bash
node --env-file=tmp/local-stack/local.env scripts/local-s3-smoke.mjs
```

## Test with an Android player

The player and its signed S3 download URLs must use a host address that the player can reach. For a physical device or Android emulator, start the stack with your Mac's LAN IPv4 address:

```bash
ORION_LOCAL_HOST=192.168.1.20 npm run local:up
npm run local:api
npm run local:web
```

Replace the example address with your Mac's current LAN address. Set the Android player's API base URL to `http://192.168.1.20:3001` and pair it through the CMS. Re-running `local:up` after changing `ORION_LOCAL_HOST` updates the API and signed media URL host while preserving database and object data. Allow ports 3001 and 59000 through the Mac firewall for the device. Use this mode on a trusted test network.

## Isolation

Use the `local:api` and `local:web` commands for local testing. They load `tmp/local-stack/local.env` explicitly, which prevents the existing root `.env` from pointing the API at another database. `npm run local:up` refuses to migrate unless the generated URL names the local test database. The stack leaves the root `.env` untouched.
