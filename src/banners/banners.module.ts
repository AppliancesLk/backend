import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { BannerSection } from './entities/banner-section.entity';
import { BannersController } from './controllers/banners.controller';
import { BannersService } from './services/banners.service';

@Module({
  imports: [TypeOrmModule.forFeature([BannerSection]), AuthModule],
  controllers: [BannersController],
  providers: [BannersService],
})
export class BannersModule {}
