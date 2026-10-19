import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import { UserRole } from '../../users/enums/user-role.enum';
import { CreateRepairTicketDto } from '../dto/create-repair-ticket.dto';
import { ApproveRepairDto } from '../dto/approve-repair.dto';
import { RejectRepairDto } from '../dto/reject-repair.dto';
import { UpdateRepairStatusDto } from '../dto/update-repair-status.dto';
import { RepairsService } from '../services/repairs.service';

@Controller('repairs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RepairsController {
  constructor(private readonly repairsService: RepairsService) {}

  // Customer endpoints
  @Post()
  @Roles(UserRole.CUSTOMER)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateRepairTicketDto,
  ) {
    if (!request.user?.sub) throw new UnauthorizedException();
    return this.repairsService.create(request.user.sub, dto);
  }

  @Get()
  @Roles(UserRole.CUSTOMER)
  findAllForCustomer(@Req() request: AuthenticatedRequest) {
    if (!request.user?.sub) throw new UnauthorizedException();
    return this.repairsService.findAllForCustomer(request.user.sub);
  }

  // Admin endpoints
  @Get('admin')
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.repairsService.findAll();
  }

  @Get('admin/:id')
  @Roles(UserRole.ADMIN)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.repairsService.findOne(id);
  }

  @Patch('admin/:id/approve')
  @Roles(UserRole.ADMIN)
  approve(@Param() dto: ApproveRepairDto) {
    return this.repairsService.approve(dto.id);
  }

  @Patch('admin/:id/reject')
  @Roles(UserRole.ADMIN)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectRepairDto) {
    return this.repairsService.reject(id, dto.rejectionReason);
  }

  // Repairer endpoints
  @Get('repairer')
  @Roles(UserRole.REPAIRER)
  findAllForRepairer(@Req() request: AuthenticatedRequest) {
    if (!request.user?.sub) throw new UnauthorizedException();
    return this.repairsService.findAllForRepairer(request.user.sub);
  }

  @Get('repairer/:id')
  @Roles(UserRole.REPAIRER)
  findOneForRepairer(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!request.user?.sub) throw new UnauthorizedException();
    return this.repairsService.findOneForRepairer(id, request.user.sub);
  }

  @Patch('repairer/:id/status')
  @Roles(UserRole.REPAIRER)
  updateRepairStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRepairStatusDto,
  ) {
    if (!request.user?.sub) throw new UnauthorizedException();
    return this.repairsService.updateRepairStatus(
      id,
      request.user.sub,
      dto.status,
    );
  }

  // Keep the generic customer route after literal admin/repairer routes.
  @Get(':id')
  @Roles(UserRole.CUSTOMER)
  findOneForCustomer(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!request.user?.sub) throw new UnauthorizedException();
    return this.repairsService.findOneForCustomer(id, request.user.sub);
  }
}
