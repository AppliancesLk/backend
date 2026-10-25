import {
  Body,
  Controller,
  Delete,
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
import { AddCartItemDto } from '../dto/add-cart-item.dto';
import { UpdateCartItemDto } from '../dto/update-cart-item.dto';
import { CartService } from '../services/cart.service';

@Controller('cart')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest) {
    return this.cartService.getCurrentCart(this.customerId(request));
  }

  @Post('items')
  add(@Req() request: AuthenticatedRequest, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(this.customerId(request), dto);
  }

  @Patch('items/:itemId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(
      this.customerId(request),
      itemId,
      dto.quantity,
    );
  }

  @Delete('items/:itemId')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.cartService.removeItem(this.customerId(request), itemId);
  }

  @Delete()
  clear(@Req() request: AuthenticatedRequest) {
    return this.cartService.clearCart(this.customerId(request));
  }

  private customerId(request: AuthenticatedRequest): string {
    if (!request.user?.sub) throw new UnauthorizedException();
    return request.user.sub;
  }
}
