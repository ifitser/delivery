import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.js';
import { openDatabase } from '../db.js';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = resolve(process.cwd(), '../../backups', stamp);
mkdirSync(destination, { recursive: true });
const db = openDatabase(config.databasePath);
try { await db.backup(resolve(destination, 'delivery.sqlite')); }
finally { db.close(); }
const uploads = resolve(process.cwd(), 'storage/uploads');
if (existsSync(uploads)) cpSync(uploads, resolve(destination, 'uploads'), { recursive: true });
console.log('Respaldo: ' + destination);
