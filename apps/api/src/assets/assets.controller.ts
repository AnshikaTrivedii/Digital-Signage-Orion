import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { AssetsService } from './assets.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { CreateUrlAssetDto } from './dto/create-url-asset.dto';
import { RequestUploadDto } from './dto/request-upload.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { UpdateAssetTagsDto } from './dto/update-asset-tags.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';

@Controller('organizations/:organizationId/assets')
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  // --- Folders (declared before :assetId routes to avoid param capture) ------

  @Get('folders')
  listFolders(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.assetsService.listFolders(actor, organizationId, parentId ?? null);
  }

  @Post('folders')
  createFolder(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateFolderDto,
  ) {
    return this.assetsService.createFolder(actor, organizationId, dto);
  }

  @Patch('folders/:folderId')
  updateFolder(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Param('folderId') folderId: string,
    @Body() dto: UpdateFolderDto,
  ) {
    return this.assetsService.updateFolder(actor, organizationId, folderId, dto);
  }

  @Delete('folders/:folderId')
  deleteFolder(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Param('folderId') folderId: string,
  ) {
    return this.assetsService.deleteFolder(actor, organizationId, folderId);
  }

  @Post('url')
  createUrlAsset(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateUrlAssetDto,
  ) {
    return this.assetsService.createUrlAsset(actor, organizationId, dto);
  }

  @Post('upload-url')
  requestUpload(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Body() dto: RequestUploadDto,
  ) {
    return this.assetsService.requestUpload(actor, organizationId, dto);
  }

  @Put(':assetId/upload')
  async receiveUpload(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Param('assetId') assetId: string,
    @Req() req: Request,
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return this.assetsService.receiveUpload(
      actor,
      organizationId,
      assetId,
      Buffer.concat(chunks),
    );
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
    @Query('folderId') folderId?: string,
    @Query('scope') scope?: string,
  ) {
    return this.assetsService.listAssets(actor, organizationId, {
      type,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      folderId: folderId ?? null,
      scope: scope === 'all' ? 'all' : 'folder',
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

  @Patch(':assetId')
  updateAsset(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Param('assetId') assetId: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.assetsService.updateAsset(actor, organizationId, assetId, dto);
  }
}
