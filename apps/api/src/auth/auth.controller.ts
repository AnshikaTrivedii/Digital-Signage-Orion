import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { BootstrapSuperAdminDto } from './dto/bootstrap-super-admin.dto';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('bootstrap/super-admin')
  bootstrapSuperAdmin(@Body() dto: BootstrapSuperAdminDto) {
    return this.authService.bootstrapSuperAdmin(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('accept-invitation')
  acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.authService.acceptInvitation(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentActor() actor: RequestActor) {
    return this.authService.me(actor);
  }
}
