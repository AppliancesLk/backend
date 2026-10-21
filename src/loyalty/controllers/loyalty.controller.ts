import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import { LoyaltyService } from '../services/loyalty.service';

@Controller('loyalty')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}
  @Get() summary(@Req() request: AuthenticatedRequest) {
    return this.loyalty.summary(request.user!.sub);
  }
}
