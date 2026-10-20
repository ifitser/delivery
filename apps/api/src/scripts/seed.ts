import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { openDatabase } from '../db.js';
import type { UserRole } from '../types.js';
if (process.env.NODE_ENV === 'production') throw new Error('Seed deshabilitado en producción.');
const specs: Array<{role: UserRole; name: string; key: string}> = [
  { role: 'admin', name: 'Administrador', key: 'ADMIN' },
  { role: 'buyer', name: 'Comprador', key: 'BUYER' },
  { role: 'customer', name: 'Cliente', key: 'CUSTOMER' },
];
const db = openDatabase(config.databasePath);
try {
  for (const spec of specs) {
    const email = process.env['SEED_' + spec.key + '_EMAIL']?.trim().toLowerCase();
    const password = process.env['SEED_' + spec.key + '_PASSWORD'];
    if (!email && !password) continue;
    if (!email || !password || password.length < 12)
      throw new Error('Configura SEED_' + spec.key + '_EMAIL y PASSWORD (12+ caracteres).');
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(spec.name, email, hash, spec.role);
    console.log(result.changes ? 'Creado: ' + spec.role : 'Ya existe: ' + spec.role);
  }
} finally { db.close(); }
