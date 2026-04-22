import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { ClientDataService } from './client-data.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { PairDeviceDto } from './dto/pair-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { CreateScheduleEventDto } from './dto/create-schedule-event.dto';
import { UpdateScheduleEventDto } from './dto/update-schedule-event.dto';
import { CreateTickerDto } from './dto/create-ticker.dto';
import { UpdateTickerDto } from './dto/update-ticker.dto';

@Controller('client-data')
@UseGuards(JwtAuthGuard)
export class ClientDataController {
  constructor(private readonly clientDataService: ClientDataService) {}

  @Get('dashboard')
  dashboard(@CurrentActor() actor: RequestActor) {
    return this.clientDataService.dashboard(actor);
  }

  @Get('campaigns')
  listCampaigns(@CurrentActor() actor: RequestActor) {
    return this.clientDataService.listCampaigns(actor);
  }

  @Post('campaigns')
  createCampaign(@CurrentActor() actor: RequestActor, @Body() body: { name: string; description?: string }) {
    return this.clientDataService.createCampaign(actor, body);
  }

  @Delete('campaigns/:campaignId')
  deleteCampaign(@CurrentActor() actor: RequestActor, @Param('campaignId') campaignId: string) {
    return this.clientDataService.deleteCampaign(actor, campaignId);
  }

  @Get('campaigns/:campaignId/assets')
  getCampaignAssets(@CurrentActor() actor: RequestActor, @Param('campaignId') campaignId: string) {
    return this.clientDataService.getCampaignAssets(actor, campaignId);
  }

  @Post('campaigns/:campaignId/assets')
  addCampaignAsset(
    @CurrentActor() actor: RequestActor,
    @Param('campaignId') campaignId: string,
    @Body() body: { assetId: string; durationSeconds: number },
  ) {
    return this.clientDataService.addCampaignAsset(actor, campaignId, body.assetId, body.durationSeconds);
  }

  @Delete('campaigns/:campaignId/assets/:assetId')
  removeCampaignAsset(
    @CurrentActor() actor: RequestActor,
    @Param('campaignId') campaignId: string,
    @Param('assetId') assetId: string,
  ) {
    return this.clientDataService.removeCampaignAsset(actor, campaignId, assetId);
  }

  @Patch('campaigns/:campaignId/assets/reorder')
  reorderCampaignAssets(
    @CurrentActor() actor: RequestActor,
    @Param('campaignId') campaignId: string,
    @Body() body: { assetIds: string[] },
  ) {
    return this.clientDataService.reorderCampaignAssets(actor, campaignId, body);
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
    @Body() body: { campaignIds: string[]; deviceIds: string[] },
  ) {
    return this.clientDataService.assignPlaylist(actor, playlistId, body);
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

  @Get('reports')
  reports(@CurrentActor() actor: RequestActor, @Query('range') range?: string) {
    return this.clientDataService.reports(actor, range);
  }

  @Get('reports/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportReport(
    @CurrentActor() actor: RequestActor,
    @Query('range') range: string | undefined,
  ) {
    const csv = await this.clientDataService.exportReportCsv(actor, range);
    const safeRange = (range ?? '7d').replace(/[^a-z0-9]/gi, '') || '7d';
    const filename = `proof-of-play-${safeRange}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
