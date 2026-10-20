import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Db } from './db.js';
import { registerAdminRoutes } from './admin.js';
import type { UserRecord, UserRole } from './types.js';
const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(256) });
export function buildApp(options: { db: Db; jwtSecret: string; webOrigin: string }) {
  const app = Fastify({ logger: true, bodyLimit: 6 * 1024 * 1024 });
  app.register(cors, { origin: options.webOrigin });
  app.register(jwt, { secret: options.jwtSecret, sign: { expiresIn: '8h' } });
  app.register(rateLimit, { global: false });
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const current = options.db.prepare('SELECT id, role FROM users WHERE id = ? AND active = 1')
        .get(Number(request.user.sub)) as { id: number; role: UserRole } | undefined;
      if (!current || current.role !== request.user.role) {
        return reply.code(401).send({ error: 'Cuenta inactiva o sesión desactualizada' });
      }
    } catch { return reply.code(401).send({ error: 'Sesión inválida o caducada' }); }
  };
  const requireRole = (role: UserRole) => async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user.role !== role) return reply.code(403).send({ error: 'Acceso no autorizado' });
  };
  const publicUser = (u: UserRecord) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
  app.get('/api/health', async () => ({ ok: true, service: 'delivery-api' }));
  app.post('/api/auth/login', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Ingresa un correo y contraseña válidos' });
    const { email, password } = parsed.data;
    const user = options.db.prepare('SELECT * FROM users WHERE email = ? AND active = 1')
      .get(email.toLowerCase()) as UserRecord | undefined;
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return reply.code(401).send({ error: 'Credenciales incorrectas' });
    return { token: app.jwt.sign({ sub: String(user.id), role: user.role, email: user.email }), user: publicUser(user) };
  });
  app.get('/api/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = options.db.prepare('SELECT * FROM users WHERE id = ? AND active = 1')
      .get(Number(request.user.sub)) as UserRecord | undefined;
    if (!user) return reply.code(401).send({ error: 'Cuenta inactiva' });
    return { user: publicUser(user) };
  });
  app.get('/api/admin/overview', { preHandler: [authenticate, requireRole('admin')] },
    async () => ({ role: 'admin', title: 'Administración', description: 'Próximo paso: clientes, jornadas y pedidos manuales.' }));
  app.get('/api/buyer/overview', { preHandler: [authenticate, requireRole('buyer')] },
    async () => ({ role: 'buyer', title: 'Comprador', description: 'Próximo paso: jornadas asignadas y listas de compra.' }));
  app.get('/api/customer/overview', { preHandler: [authenticate, requireRole('customer')] },
    async () => ({ role: 'customer', title: 'Cliente', description: 'Portal de cliente previsto para una fase posterior.' }));
  registerAdminRoutes(app, options.db, authenticate, requireRole('admin'));
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof Error && 'statusCode' in error && error.statusCode === 429) return reply.code(429).send({ error: 'Demasiados intentos. Intenta más tarde.' });
    app.log.error(error);
    return reply.code(500).send({ error: 'Error interno del servidor' });
  });
  return app;
}
