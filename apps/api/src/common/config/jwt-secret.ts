const DEV_FALLBACK = 'orion-dev-secret';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !secret) {
    throw new Error('JWT_SECRET must be set when NODE_ENV=production');
  }

  return secret ?? DEV_FALLBACK;
}
