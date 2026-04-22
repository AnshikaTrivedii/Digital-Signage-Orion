import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  imports: [PrismaModule, S3Module],
  controllers: [PlayerController],
  providers: [PlayerService],
})
export class PlayerModule {}
