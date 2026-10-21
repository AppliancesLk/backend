import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { NotificationModule } from './notification/notification.module';
import { AiModule } from './ai/ai.module';
import { MediaModule } from './media/media.module';
import { ReviewsModule } from './reviews/reviews.module';
import { BannersModule } from './banners/banners.module';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getDatabaseConfig } from './config/database.config';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { OrdersModule } from './orders/orders.module';
import { CheckoutModule } from './checkout/checkout.module';
import { CartModule } from './cart/cart.module';
import { ProductsModule } from './products/products.module';
import { PaymentsModule } from './payments/payments.module';
import { RepairsModule } from './repairs/repairs.module';
import { AdminUsersModule } from './users/admin-users.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { StorefrontThemeModule } from './storefront-theme/storefront-theme.module';

@Module({
  imports: [
    ChatModule,
    NotificationModule,
    AiModule,
    MediaModule,
    ReviewsModule,
    BannersModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRoot({
      ...getDatabaseConfig(),
      autoLoadEntities: true,
    }),

    UsersModule,

    AuthModule,

    CategoriesModule,

    ProductsModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    PaymentsModule,
    RepairsModule,
    AdminUsersModule,
    LoyaltyModule,
    StorefrontThemeModule,
  ],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
