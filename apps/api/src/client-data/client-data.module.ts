import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ClientDataController } from './client-data.controller';
import { ClientDataService } from './client-data.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [ClientDataController],
  providers: [ClientDataService],
})
export class ClientDataModule {}
