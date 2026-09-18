import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
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
import { PrepareCheckoutDto } from '../dto/prepare-checkout.dto';
import { CheckoutService } from '../services/checkout.service';

@Controller('checkout')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('prepare')
  @HttpCode(HttpStatus.OK)
  prepare(
    @Req() request: AuthenticatedRequest,
    @Body() dto: PrepareCheckoutDto,
  ) {
    if (!request.user?.sub) throw new UnauthorizedException();
    return this.checkoutService.prepare(request.user.sub, dto);
  }
}
