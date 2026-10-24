import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { CategoriesModule } from '../categories/categories.module';
import { MediaController } from './controllers/media.controller';
import { ProductImagesController } from './controllers/product-images.controller';
import { ImageStorageService } from './services/image-storage.service';
import { ProductImageStorageService } from './services/product-image-storage.service';
@Module({
  imports: [AuthModule, CategoriesModule, TypeOrmModule.forFeature([Product, ProductImage])],
  controllers: [MediaController, ProductImagesController],
  providers: [ImageStorageService, ProductImageStorageService],
  exports: [ImageStorageService, ProductImageStorageService],
})
export class MediaModule {}
