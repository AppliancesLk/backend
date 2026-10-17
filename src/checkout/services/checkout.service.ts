import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { CartService } from '../../cart/services/cart.service';
import { formatMinorUnits, toMinorUnits } from '../../common/utils/money';
import { CheckoutSummaryDto } from '../dto/checkout-summary.dto';
import { PrepareCheckoutDto } from '../dto/prepare-checkout.dto';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  constructor(
    private readonly dataSource: DataSource,
    private readonly cartService: CartService,
  ) {}

  async prepare(
    customerId: string,
    dto: PrepareCheckoutDto,
  ): Promise<CheckoutSummaryDto> {
    try {
      // One consistent database snapshot for cart, products and category
      // availability. The Cart service uses this same manager/connection.
      const summary = await this.dataSource.transaction(
        'REPEATABLE READ',
        async (manager) => {
          const cart = await this.cartService.getCurrentCart(
            customerId,
            manager,
          );
          if (!cart.id || cart.items.length === 0)
            throw new BadRequestException(
              'Cannot prepare checkout for an empty cart',
            );
          let subtotal = 0n;
          const items = cart.items.map((item) => {
            if (
              !Number.isInteger(item.quantity) ||
              item.quantity < 1 ||
              item.quantity > 2147483647
            )
              throw new ConflictException({
                statusCode: 409,
                error: 'Conflict',
                message: 'Cart item has an invalid quantity',
                cartItemId: item.id,
                productId: item.productId,
              });
            if (item.quantity > item.stockQty)
              throw new ConflictException({
                statusCode: 409,
                error: 'Conflict',
                message: 'Insufficient stock for cart product',
                cartItemId: item.id,
                productId: item.productId,
                requestedQuantity: item.quantity,
                availableStock: item.stockQty,
              });
            if (!item.isAvailable)
              throw new ConflictException({
                statusCode: 409,
                error: 'Conflict',
                message: 'Cart product is no longer available',
                cartItemId: item.id,
                productId: item.productId,
              });
            // Prices originate from the fresh server-side catalog read, never DTOs.
            const unitPrice = toMinorUnits(item.unitPrice);
            const lineTotal = unitPrice * BigInt(item.quantity);
            subtotal += lineTotal;
            return {
              cartItemId: item.id,
              productId: item.productId,
              name: item.name,
              SKU: item.SKU,
              quantity: item.quantity,
              unitPrice: formatMinorUnits(unitPrice),
              lineTotal: formatMinorUnits(lineTotal),
            };
          });
          const total = formatMinorUnits(subtotal);
          return {
            cartId: cart.id,
            customerId,
            preparedAt: new Date().toISOString(),
            currency: cart.currency,
            items,
            itemCount: items.length,
            subtotal: total,
            total,
            delivery: {
              firstName: dto.delivery.firstName,
              lastName: dto.delivery.lastName,
              email: dto.delivery.email,
              phone: dto.delivery.phone,
              addressLine1: dto.delivery.addressLine1,
              addressLine2: dto.delivery.addressLine2,
              city: dto.delivery.city,
              postalCode: dto.delivery.postalCode,
              countryCode: dto.delivery.countryCode,
            },
          };
        },
      );
      this.logger.log({
        operation: 'checkout.prepare',
        customerId,
        cartId: summary.cartId,
        itemCount: summary.itemCount,
        outcome: 'success',
      });
      return summary;
    } catch (error: unknown) {
      const changedSnapshot =
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '40001';
      const failure = changedSnapshot
        ? new ConflictException(
            'Cart changed during checkout preparation. Please try again',
          )
        : error;
      const context = {
        operation: 'checkout.prepare',
        customerId,
        outcome: 'failed',
        reason: changedSnapshot
          ? 'cart_changed'
          : failure instanceof BadRequestException
            ? 'empty_cart'
            : failure instanceof ConflictException
              ? 'cart_not_ready'
              : failure instanceof NotFoundException
                ? 'product_not_found'
                : 'unexpected_error',
        statusCode:
          failure instanceof HttpException ? failure.getStatus() : 500,
      };
      if (failure instanceof HttpException) this.logger.warn(context);
      else this.logger.error(context);
      throw failure;
    }
  }
}
