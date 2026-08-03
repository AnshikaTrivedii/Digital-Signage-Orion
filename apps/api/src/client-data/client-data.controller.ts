import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { ClientDataService } from './client-data.service';
import { AddPlaylistAssetDto } from './dto/add-playlist-asset.dto';
import { CreateDeviceDto } from './dto/create-device.dto';
import { PairDeviceDto } from './dto/pair-device.dto';
import { ReorderPlaylistAssetsDto } from './dto/reorder-playlist-assets.dto';
import { UpdatePlaylistAssetDurationDto } from './dto/update-playlist-asset-duration.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { CreateScheduleEventDto } from './dto/create-schedule-event.dto';
import { UpdateScheduleEventDto } from './dto/update-schedule-event.dto';
import { CreateTickerDto } from './dto/create-ticker.dto';
import { UpdateTickerDto } from './dto/update-ticker.dto';
import { ReportsQueryDto } from './dto/reports-query.dto';
import { AssignLayoutDto } from './dto/assign-layout.dto';
import { DeviceLogsQueryDto } from '../device-management/dto/device-logs-query.dto';
import { UpdateDeviceFeaturesDto } from '../device-management/dto/update-device-features.dto';
import { UpdateDeviceDisplaySettingsDto } from '../device-management/dto/update-device-display-settings.dto';
import { UpdateDevicePlaybackSettingsDto } from '../device-management/dto/update-device-playback-settings.dto';
import { CreateLayoutDto } from './dto/create-layout.dto';
import { SaveLayoutZonesDto } from './dto/save-layout-zones.dto';
import { UpdateLayoutDto } from './dto/update-layout.dto';

@Controller('client-data')
@UseGuards(JwtAuthGuard)
export class ClientDataController {
  constructor(private readonly clientDataService: ClientDataService) {}

  @Get('dashboard')
  dashboard(@CurrentActor() actor: RequestActor) {
    return this.clientDataService.dashboard(actor);
  }

  @Get('playlists')
  listPlaylists(@CurrentActor() actor: RequestActor) {
    return this.clientDataService.listPlaylists(actor);
  }

  @Post('playlists')
  createPlaylist(@CurrentActor() actor: RequestActor, @Body() body: { name: string }) {
    return this.clientDataService.createPlaylist(actor, body);
  }

  @Delete('playlists/:playlistId')
  deletePlaylist(@CurrentActor() actor: RequestActor, @Param('playlistId') playlistId: string) {
    return this.clientDataService.deletePlaylist(actor, playlistId);
  }

  @Patch('playlists/:playlistId/reorder')
  reorderPlaylistItems(
    @CurrentActor() actor: RequestActor,
    @Param('playlistId') playlistId: string,
    @Body() body: { itemIds: string[] },
  ) {
    return this.clientDataService.reorderPlaylistItems(actor, playlistId, body);
  }

  @Get('playlists/assignment-options')
  playlistAssignmentOptions(@CurrentActor() actor: RequestActor) {
    return this.clientDataService.playlistAssignmentOptions(actor);
  }

  @Patch('playlists/:playlistId/assign')
  assignPlaylist(
    @CurrentActor() actor: RequestActor,
    @Param('playlistId') playlistId: string,
    @Body() body: { deviceIds: string[] },
  ) {
    return this.clientDataService.assignPlaylist(actor, playlistId, body);
  }

  @Get('playlists/:playlistId/assets')
  getPlaylistAssets(@CurrentActor() actor: RequestActor, @Param('playlistId') playlistId: string) {
    return this.clientDataService.getPlaylistAssets(actor, playlistId);
  }

  @Post('playlists/:playlistId/assets')
  addPlaylistAsset(
    @CurrentActor() actor: RequestActor,
    @Param('playlistId') playlistId: string,
    @Body() body: AddPlaylistAssetDto,
  ) {
    return this.clientDataService.addPlaylistAsset(actor, playlistId, body.assetId, body.durationSeconds);
  }

  @Patch('playlists/:playlistId/assets/reorder')
  reorderPlaylistAssets(
    @CurrentActor() actor: RequestActor,
    @Param('playlistId') playlistId: string,
    @Body() body: ReorderPlaylistAssetsDto,
  ) {
    return this.clientDataService.reorderPlaylistAssets(actor, playlistId, body);
  }

  @Patch('playlists/:playlistId/assets/:playlistAssetId')
  updatePlaylistAssetDuration(
    @CurrentActor() actor: RequestActor,
    @Param('playlistId') playlistId: string,
    @Param('playlistAssetId') playlistAssetId: string,
    @Body() body: UpdatePlaylistAssetDurationDto,
  ) {
    return this.clientDataService.updatePlaylistAssetDuration(
      actor,
      playlistId,
      playlistAssetId,
      body.durationSeconds,
    );
  }

  @Delete('playlists/:playlistId/assets/:playlistAssetId')
  removePlaylistAsset(
    @CurrentActor() actor: RequestActor,
    @Param('playlistId') playlistId: string,
    @Param('playlistAssetId') playlistAssetId: string,
  ) {
    return this.clientDataService.removePlaylistAsset(actor, playlistId, playlistAssetId);
  }

