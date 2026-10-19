import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { PaymentsController } from './controllers/payments.controller';
import { Payment } from './entities/payment.entity';
import { PaymentsService } from './services/payments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order, Product]),
    AuthModule,
    NotificationModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
