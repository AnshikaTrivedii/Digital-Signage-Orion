import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DeviceLocationSource, DeviceStatus, Prisma } from '@prisma/client';
import { DeviceManagementService } from '../device-management/device-management.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  canApplyDeviceGpsToInstallation,
  composeLocationLabel,
  hasInstallationCoordinates,
  isOperatorConfirmedSource,
  isValidCoordinate,
  locationSourceLabel,
  shouldAcceptGpsSample,
} from './location.utils';

type NominatimSearchHit = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    road?: string;
    pedestrian?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
};

const GEOCODER_USER_AGENT = 'OrionCMS/1.0 (installation-location)';

@Injectable()
export class DeviceLocationService {
  private readonly logger = new Logger(DeviceLocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceManagement: DeviceManagementService,
  ) {}

  async listDashboardLocations(organizationId: string) {
    const devices = await this.prisma.device.findMany({
      where: { organizationId, isPaired: true },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        lastSuccessfulSyncAt: true,
        cacheLastReportedAt: true,
        lastSync: true,
        playerVersion: true,
        location: true,
        installLatitude: true,
        installLongitude: true,
        installAddress: true,
        installCity: true,
        installState: true,
        installCountry: true,
        installPostalCode: true,
        locationSource: true,
        locationUpdatedAt: true,
        currentPlaylist: { select: { name: true } },
        currentLayout: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });

    const mapped = devices
      .filter((device) => hasInstallationCoordinates(device))
      .map((device) => {
        const status = this.deviceManagement.resolveEffectiveStatus(device);
        return {
          deviceId: device.id,
          name: device.name,
          latitude: device.installLatitude as number,
          longitude: device.installLongitude as number,
          status: status === DeviceStatus.WARNING ? 'WARNING' : status,
          online: status !== DeviceStatus.OFFLINE,
          playlistName: device.currentPlaylist?.name ?? device.currentLayout?.name ?? null,
          lastSyncAt: device.lastSuccessfulSyncAt?.toISOString()
            ?? device.cacheLastReportedAt?.toISOString()
            ?? (device.lastSync !== 'Awaiting first sync' ? device.lastSync : null),
          address: device.installAddress ?? null,
          city: device.installCity ?? null,
          state: device.installState ?? null,
          country: device.installCountry ?? null,
          postalCode: device.installPostalCode ?? null,
          locationLabel: composeLocationLabel({
            address: device.installAddress,
            city: device.installCity ?? device.location,
            state: device.installState,
            country: device.installCountry,
          }) ?? (device.location !== 'Pending' ? device.location : null),
          playerVersion: device.playerVersion || null,
          locationSource: device.locationSource,
          locationSourceLabel: locationSourceLabel(device.locationSource),
          locationUpdatedAt: device.locationUpdatedAt?.toISOString() ?? null,
        };
      });

    const latestUpdate = mapped.reduce<string | null>((latest, device) => {
      if (!device.locationUpdatedAt) return latest;
      if (!latest || device.locationUpdatedAt > latest) return device.locationUpdatedAt;
      return latest;
    }, null);

    return {
      screens: mapped.length,
      totalDevices: devices.length,
      updatedAt: latestUpdate ?? new Date().toISOString(),
      devices: mapped,
    };
  }

