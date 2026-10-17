import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { formatMinorUnits, toMinorUnits } from '../../common/utils/money';
import { ProductsService } from '../../products/services/products.service';
import { AddCartItemDto } from '../dto/add-cart-item.dto';
import { CartResponseDto } from '../dto/cart-response.dto';
import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cart-item.entity';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly productsService: ProductsService,
  ) {}

  async getCurrentCart(
    userId: string,
    manager?: EntityManager,
  ): Promise<CartResponseDto> {
    const read = async (transaction: EntityManager) => {
      const cart = await transaction.findOne(Cart, {
        where: { userId },
        lock: { mode: 'pessimistic_read' },
      });
      return this.response(transaction, cart);
    };
    // Checkout can supply its own snapshot without opening a nested transaction.
    // Standalone Cart reads retain their existing transaction/locking behavior.
    return this.observed('read', userId, () =>
      manager ? read(manager) : this.dataSource.transaction(read),
    );
  }

  // These transaction-only capabilities keep order consumption inside Cart.
  async lockCurrentCart(userId: string, manager: EntityManager): Promise<void> {
    const cart = await manager.findOne(Cart, {
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!cart) throw new BadRequestException('Cart is empty');
  }

  async consumeCart(
    userId: string,
    cartId: string,
    manager: EntityManager,
  ): Promise<void> {
    const cart = await manager.findOne(Cart, {
      where: { id: cartId, userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!cart) throw new NotFoundException('Cart not found');
    await manager.delete(CartItem, { cartId: cart.id });
    await manager.update(Cart, { id: cart.id }, { updatedAt: new Date() });
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartResponseDto> {
    return this.mutate('add', userId, async (manager, cart) => {
      this.validateQuantity(dto.quantity);
      const product = await this.availableProduct(manager, dto.productId);
      const existing = await manager.findOneBy(CartItem, {
        cartId: cart.id,
        productId: product.productID,
      });
      const quantity = (existing?.quantity ?? 0) + dto.quantity;
      this.validateStock(quantity, product.stockQty);
      if (existing) {
        await manager.update(
          CartItem,
          { id: existing.id, cartId: cart.id },
          { quantity },
        );
      } else {
        await manager.save(
          CartItem,
          manager.create(CartItem, {
            cartId: cart.id,
            productId: product.productID,
            quantity,
          }),
        );
      }
    });
  }

  async updateItem(
    userId: string,
    itemId: string,
    quantity: number,
  ): Promise<CartResponseDto> {
    return this.mutate('update', userId, async (manager, cart) => {
      this.validateQuantity(quantity);
      const item = await this.ownedItem(manager, cart.id, itemId);
      const product = await this.availableProduct(manager, item.productId);
      this.validateStock(quantity, product.stockQty);
      await manager.update(
        CartItem,
        { id: item.id, cartId: cart.id },
        { quantity },
      );
    });
  }

  async removeItem(userId: string, itemId: string): Promise<CartResponseDto> {
    return this.mutate('remove', userId, async (manager, cart) => {
      const item = await this.ownedItem(manager, cart.id, itemId);
      await manager.delete(CartItem, { id: item.id, cartId: cart.id });
    });
  }

  async clearCart(userId: string): Promise<CartResponseDto> {
    return this.mutate('clear', userId, async (manager, cart) => {
      await manager.delete(CartItem, { cartId: cart.id });
    });
  }

  private async availableProduct(manager: EntityManager, productId: string) {
    const entry = (
      await this.productsService.findForCart([productId], manager)
    ).get(productId.toLowerCase());
    if (!entry?.isAvailable) throw new NotFoundException('Product not found');
    return entry.product;
  }

  private async ownedItem(
    manager: EntityManager,
    cartId: string,
    id: string,
  ): Promise<CartItem> {
    const item = await manager.findOneBy(CartItem, { id, cartId });
    // Identical response for unknown and other customers' items avoids exposing ownership.
    if (!item) throw new NotFoundException('Cart item not found');
    return item;
  }

  private validateQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647)
      throw new BadRequestException(
        'Quantity must be a positive integer no greater than 2147483647',
      );
  }

  private validateStock(quantity: number, stockQty: number): void {
    this.validateQuantity(quantity);
    if (quantity > stockQty)
      throw new BadRequestException(
        'Requested quantity exceeds available stock',
      );
  }

  private async mutate(
    operation: string,
    userId: string,
    action: (manager: EntityManager, cart: Cart) => Promise<void>,
  ): Promise<CartResponseDto> {
    return this.observed(operation, userId, () =>
      this.dataSource.transaction(async (manager) => {
        // Unique userId also serializes concurrent first use. Subsequent writes
        // acquire the same cart lock before checking quantities or touching items.
        await manager
          .createQueryBuilder()
          .insert()
          .into(Cart)
          .values({ userId })
          .orIgnore()
          .execute();
        const cart = await manager.findOneOrFail(Cart, {
          where: { userId },
          lock: { mode: 'pessimistic_write' },
        });
        await action(manager, cart);
        await manager.update(Cart, { id: cart.id }, { updatedAt: new Date() });
        return this.response(manager, cart);
      }),
    );
  }

  private async response(
    manager: EntityManager,
    cart: Cart | null,
  ): Promise<CartResponseDto> {
    const rows = cart
      ? await manager.find(CartItem, {
          where: { cartId: cart.id },
          order: { createdAt: 'ASC', id: 'ASC' },
        })
      : [];
    const catalog = await this.productsService.findForCart(
      rows.map((item) => item.productId),
      manager,
    );
    let subtotal = 0n;
    const items = rows.map((item) => {
      const entry = catalog.get(item.productId);
      if (!entry) throw new NotFoundException('Cart product not found');
      const { product, isAvailable } = entry;
      // PostgreSQL numeric values are decimal strings. Use integer minor units
      // for exact totals, including values beyond Number.MAX_SAFE_INTEGER.
      const price = toMinorUnits(product.price);
      const total = price * BigInt(item.quantity);
      subtotal += total;
      return {
        id: item.id,
        productId: item.productId,
        name: product.name,
        SKU: product.SKU,
        images: product.images,
        quantity: item.quantity,
        stockQty: product.stockQty,
        isAvailable: isAvailable && item.quantity <= product.stockQty,
        unitPrice: formatMinorUnits(price),
        lineTotal: formatMinorUnits(total),
      };
    });
    return {
      id: cart?.id ?? null,
      currency: 'LKR',
      items,
      itemCount: items.length,
      subtotal: formatMinorUnits(subtotal),
    };
  }

  private async observed(
    operation: string,
    userId: string,
    action: () => Promise<CartResponseDto>,
  ): Promise<CartResponseDto> {
    try {
      const result = await action();
      if (operation !== 'read')
        this.logger.log({
          operation: `cart.${operation}`,
          userId,
          cartId: result.id,
          outcome: 'success',
        });
      return result;
    } catch (error: unknown) {
      const context = {
        operation: `cart.${operation}`,
        userId,
        outcome: 'failed',
        reason:
          error instanceof BadRequestException
            ? 'invalid_quantity_or_stock'
            : error instanceof NotFoundException
              ? 'resource_not_found'
              : 'unexpected_error',
        statusCode: error instanceof HttpException ? error.getStatus() : 500,
      };
      if (error instanceof HttpException) this.logger.warn(context);
      else this.logger.error(context);
      throw error;
    }
  }
}
