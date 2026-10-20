import '@fastify/jwt';
export type UserRole = 'admin' | 'buyer' | 'customer';
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: number; role: UserRole; email: string };
    user: { sub: number; role: UserRole; email: string; iat?: number; exp?: number };
  }
}
export interface UserRecord {
  id: number; name: string; email: string; password_hash: string;
  role: UserRole; active: number;
}
