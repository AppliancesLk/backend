import 'dotenv/config';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { Notification } from '../notification/entities/notification.entity';
import { AiConversation } from '../ai/entities/ai-conversation.entity';
import { AiMessage } from '../ai/entities/ai-message.entity';
import { ProductReview } from '../reviews/entities/product-review.entity';
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
import { AccountAction } from '../auth/entities/account-action.entity';
import { OrderEvent } from '../orders/entities/order-event.entity';
import { LoyaltyEntry } from '../loyalty/entities/loyalty-entry.entity';

export const AppDataSource = new DataSource({
  ...getDatabaseConfig(),

  entities: [
    ChatSession,
    ChatMessage,
    Notification,
    AiConversation,
    AiMessage,
    ProductReview,
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
    AccountAction,
    OrderEvent,
    LoyaltyEntry,
  ],

  migrations: ['src/database/migrations/*.ts'],
});
