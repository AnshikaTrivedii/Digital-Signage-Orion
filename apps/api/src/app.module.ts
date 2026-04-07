import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule, UsersModule, OrganizationsModule],
  controllers: [HealthController],
  providers: [AppService],
})
export class AppModule {}
