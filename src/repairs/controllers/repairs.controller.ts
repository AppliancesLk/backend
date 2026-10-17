import {
  Body,
  Controller,
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
import { RepairsService } from '../services/repairs.service';

@Controller('repairs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class RepairsController {
  constructor(private readonly repairsService: RepairsService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateRepairTicketDto,
  ) {
    if (!request.user?.sub) throw new UnauthorizedException();
    return this.repairsService.create(request.user.sub, dto);
  }
}
