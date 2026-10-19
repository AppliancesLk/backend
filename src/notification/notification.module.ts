import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { Notification } from './entities/notification.entity';
import { EmailService } from './email/email.service';
import { NotificationService } from './notification.service';

@Module({
  imports: [UsersModule, TypeOrmModule.forFeature([Notification])],
  providers: [EmailService, NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
