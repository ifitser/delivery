import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
// Los scripts npm -w usan apps/api como directorio de trabajo.
loadEnv({ path: resolve(process.cwd(), '../../.env'), quiet: true });
loadEnv({ path: resolve(process.cwd(), '.env'), quiet: true });
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.startsWith('CAMBIAR_')) {
  throw new Error('Configura JWT_SECRET con 32+ caracteres aleatorios en .env');
}
export const config = {
  port: Number(process.env.API_PORT ?? 3001),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  databasePath: process.env.DATABASE_PATH ?? '../../data/delivery.sqlite',
  jwtSecret,
};
