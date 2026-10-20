import { config } from '../config.js';
import { openDatabase } from '../db.js';
const db = openDatabase(config.databasePath);
console.log('Migraciones aplicadas.');
db.close();
