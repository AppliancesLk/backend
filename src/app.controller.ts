import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller()
export class AppController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  getHello() {
    return {
      message: 'Appliances.lk backend is running',
    };
  }

  @Get('health/database')
  async checkDatabase() {
    await this.dataSource.query('SELECT 1');

    return {
      status: 'ok',
      database: 'connected',
    };
  }
}