  serializeInstallation(device: {
    location: string;
    installLatitude?: number | null;
    installLongitude?: number | null;
    installAddress?: string | null;
    installCity?: string | null;
    installState?: string | null;
    installCountry?: string | null;
    installPostalCode?: string | null;
    locationSource?: DeviceLocationSource | null;
    locationAccuracyMeters?: number | null;
    locationUpdatedAt?: Date | null;
    allowDeviceLocationUpdates?: boolean | null;
    lastGpsLatitude?: number | null;
    lastGpsLongitude?: number | null;
    lastGpsAccuracyMeters?: number | null;
    lastGpsAt?: Date | null;
  }) {
    const configured = hasInstallationCoordinates(device);
    return {
      latitude: configured ? device.installLatitude : null,
      longitude: configured ? device.installLongitude : null,
      address: device.installAddress ?? null,
      city: device.installCity ?? null,
      state: device.installState ?? null,
      country: device.installCountry ?? null,
      postalCode: device.installPostalCode ?? null,
      source: device.locationSource ?? null,
      sourceLabel: locationSourceLabel(device.locationSource),
      accuracyMeters: device.locationAccuracyMeters ?? null,
      updatedAt: device.locationUpdatedAt?.toISOString() ?? null,
      allowDeviceLocationUpdates: Boolean(device.allowDeviceLocationUpdates),
      configured,
      displayLabel: composeLocationLabel({
        address: device.installAddress,
        city: device.installCity,
        state: device.installState,
        country: device.installCountry,
      }) ?? (device.location !== 'Pending' ? device.location : null),
      lastGps: typeof device.lastGpsLatitude === 'number' && typeof device.lastGpsLongitude === 'number'
        ? {
            latitude: device.lastGpsLatitude,
            longitude: device.lastGpsLongitude,
            accuracyMeters: device.lastGpsAccuracyMeters ?? null,
            reportedAt: device.lastGpsAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  async assignInstallationLocation(
    organizationId: string,
    deviceId: string,
    body: {
      latitude: number;
      longitude: number;
      address?: string;
      city?: string;
      state?: string;
      country?: string;
      postalCode?: string;
      allowDeviceLocationUpdates?: boolean;
      geocoded?: boolean;
    },
  ) {
    if (!isValidCoordinate(body)) {
      throw new BadRequestException('Valid latitude and longitude are required');
    }

    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId },
    });
    if (!device) throw new NotFoundException('Device not found');

    const address = body.address?.trim() || null;
    const city = body.city?.trim() || null;
    const state = body.state?.trim() || null;
    const country = body.country?.trim() || null;
    const postalCode = body.postalCode?.trim() || null;
    const label = composeLocationLabel({ address, city, state, country });
    const source = body.geocoded ? DeviceLocationSource.GEOCODED : DeviceLocationSource.ADMIN_ASSIGNED;

    return this.prisma.device.update({
      where: { id: deviceId },
      data: {
        installLatitude: body.latitude,
        installLongitude: body.longitude,
        installAddress: address,
        installCity: city,
        installState: state,
        installCountry: country,
        installPostalCode: postalCode,
        locationSource: source,
        locationAccuracyMeters: null,
        locationUpdatedAt: new Date(),
        allowDeviceLocationUpdates: body.allowDeviceLocationUpdates ?? device.allowDeviceLocationUpdates,
        ...(label ? { location: label } : {}),
      },
      include: {
        currentPlaylist: { select: { name: true } },
        currentLayout: { select: { name: true } },
      },
    });
  }

