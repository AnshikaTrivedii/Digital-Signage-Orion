import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { InitPairingDto } from './dto/init-pairing.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { SubmitPopLogsDto } from './dto/pop-log.dto';
import { PlayerService } from './player.service';

/**
 * Public-facing controller for Android player devices.
 * These endpoints are NOT protected by JwtAuthGuard — the player
 * authenticates via its device token after pairing.
 */
@Controller('player')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  /**
   * Called by the Android player on first boot.
   * Creates a draft device and returns a 6-digit pairing code.
   */
  @Post('init-pairing')
  initPairing(@Body() body: InitPairingDto) {
    return this.playerService.initPairing(body.hardwareId);
  }

  /**
   * Polled by the Android player every 5 seconds.
   * Returns isPaired=true with deviceToken once a CMS user pairs it.
   */
  @Get('pairing-status/:hardwareId')
  getPairingStatus(@Param('hardwareId') hardwareId: string) {
    return this.playerService.getPairingStatus(hardwareId);
  }

  /**
   * Periodic heartbeat from a paired device.
   * Device authenticates via its device token in the Authorization header.
   */
  @Post('heartbeat')
  heartbeat(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: HeartbeatDto,
  ) {
    return this.playerService.heartbeat(authHeader, body);
  }

  /**
   * Device fetches its playlist manifest and asset download URLs.
   * Device authenticates via its device token in the Authorization header.
   */
  @Get('sync')
  sync(@Headers('authorization') authHeader: string | undefined) {
    return this.playerService.syncPlaylist(authHeader);
  }

  /**
   * Device submits proof-of-play logs.
   * Device authenticates via its device token in the Authorization header.
   */
  @Post('pop-logs')
  submitPopLogs(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: SubmitPopLogsDto,
  ) {
    return this.playerService.submitPopLogs(authHeader, body.logs);
  }
}
