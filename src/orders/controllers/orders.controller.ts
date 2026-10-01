import {
  Body,
  Controller,
  Get,
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
import { CreateOrderDto } from '../dto/create-order.dto';
import { OrdersService } from '../services/orders.service';
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}
  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(this.customerId(request), dto);
  }
  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.ordersService.findAllOwn(this.customerId(request));
  }
  @Get(':id/status')
  status(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.findOwnStatus(this.customerId(request), id);
  }
  @Get(':id')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.findOwn(this.customerId(request), id);
  }
  private customerId(request: AuthenticatedRequest): string {
    if (!request.user?.sub) throw new UnauthorizedException();
    return request.user.sub;
  }
}
