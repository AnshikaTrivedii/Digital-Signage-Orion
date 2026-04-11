import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { AssetsModule } from './assets/assets.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClientDataModule } from './client-data/client-data.module';
import { HealthController } from './health.controller';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { S3Module } from './s3/s3.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, S3Module, AuditModule, AuthModule, UsersModule, OrganizationsModule, AssetsModule, ClientDataModule],
  controllers: [HealthController],
  providers: [AppService],
})
export class AppModule {}
