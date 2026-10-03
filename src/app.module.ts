import { Module } from '@nestjs/common';
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

@Module({
  imports: [
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
  ],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
