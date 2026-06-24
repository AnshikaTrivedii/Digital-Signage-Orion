import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';

// Load environment variables from the nearest .env file, searching upward from the
// current working directory (the API may run with CWD set to apps/api in a monorepo,
// while the .env lives at the repository root).
//
// `override: true` makes the .env file authoritative during development, even if a
// stale variable (e.g. DATABASE_URL) was inherited from the launching shell. This
// prevents the dev server from silently connecting to the wrong database when an old
// value lingers in the environment.
//
// In production (e.g. Render) there is typically no .env file, so platform-provided
// environment variables are left untouched.
function loadEnv() {
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate, override: true });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: default dotenv behavior (no-op if no .env present).
  dotenv.config({ override: true });
}

loadEnv();
