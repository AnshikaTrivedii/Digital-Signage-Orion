export type QueuedPopLog = {
  assetName: string;
  playlistId: string;
  playlistName?: string;
  campaignName?: string;
  assetId?: string;
  status: 'VERIFIED' | 'FAILED';
  startTime: string;
  endTime?: string;
  durationSeconds?: number;
};

export type PopLogBatchMessage = {
  organizationId: string;
  deviceId: string;
  deviceName: string;
  receivedAt: string;
  logs: QueuedPopLog[];
};

export function popLogDedupeKey(log: { deviceId: string; assetName: string; startTime: string }) {
  return `${log.deviceId}|${log.assetName}|${log.startTime}`;
}
