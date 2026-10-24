import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { ReportsService } from './reports.service';

@Controller('admin/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  overview(@Query('period') period?: 'day' | 'month') {
    return this.reports.overview(period === 'month' ? 'month' : 'day');
  }
}
