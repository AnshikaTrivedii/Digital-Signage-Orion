import {
  canApplyDeviceGpsToInstallation,
  composeLocationLabel,
  hasInstallationCoordinates,
  isValidCoordinate,
  metersBetween,
  shouldAcceptGpsSample,
} from '../apps/api/src/device-location/location.utils';
import { DeviceLocationSource } from '@prisma/client';

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok  ${message}`);
  }
}

const lucknow = { latitude: 26.8467, longitude: 80.9462 };
const delhi = { latitude: 28.6139, longitude: 77.209 };
const sameSpot = { latitude: 26.8467, longitude: 80.94625 };

assert(isValidCoordinate(lucknow), 'Lucknow coordinates are valid');
assert(!isValidCoordinate({ latitude: 91, longitude: 80 }), 'Latitude 91 is rejected');
assert(!hasInstallationCoordinates({ installLatitude: null, installLongitude: null }), 'Missing coords are not mappable');
assert(hasInstallationCoordinates({ installLatitude: lucknow.latitude, installLongitude: lucknow.longitude }), 'Valid install coords count as configured');

const km = metersBetween(lucknow, delhi);
assert(km > 400_000 && km < 500_000, `Lucknow–Delhi distance is realistic (${Math.round(km / 1000)} km)`);

const first = shouldAcceptGpsSample(null, lucknow);
assert(first.accept && first.reason === 'FIRST', 'First GPS sample is accepted');

const unchanged = shouldAcceptGpsSample(
  { ...lucknow, reportedAt: new Date('2026-09-21T00:00:00.000Z') },
  sameSpot,
);
assert(!unchanged.accept && unchanged.reason === 'UNCHANGED', 'Sub-50m GPS jitter is ignored');

const tooSoon = shouldAcceptGpsSample(
  { ...lucknow, reportedAt: new Date() },
  delhi,
);
assert(!tooSoon.accept && tooSoon.reason === 'TOO_FREQUENT', 'Material GPS moves inside 15 minutes are throttled');

const moved = shouldAcceptGpsSample(
  { ...lucknow, reportedAt: new Date('2026-09-21T00:00:00.000Z') },
  delhi,
  new Date('2026-09-21T01:00:00.000Z'),
);
assert(moved.accept && moved.reason === 'MOVED', 'A later material GPS move is accepted');

assert(
  !canApplyDeviceGpsToInstallation({
    locationSource: DeviceLocationSource.ADMIN_ASSIGNED,
    allowDeviceLocationUpdates: false,
    installLatitude: lucknow.latitude,
    installLongitude: lucknow.longitude,
  }),
  'Admin-assigned installation is locked against GPS overwrite',
);

assert(
  canApplyDeviceGpsToInstallation({
    locationSource: DeviceLocationSource.ADMIN_ASSIGNED,
    allowDeviceLocationUpdates: true,
    installLatitude: lucknow.latitude,
    installLongitude: lucknow.longitude,
  }),
  'Explicit allowDeviceLocationUpdates unlocks GPS overwrite',
);

assert(
  canApplyDeviceGpsToInstallation({
    locationSource: DeviceLocationSource.DEVICE_GPS,
    allowDeviceLocationUpdates: false,
    installLatitude: lucknow.latitude,
    installLongitude: lucknow.longitude,
  }),
  'GPS-sourced installation may be refreshed by later GPS',
);

assert(
  composeLocationLabel({ address: 'Phoenix Mall', city: 'Lucknow', state: 'Uttar Pradesh' })
    === 'Phoenix Mall, Lucknow, Uttar Pradesh',
  'Address label composes without duplicates',
);

if (process.exitCode) {
  console.error('location.utils tests failed');
  process.exit(1);
}

console.log('location.utils tests passed');
