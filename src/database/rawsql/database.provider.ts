import { createPool } from 'mysql2/promise';
import { ConfigService } from '@nestjs/config';

export const databaseProvider = {
  provide: 'DATABASE_CONNECTION',
  inject: [ConfigService],
  useFactory: () => {
    return createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
      database: process.env.DB_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  },
};
