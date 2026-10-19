import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RepairsController } from './controllers/repairs.controller';
import { RepairTicket } from './entities/repair-ticket.entity';
import { RepairsService } from './services/repairs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RepairTicket]),
    AuthModule,
    NotificationModule,
  ],
  controllers: [RepairsController],
  providers: [RepairsService],
})
export class RepairsModule {}
