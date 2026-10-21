import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { StorefrontTheme } from './entities/storefront-theme.entity';
import { StorefrontThemeService } from './services/storefront-theme.service';
import { StorefrontThemeController } from './controllers/storefront-theme.controller';
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([StorefrontTheme])],
  providers: [StorefrontThemeService],
  controllers: [StorefrontThemeController],
})
export class StorefrontThemeModule {}
