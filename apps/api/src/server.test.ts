import assert from 'node:assert/strict';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import { openDatabase } from './db.js';
import { buildApp } from './server.js';

test('login, permisos por rol y sesión', async () => {
  const db = openDatabase(':memory:');
  const password = 'super-secreto-de-prueba-123';
  const hash = await bcrypt.hash(password, 4);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Administración', 'admin@test.local', hash, 'admin');
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Comprador', 'buyer@test.local', hash, 'buyer');
  const app = buildApp({ db, jwtSecret: 'un-secreto-de-pruebas-de-al-menos-32-caracteres', webOrigin: 'http://localhost:5173' });
  try {
    const health = await app.inject('/api/health');
    assert.equal(health.statusCode, 200);
    const invalid = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@test.local', password: 'incorrecta' } });
    assert.equal(invalid.statusCode, 401);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@test.local', password } });
    assert.equal(login.statusCode, 200);
    const token = login.json().token as string;
    const auth = { authorization: 'Bearer ' + token };
    assert.equal((await app.inject({ url: '/api/auth/me', headers: auth })).json().user.role, 'admin');
    assert.equal((await app.inject({ url: '/api/admin/overview', headers: auth })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/buyer/overview', headers: auth })).statusCode, 403);
    assert.equal((await app.inject('/api/admin/overview')).statusCode, 401);
    const buyerLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'buyer@test.local', password } });
    const buyerAuth = { authorization: 'Bearer ' + buyerLogin.json().token };
    assert.equal((await app.inject({ url: '/api/buyer/overview', headers: buyerAuth })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/admin/overview', headers: buyerAuth })).statusCode, 403);
    db.prepare('UPDATE users SET active = 0 WHERE email = ?').run('admin@test.local');
    assert.equal((await app.inject({ url: '/api/admin/overview', headers: auth })).statusCode, 401);
  } finally { await app.close(); db.close(); }
});
