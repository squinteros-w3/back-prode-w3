import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'prode-w3',
      time: new Date().toISOString(),
    };
  }
}
