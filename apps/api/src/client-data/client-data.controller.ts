import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { ClientDataService } from './client-data.service';

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
    @Body() body: { name: string; startTime: string; endTime: string; days: string[] },
  ) {
    return this.clientDataService.createScheduleEvent(actor, body);
  }

  @Delete('schedule-events/:eventId')
  deleteScheduleEvent(@CurrentActor() actor: RequestActor, @Param('eventId') eventId: string) {
    return this.clientDataService.deleteScheduleEvent(actor, eventId);
  }

  @Get('devices')
  listDevices(@CurrentActor() actor: RequestActor) {
    return this.clientDataService.listDevices(actor);
  }

  @Get('tickers')
  listTickers(@CurrentActor() actor: RequestActor) {
    return this.clientDataService.listTickers(actor);
  }

  @Post('tickers')
  createTicker(
    @CurrentActor() actor: RequestActor,
    @Body() body: { text: string; speed: string; priority: string; color: string },
  ) {
    return this.clientDataService.createTicker(actor, body);
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
  reports(@CurrentActor() actor: RequestActor) {
    return this.clientDataService.reports(actor);
  }
}
