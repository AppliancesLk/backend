import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import {
  Promotion,
  PromotionRecipient,
  PromotionRun,
} from './entities/promotion.entity';
import { PromotionsController } from './controllers/promotions.controller';
import { PromotionsService } from './services/promotions.service';
import { PromotionWorker } from './services/promotion-worker.service';
@Module({
  imports: [
    AuthModule,
    NotificationModule,
    TypeOrmModule.forFeature([Promotion, PromotionRecipient, PromotionRun]),
  ],
  controllers: [PromotionsController],
  providers: [PromotionsService, PromotionWorker],
})
export class PromotionsModule {}
