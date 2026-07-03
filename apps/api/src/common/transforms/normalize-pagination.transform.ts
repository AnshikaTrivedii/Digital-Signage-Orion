import { Transform } from 'class-transformer';

export function NormalizeLimit(defaultLimit = 100, max = 500) {
  return Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return defaultLimit;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return defaultLimit;
    }
    return Math.min(max, Math.max(1, Math.trunc(numeric)));
  });
}

export function NormalizePage(defaultPage = 1) {
  return Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return defaultPage;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return defaultPage;
    }
    return Math.max(1, Math.trunc(numeric));
  });
}
