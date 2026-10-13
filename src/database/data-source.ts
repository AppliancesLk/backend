import 'dotenv/config';
import { DataSource } from 'typeorm';

import { Category } from '../categories/entities/category.entity';
import { getDatabaseConfig } from '../config/database.config';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';

export const AppDataSource = new DataSource({
  ...getDatabaseConfig(),

  entities: [
    User,
    Category,
    Product,
  ],

  migrations: ['src/database/migrations/*.ts'],
});