  async clearInstallationLocation(organizationId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId },
      select: { id: true },
    });
    if (!device) throw new NotFoundException('Device not found');

    return this.prisma.device.update({
      where: { id: deviceId },
      data: {
        installLatitude: null,
        installLongitude: null,
        installAddress: null,
        installCity: null,
        installState: null,
        installCountry: null,
        installPostalCode: null,
        locationSource: null,
        locationAccuracyMeters: null,
        locationUpdatedAt: new Date(),
        location: 'Pending',
      },
      include: {
        currentPlaylist: { select: { name: true } },
        currentLayout: { select: { name: true } },
      },
    });
  }

  async reportPlayerGps(
    deviceId: string,
    sample: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      capturedAt?: string;
      address?: string;
      city?: string;
      state?: string;
      country?: string;
      postalCode?: string;
    },
  ) {
    if (!isValidCoordinate(sample)) {
      throw new BadRequestException('Valid GPS latitude and longitude are required');
    }

    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Device not found');

    const now = sample.capturedAt ? new Date(sample.capturedAt) : new Date();
    const capturedAt = Number.isNaN(now.getTime()) ? new Date() : now;
    const previous =
      typeof device.lastGpsLatitude === 'number' && typeof device.lastGpsLongitude === 'number'
        ? {
            latitude: device.lastGpsLatitude,
            longitude: device.lastGpsLongitude,
            reportedAt: device.lastGpsAt,
          }
        : null;

    const decision = shouldAcceptGpsSample(previous, sample, capturedAt);
    if (!decision.accept) {
      return {
        accepted: false,
        reason: decision.reason,
        appliedToInstallation: false,
        locationSource: device.locationSource,
        allowDeviceLocationUpdates: device.allowDeviceLocationUpdates,
      };
    }

    const applyToInstallation = canApplyDeviceGpsToInstallation(device);
    const address = sample.address?.trim() || null;
    const city = sample.city?.trim() || null;
    const state = sample.state?.trim() || null;
    const country = sample.country?.trim() || null;
    const postalCode = sample.postalCode?.trim() || null;
    const label = composeLocationLabel({ address, city, state, country });

    const data: Prisma.DeviceUpdateInput = {
      lastGpsLatitude: sample.latitude,
      lastGpsLongitude: sample.longitude,
      lastGpsAccuracyMeters: sample.accuracyMeters ?? null,
      lastGpsAt: capturedAt,
    };

    if (applyToInstallation) {
      data.installLatitude = sample.latitude;
      data.installLongitude = sample.longitude;
      data.locationSource = DeviceLocationSource.DEVICE_GPS;
      data.locationAccuracyMeters = sample.accuracyMeters ?? null;
      data.locationUpdatedAt = capturedAt;
      if (address) data.installAddress = address;
      if (city) data.installCity = city;
      if (state) data.installState = state;
      if (country) data.installCountry = country;
      if (postalCode) data.installPostalCode = postalCode;
      if (label && (device.location === 'Pending' || !isOperatorConfirmedSource(device.locationSource))) {
        data.location = label;
      }
    }

    await this.prisma.device.update({ where: { id: deviceId }, data });

    return {
      accepted: true,
      reason: decision.reason,
      appliedToInstallation: applyToInstallation,
      locationSource: applyToInstallation ? DeviceLocationSource.DEVICE_GPS : device.locationSource,
      allowDeviceLocationUpdates: device.allowDeviceLocationUpdates,
    };
  }

  locationPolicy(device: {
    allowDeviceLocationUpdates: boolean;
    locationSource: DeviceLocationSource | null;
    installLatitude?: number | null;
    installLongitude?: number | null;
  }) {
    return {
      allowDeviceLocationUpdates: device.allowDeviceLocationUpdates,
      hasInstallationLocation: hasInstallationCoordinates(device),
      locationSource: device.locationSource,
      installationLocked: hasInstallationCoordinates(device)
        && !canApplyDeviceGpsToInstallation(device),
    };
  }

  async searchAddresses(query: string) {
    const q = query.trim();
    if (q.length < 2) return [];
    const url = new URL(this.geocoderBase() + '/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '6');
    const hits = await this.fetchNominatim<NominatimSearchHit[]>(url);
    return hits
      .map((hit) => this.normalizeNominatim(hit))
      .filter((hit): hit is NonNullable<typeof hit> => hit != null);
  }

  async reverseGeocode(latitude: number, longitude: number) {
    if (!isValidCoordinate({ latitude, longitude })) {
      throw new BadRequestException('Valid latitude and longitude are required');
    }
    const url = new URL(this.geocoderBase() + '/reverse');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    const hit = await this.fetchNominatim<NominatimSearchHit>(url);
    return this.normalizeNominatim(hit);
  }

  private geocoderBase() {
    return (process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
  }

  private async fetchNominatim<T>(url: URL): Promise<T> {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': process.env.GEOCODER_USER_AGENT || GEOCODER_USER_AGENT,
      },
    });
    if (!response.ok) {
      this.logger.warn(`Geocoder ${response.status} ${url.pathname}`);
      throw new BadRequestException('Address lookup is temporarily unavailable');
    }
    return (await response.json()) as T;
  }

  private normalizeNominatim(hit: NominatimSearchHit | null | undefined) {
    const latitude = Number(hit?.lat);
    const longitude = Number(hit?.lon);
    if (!isValidCoordinate({ latitude, longitude })) return null;
    const address = hit?.address;
    const line = [address?.road || address?.pedestrian, address?.neighbourhood || address?.suburb]
      .filter(Boolean)
      .join(', ');
    return {
      latitude,
      longitude,
      label: hit?.display_name ?? composeLocationLabel({
        address: line,
        city: address?.city || address?.town || address?.village,
        state: address?.state,
        country: address?.country,
      }),
      address: line || null,
      city: address?.city || address?.town || address?.village || null,
      state: address?.state || null,
      country: address?.country || null,
      postalCode: address?.postcode || null,
    };
  }
}
