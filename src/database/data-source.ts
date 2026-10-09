import 'dotenv/config';
import { DataSource } from 'typeorm';

import { getDatabaseConfig } from '../config/database.config';
import { User } from '../users/entities/user.entity';

export const AppDataSource = new DataSource({
  ...getDatabaseConfig(),

  entities: [User],

  migrations: ['src/database/migrations/*.ts'],
});