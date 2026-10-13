import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';

import { Category } from './entities/category.entity';
import { CategoriesController } from './controllers/categories.controller';
import { CategoriesService } from './services/categories.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Category]),
    AuthModule,
  ],

  controllers: [CategoriesController],

  providers: [CategoriesService],

  exports: [CategoriesService],
})
export class CategoriesModule {}