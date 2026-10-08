import 'dotenv/config';
import { BannerSection } from '../banners/entities/banner-section.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Cart } from '../cart/entities/cart.entity';
import { CartItem } from '../cart/entities/cart-item.entity';
import { AuthSession } from '../auth/entities/auth-session.entity';
import { DataSource } from 'typeorm';

import { Category } from '../categories/entities/category.entity';
import { getDatabaseConfig } from '../config/database.config';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { Payment } from '../payments/entities/payment.entity';
import { RepairTicket } from '../repairs/entities/repair-ticket.entity';

export const AppDataSource = new DataSource({
  ...getDatabaseConfig(),

  entities: [
    BannerSection,
    User,
    AuthSession,
    Category,
    Product,
    Cart,
    CartItem,
    Order,
    OrderItem,
    Payment,
    RepairTicket,
  ],

  migrations: ['src/database/migrations/*.ts'],
});
