import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import { UserRole } from '../enums/user-role.enum';
import { AdminUsersQueryDto, SetUserActiveDto } from '../dto/admin-users.dto';
import { AdminUsersService } from '../services/admin-users.service';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}
  @Get() list(@Query() query: AdminUsersQueryDto) {
    return this.users.list(query);
  }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.detail(id);
  }
  @Patch(':id/active') setActive(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserActiveDto,
  ) {
    return this.users.setActive(request.user!.sub, id, dto.isActive);
  }
}
