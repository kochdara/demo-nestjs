import { createPool } from 'mysql2/promise';

export const databaseProvider = {
  provide: 'DATABASE_CONNECTION',
  useFactory: async () => {
    return createPool({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'nest_demo',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  },
};