  @Get('layouts')
  listLayouts(@CurrentActor() actor: RequestActor) {
    return this.clientDataService.listLayouts(actor);
  }

  @Post('layouts')
  createLayout(@CurrentActor() actor: RequestActor, @Body() body: CreateLayoutDto) {
    return this.clientDataService.createLayout(actor, body);
  }

  @Get('layouts/assignment-options')
  layoutAssignmentOptions(@CurrentActor() actor: RequestActor) {
    return this.clientDataService.layoutAssignmentOptions(actor);
  }

  @Get('layouts/:layoutId')
  getLayout(@CurrentActor() actor: RequestActor, @Param('layoutId') layoutId: string) {
    return this.clientDataService.getLayout(actor, layoutId);
  }

  @Patch('layouts/:layoutId')
  updateLayout(
    @CurrentActor() actor: RequestActor,
    @Param('layoutId') layoutId: string,
    @Body() body: UpdateLayoutDto,
  ) {
    return this.clientDataService.updateLayout(actor, layoutId, body);
  }

  @Put('layouts/:layoutId/zones')
  saveLayoutZones(
    @CurrentActor() actor: RequestActor,
    @Param('layoutId') layoutId: string,
    @Body() body: SaveLayoutZonesDto,
  ) {
    return this.clientDataService.saveLayoutZones(actor, layoutId, body);
  }

  @Patch('layouts/:layoutId/assign')
  assignLayout(
    @CurrentActor() actor: RequestActor,
    @Param('layoutId') layoutId: string,
    @Body() body: AssignLayoutDto,
  ) {
    return this.clientDataService.assignLayout(actor, layoutId, body);
  }

  @Delete('layouts/:layoutId')
  deleteLayout(@CurrentActor() actor: RequestActor, @Param('layoutId') layoutId: string) {
    return this.clientDataService.deleteLayout(actor, layoutId);
  }

  @Get('schedule-events')
  listScheduleEvents(@CurrentActor() actor: RequestActor) {
    return this.clientDataService.listScheduleEvents(actor);
  }

  @Post('schedule-events')
  createScheduleEvent(
    @CurrentActor() actor: RequestActor,
    @Body() body: CreateScheduleEventDto,
  ) {
    return this.clientDataService.createScheduleEvent(actor, body);
  }

  @Patch('schedule-events/:eventId')
  updateScheduleEvent(
    @CurrentActor() actor: RequestActor,
    @Param('eventId') eventId: string,
    @Body() body: UpdateScheduleEventDto,
  ) {
    return this.clientDataService.updateScheduleEvent(actor, eventId, body);
  }

  @Patch('schedule-events/:eventId/toggle')
  toggleScheduleStatus(
    @CurrentActor() actor: RequestActor,
    @Param('eventId') eventId: string,
  ) {
    return this.clientDataService.toggleScheduleStatus(actor, eventId);
  }

  @Delete('schedule-events/:eventId')
  deleteScheduleEvent(@CurrentActor() actor: RequestActor, @Param('eventId') eventId: string) {
    return this.clientDataService.deleteScheduleEvent(actor, eventId);
  }

  @Get('devices')
  listDevices(@CurrentActor() actor: RequestActor) {
    return this.clientDataService.listDevices(actor);
  }

  @Post('devices')
  createDevice(@CurrentActor() actor: RequestActor, @Body() body: CreateDeviceDto) {
    return this.clientDataService.createDevice(actor, body);
  }

  @Post('devices/pair')
  pairDevice(@CurrentActor() actor: RequestActor, @Body() body: PairDeviceDto) {
    return this.clientDataService.pairDevice(actor, body);
  }

  @Patch('devices/:deviceId')
  updateDevice(
    @CurrentActor() actor: RequestActor,
    @Param('deviceId') deviceId: string,
    @Body() body: UpdateDeviceDto,
  ) {
    return this.clientDataService.updateDevice(actor, deviceId, body);
  }

  @Post('devices/:deviceId/unregister')
  unregisterDevice(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.unregisterDevice(actor, deviceId);
  }

  @Delete('devices/:deviceId')
  deleteDevice(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.deleteDevice(actor, deviceId);
  }

  @Post('devices/:deviceId/reboot')
  rebootDevice(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.rebootDevice(actor, deviceId);
  }

  @Post('devices/:deviceId/screenshot')
  captureDeviceScreenshot(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.captureDeviceScreenshot(actor, deviceId);
  }

  @Post('devices/:deviceId/refresh-status')
  refreshDeviceStatus(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.refreshDeviceStatus(actor, deviceId);
  }

  @Get('devices/:deviceId/cache')
  getDeviceCacheStatus(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.getDeviceCacheStatus(actor, deviceId);
  }

  @Get('devices/:deviceId/cache/assets')
  getDeviceCachedAssets(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.getDeviceCachedAssets(actor, deviceId);
  }

  @Post('devices/:deviceId/cache/refresh-status')
  refreshDeviceCacheStatus(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.refreshDeviceCacheStatus(actor, deviceId);
  }

