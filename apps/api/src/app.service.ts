import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'orion-api',
      timestamp: new Date().toISOString(),
    };
  }
}
