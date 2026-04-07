import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { PlatformRoles } from '../common/decorators/platform-roles.decorator';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformRolesGuard } from '../auth/platform-roles.guard';
import { CreatePlatformUserDto } from './dto/create-platform-user.dto';
import { UsersService } from './users.service';

@Controller('platform-users')
@UseGuards(JwtAuthGuard, PlatformRolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @PlatformRoles('SUPER_ADMIN', 'PLATFORM_ADMIN')
  listPlatformUsers() {
    return this.usersService.listPlatformUsers();
  }

  @Post()
  @PlatformRoles('SUPER_ADMIN')
  createPlatformUser(@CurrentActor() actor: RequestActor, @Body() dto: CreatePlatformUserDto) {
    return this.usersService.createPlatformUser(actor, dto);
  }
}
