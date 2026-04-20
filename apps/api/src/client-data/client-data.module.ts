import { Module } from '@nestjs/common';
import { S3Module } from '../s3/s3.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ClientDataController } from './client-data.controller';
import { ClientDataService } from './client-data.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule, S3Module],
  controllers: [ClientDataController],
  providers: [ClientDataService],
})
export class ClientDataModule {}
