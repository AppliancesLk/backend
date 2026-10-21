import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { CategoriesModule } from '../categories/categories.module';

import { Product } from './entities/product.entity';
import { ProductsController } from './controllers/products.controller';
import { ProductsService } from './services/products.service';
import { ProductCatalogService } from './services/product-catalog.service';
import { OrderInventoryService } from './services/order-inventory.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product]), CategoriesModule, AuthModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductCatalogService, OrderInventoryService],
  exports: [ProductsService, ProductCatalogService, OrderInventoryService],
})
export class ProductsModule {}
