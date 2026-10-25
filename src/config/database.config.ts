export const getDatabaseConfig = () => {
  const useSsl = process.env.DB_SSL === 'true';

  return {
    type: 'postgres' as const,

    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),

    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    ssl: useSsl
      ? {
          rejectUnauthorized: false,
        }
      : false,

    synchronize: false,
  };
};