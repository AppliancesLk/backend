import { ConflictException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OrderItem } from '../../orders/entities/order-item.entity';
import { Product } from '../entities/product.entity';

@Injectable()
export class OrderInventoryService {
  async reserve(manager: EntityManager, items: OrderItem[]) {
    const products = await this.lockProducts(manager, items);
    const byId = new Map(
      products.map((product) => [product.productID, product]),
    );
    for (const item of items) {
      const product = byId.get(item.productId);
      if (
        !product ||
        !product.isActive ||
        !product.category.isActive ||
        product.stockQty < item.quantity
      )
        throw new ConflictException(
          'Order inventory is no longer available. Refresh your cart and try again',
        );
      product.stockQty -= item.quantity;
    }
    await manager.save(Product, products);
  }
  async release(manager: EntityManager, items: OrderItem[]) {
    const products = await this.lockProducts(manager, items);
    const byId = new Map(
      products.map((product) => [product.productID, product]),
    );
    for (const item of items) {
      const product = byId.get(item.productId);
      if (!product)
        throw new ConflictException('Unable to restore order inventory');
      product.stockQty += item.quantity;
    }
    await manager.save(Product, products);
  }
  private lockProducts(manager: EntityManager, items: OrderItem[]) {
    return manager
      .createQueryBuilder(Product, 'product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.productID IN (:...ids)', {
        ids: items.map((item) => item.productId),
      })
      .orderBy('product.productID', 'ASC')
      .setLock('pessimistic_write', undefined, ['product'])
      .getMany();
  }
}
