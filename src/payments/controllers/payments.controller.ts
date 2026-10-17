import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import { InitiatePaymentDto } from '../dto/initiate-payment.dto';
import { PayHereNotificationDto } from '../dto/payhere-notification.dto';
import { PaymentsService } from '../services/payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('initiate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  initiate(
    @Req() request: AuthenticatedRequest,
    @Body() dto: InitiatePaymentDto,
  ) {
    if (!request.user?.sub) throw new UnauthorizedException();
    return this.paymentsService.initiate(
      request.user.sub,
      dto,
      request.protocol + '://' + request.get('host'),
    );
  }

  @Post('payhere/notify')
  @HttpCode(200)
  notify(@Body() dto: PayHereNotificationDto) {
    return this.paymentsService.handleNotification(dto);
  }

  @Get('orders/:orderId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  getForOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    if (!request.user?.sub) throw new UnauthorizedException();
    return this.paymentsService.findOwn(request.user.sub, orderId);
  }
}
