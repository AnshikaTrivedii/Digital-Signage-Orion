import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import type { ScheduleStatus } from './schedule-resolution';
import { ScheduleService } from './schedule.service';

const STATUS_FILTERS: ReadonlyArray<ScheduleStatus | 'all'> = [
  'all',
  'active',
  'scheduled',
  'completed',
  'disabled',
];

/**
 * Shares the /client-data prefix with ClientDataController so the CMS keeps a
 * single authenticated data surface; routes do not overlap.
 */
@Controller('client-data')
@UseGuards(JwtAuthGuard)
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get('schedules')
  listSchedules(
    @CurrentActor() actor: RequestActor,
    @Query('status') status?: string,
    @Query('deviceId') deviceId?: string,
    @Query('playlistId') playlistId?: string,
  ) {
    const normalized = (status ?? 'all').toLowerCase();
    return this.scheduleService.listSchedules(actor, {
      status: STATUS_FILTERS.includes(normalized as ScheduleStatus | 'all')
        ? (normalized as ScheduleStatus | 'all')
        : 'all',
      deviceId: deviceId || undefined,
      playlistId: playlistId || undefined,
    });
  }

  @Post('schedules')
  createSchedule(@CurrentActor() actor: RequestActor, @Body() body: CreateScheduleDto) {
    return this.scheduleService.createSchedule(actor, body);
  }

  @Patch('schedules/:scheduleId')
  updateSchedule(
    @CurrentActor() actor: RequestActor,
    @Param('scheduleId') scheduleId: string,
    @Body() body: UpdateScheduleDto,
  ) {
    return this.scheduleService.updateSchedule(actor, scheduleId, body);
  }

  @Patch('schedules/:scheduleId/toggle')
  toggleSchedule(
    @CurrentActor() actor: RequestActor,
    @Param('scheduleId') scheduleId: string,
    @Body() body: { enabled?: boolean } = {},
  ) {
    return this.scheduleService.toggleSchedule(actor, scheduleId, body?.enabled);
  }

  @Delete('schedules/:scheduleId')
  deleteSchedule(
    @CurrentActor() actor: RequestActor,
    @Param('scheduleId') scheduleId: string,
  ) {
    return this.scheduleService.deleteSchedule(actor, scheduleId);
  }
}
