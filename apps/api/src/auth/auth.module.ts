import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OrganizationRolesGuard } from './organization-roles.guard';
import { PlatformRolesGuard } from './platform-roles.guard';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'orion-dev-secret',
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, PlatformRolesGuard, OrganizationRolesGuard],
  exports: [AuthService, JwtAuthGuard, PlatformRolesGuard, OrganizationRolesGuard],
})
export class AuthModule {}