  @Post('devices/:deviceId/cache/force-sync')
  forceDeviceSync(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.forceDeviceSync(actor, deviceId);
  }

  @Post('devices/:deviceId/cache/clear')
  clearDeviceCache(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.clearDeviceCache(actor, deviceId);
  }

  @Post('devices/:deviceId/cache/redownload')
  redownloadDevicePlaylist(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.redownloadDevicePlaylist(actor, deviceId);
  }

  @Get('devices/:deviceId/status')
  getDeviceStatus(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.getDeviceStatus(actor, deviceId);
  }

  @Get('devices/:deviceId/health')
  getDeviceHealth(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.getDeviceHealth(actor, deviceId);
  }

  @Get('devices/:deviceId/permissions')
  getDevicePermissions(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.getDevicePermissions(actor, deviceId);
  }

  @Get('devices/:deviceId/settings')
  getDeviceSettings(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.getDeviceSettings(actor, deviceId);
  }

  @Patch('devices/:deviceId/settings')
  updateDeviceDisplaySettings(
    @CurrentActor() actor: RequestActor,
    @Param('deviceId') deviceId: string,
    @Body() body: UpdateDeviceDisplaySettingsDto,
  ) {
    return this.clientDataService.updateDeviceDisplaySettings(actor, deviceId, body);
  }

  @Get('devices/:deviceId/playback-settings')
  getDevicePlaybackSettings(
    @CurrentActor() actor: RequestActor,
    @Param('deviceId') deviceId: string,
  ) {
    return this.clientDataService.getDevicePlaybackSettings(actor, deviceId);
  }

  @Patch('devices/:deviceId/playback-settings')
  updateDevicePlaybackSettings(
    @CurrentActor() actor: RequestActor,
    @Param('deviceId') deviceId: string,
    @Body() body: UpdateDevicePlaybackSettingsDto,
  ) {
    return this.clientDataService.updateDevicePlaybackSettings(actor, deviceId, body);
  }

  @Get('devices/:deviceId/features')
  getDeviceFeatures(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.getDeviceFeatures(actor, deviceId);
  }

  @Patch('devices/:deviceId/features')
  updateDeviceFeatures(
    @CurrentActor() actor: RequestActor,
    @Param('deviceId') deviceId: string,
    @Body() body: UpdateDeviceFeaturesDto,
  ) {
    return this.clientDataService.updateDeviceFeatures(actor, deviceId, body);
  }

  @Get('devices/:deviceId/logs')
  getDeviceLogs(
    @CurrentActor() actor: RequestActor,
    @Param('deviceId') deviceId: string,
    @Query() query: DeviceLogsQueryDto,
  ) {
    return this.clientDataService.getDeviceLogs(actor, deviceId, query.category, query.limit ?? 100);
  }

  @Post('devices/:deviceId/actions/:action')
  executeDeviceAction(
    @CurrentActor() actor: RequestActor,
    @Param('deviceId') deviceId: string,
    @Param('action') action: string,
  ) {
    return this.clientDataService.executeDeviceAction(actor, deviceId, action);
  }

  @Post('devices/:deviceId/restart-player')
  restartPlayer(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.restartPlayer(actor, deviceId);
  }

  @Post('devices/:deviceId/upload-logs')
  uploadDeviceLogs(@CurrentActor() actor: RequestActor, @Param('deviceId') deviceId: string) {
    return this.clientDataService.executeDeviceAction(actor, deviceId, 'upload-logs');
  }

  @Get('tickers')
  listTickers(@CurrentActor() actor: RequestActor) {
    return this.clientDataService.listTickers(actor);
  }

  @Post('tickers')
  createTicker(@CurrentActor() actor: RequestActor, @Body() body: CreateTickerDto) {
    return this.clientDataService.createTicker(actor, body);
  }

  @Patch('tickers/:tickerId')
  updateTicker(
    @CurrentActor() actor: RequestActor,
    @Param('tickerId') tickerId: string,
    @Body() body: UpdateTickerDto,
  ) {
    return this.clientDataService.updateTicker(actor, tickerId, body);
  }

  @Patch('tickers/:tickerId/toggle')
  toggleTickerStatus(@CurrentActor() actor: RequestActor, @Param('tickerId') tickerId: string) {
    return this.clientDataService.toggleTickerStatus(actor, tickerId);
  }

  @Delete('tickers/:tickerId')
  deleteTicker(@CurrentActor() actor: RequestActor, @Param('tickerId') tickerId: string) {
    return this.clientDataService.deleteTicker(actor, tickerId);
  }

  // Proof of play is an audit surface: every request must hit the database, so
  // no browser, proxy or CDN is allowed to serve a previously rendered report.
  @Get('reports')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  reports(@CurrentActor() actor: RequestActor, @Query() query: ReportsQueryDto) {
    return this.clientDataService.reports(actor, query);
  }

  @Get('reports/export')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  async exportReport(
    @CurrentActor() actor: RequestActor,
    @Query() query: ReportsQueryDto,
  ) {
    const buffer = await this.clientDataService.exportReportXlsx(actor, query);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
    const filename = `ProofOfPlay_Report_${stamp}.xlsx`;
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
