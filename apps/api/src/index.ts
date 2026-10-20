import { config } from './config.js';
import { openDatabase } from './db.js';
import { buildApp } from './server.js';
const db = openDatabase(config.databasePath);
const app = buildApp({ db, jwtSecret: config.jwtSecret, webOrigin: config.webOrigin });
async function shutdown() { await app.close(); db.close(); }
process.once('SIGINT', () => { void shutdown().then(() => process.exit(0)); });
process.once('SIGTERM', () => { void shutdown().then(() => process.exit(0)); });
try {
  await app.listen({ port: config.port, host: process.env.API_HOST ?? '127.0.0.1' });
  console.log('API: http://localhost:' + config.port);
} catch (error) { console.error(error); db.close(); process.exit(1); }
