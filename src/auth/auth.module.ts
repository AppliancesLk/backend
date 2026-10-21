import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { NotificationModule } from '../notification/notification.module';
import { AuthSession } from './entities/auth-session.entity';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AccountAction } from './entities/account-action.entity';
import { AccountActionsService } from './services/account-actions.service';

@Module({
  imports: [
    UsersModule,
    NotificationModule,
    TypeOrmModule.forFeature([AuthSession, AccountAction]),
  ],
  controllers: [AuthController],
  providers: [AuthService, AccountActionsService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
