import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { AssetsService } from './assets.service';

@Controller('assets')
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  listAssets(@CurrentActor() actor: RequestActor) {
    return this.assetsService.listAssets(actor);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadAsset(
    @CurrentActor() actor: RequestActor,
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer } | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Missing file payload');
    }

    return this.assetsService.uploadAsset(actor, {
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileBuffer: file.buffer,
    });
  }

  @Delete(':assetId')
  deleteAsset(@CurrentActor() actor: RequestActor, @Param('assetId') assetId: string) {
    return this.assetsService.deleteAsset(actor, assetId);
  }
}
