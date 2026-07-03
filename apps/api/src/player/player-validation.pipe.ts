import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

const heartbeatLogger = new Logger('PlayerHeartbeat');

function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .flatMap((error) => {
      const constraints = error.constraints ? Object.values(error.constraints) : [];
      if (constraints.length > 0) return constraints;
      return error.children?.length ? formatValidationErrors(error.children) : [];
    })
    .join('; ');
}

/** Validation pipe for player heartbeat/device-report — logs 400 causes when enabled. */
export function createPlayerTelemetryValidationPipe(label: string) {
  const logger = label === 'heartbeat' ? heartbeatLogger : new Logger(`Player${label}`);

  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: false,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errors: ValidationError[]) => {
      const detail = formatValidationErrors(errors);
      if (process.env.PLAYER_HEARTBEAT_LOG !== 'false') {
        logger.warn(`${label} validation failed: ${detail}`);
      }
      return new BadRequestException({
        statusCode: 400,
        message: detail || 'Validation failed',
        error: 'Bad Request',
      });
    },
  });
}

export const heartbeatValidationPipe = createPlayerTelemetryValidationPipe('heartbeat');
export const deviceReportValidationPipe = createPlayerTelemetryValidationPipe('device-report');
