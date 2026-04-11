import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { AssetsService } from './assets.service';
import { RequestUploadDto } from './dto/request-upload.dto';
import { UpdateAssetTagsDto } from './dto/update-asset-tags.dto';

@Controller('organizations/:organizationId/assets')
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post('upload-url')
  requestUpload(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Body() dto: RequestUploadDto,
  ) {
    return this.assetsService.requestUpload(actor, organizationId, dto);
  }

  @Patch(':assetId/confirm')
  confirmUpload(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Param('assetId') assetId: string,
  ) {
    return this.assetsService.confirmUpload(actor, organizationId, assetId);
  }

  @Get()
  listAssets(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.assetsService.listAssets(actor, organizationId, {
      type,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':assetId')
  getAsset(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Param('assetId') assetId: string,
  ) {
    return this.assetsService.getAsset(actor, organizationId, assetId);
  }

  @Delete(':assetId')
  deleteAsset(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Param('assetId') assetId: string,
  ) {
    return this.assetsService.deleteAsset(actor, organizationId, assetId);
  }

  @Patch(':assetId/tags')
  updateTags(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Param('assetId') assetId: string,
    @Body() dto: UpdateAssetTagsDto,
  ) {
    return this.assetsService.updateTags(actor, organizationId, assetId, dto);
  }
}
