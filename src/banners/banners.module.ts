import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { BannerSection } from './entities/banner-section.entity';
import { BannersController } from './controllers/banners.controller';
import { BannersService } from './services/banners.service';

@Module({
  imports: [TypeOrmModule.forFeature([BannerSection]), AuthModule, MediaModule],
  controllers: [BannersController],
  providers: [BannersService],
})
export class BannersModule {}
