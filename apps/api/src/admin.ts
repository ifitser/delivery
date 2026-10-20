import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Db } from './db.js';

type Hook = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const note = z.string().trim().max(1200).nullish();
const name = z.string().trim().min(2).max(150);
const customerSchema = z.object({
  name, phone: z.string().trim().max(25).nullish(), notes: note,
}).strict();
const daySchema = z.object({
  store: z.enum(['costco', 'sams']),
  purchase_date: z.iso.date(),
  cutoff_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'Usa fecha y hora local'),
  buyer_id: z.number().int().positive().nullable().default(null),
}).strict();
const dayPatchSchema = daySchema.partial().extend({
  status: z.enum(['programada','en_curso','finalizada','cancelada']).optional(),
}).strict();
const orderSchema = z.object({
  customer_id: z.number().int().positive(),
  shopping_day_id: z.number().int().positive(),
  notes: note,
}).strict();
const orderPatch = z.object({
  notes: note, status: z.enum(['borrador','pendiente_revision','confirmado','en_compra','finalizado','cancelado']).optional(),
}).strict();
const itemSchema = z.object({
  description: z.string().trim().min(2).max(2000),
  quantity: z.number().int().min(1).max(999),
  notes: note,
  product_url: z.union([z.url().max(2000).refine(v => /^https?:\/\//i.test(v), 'Se requiere http(s)'), z.literal(''), z.null()]).optional(),
}).strict();
const imageSchema = z.object({
  filename: z.string().trim().min(1).max(150),
  mime_type: z.enum(['image/png','image/jpeg','image/webp']),
  base64: z.string().min(20).max(5_600_000),
}).strict();
const MAX_IMAGE = 4 * 1024 * 1024;
const LIMIT = 200;

function err(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send({ error: message });
}
function parse<T extends z.ZodTypeAny>(schema: T, body: unknown, reply: FastifyReply): z.output<T> | undefined {
  const result = schema.safeParse(body);
  if (!result.success) {
    void err(reply, 400, result.error.issues.map(issue => issue.path.join('.') + ': ' + issue.message).join('; '));
    return undefined;
  }
  return result.data;
}
function optionalText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}
function validDatePair(date: string, cutoff: string) {
  return Number.isFinite(Date.parse(date + 'T12:00:00')) && Number.isFinite(Date.parse(cutoff))
    && cutoff.slice(0,10) <= date;
}
function resolveId(request: FastifyRequest, reply: FastifyReply): number | undefined {
  const result = idSchema.safeParse(request.params);
  if (!result.success) { void err(reply, 400, 'ID incorrecto'); return undefined; }
  return result.data.id;
}
function validImage(bytes: Buffer, mime: string): boolean {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE) return false;
  if (mime === 'image/png') return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === 'image/jpeg') return bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/webp') return bytes.length > 12 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
  return false;
}

export function registerAdminRoutes(app: FastifyInstance, db: Db, authenticate: Hook, requireAdmin: Hook) {
  const secured = { preHandler: [authenticate, requireAdmin] };
  const uploadDir = resolve(process.cwd(), 'storage/uploads');
  const hasCustomer = db.prepare('SELECT id FROM customers WHERE id = ?');
  const hasDay = db.prepare("SELECT id FROM shopping_days WHERE id = ? AND status NOT IN ('finalizada','cancelada')");
  const hasBuyer = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'buyer' AND active = 1");
  const editableItem = db.prepare("SELECT i.* FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.id = ? AND o.status NOT IN ('finalizado','cancelado')");

  app.get('/api/admin/summary', secured, async () => {
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    return { customers: count('SELECT count(*) n FROM customers'),
      days: count("SELECT count(*) n FROM shopping_days WHERE status NOT IN ('finalizada','cancelada')"),
      orders: count("SELECT count(*) n FROM orders WHERE status NOT IN ('finalizado','cancelado')"),
      items: count('SELECT count(*) n FROM order_items') };
  });

  app.get('/api/admin/buyers', secured, async () => ({
    buyers: db.prepare("SELECT id,name,email FROM users WHERE role = 'buyer' AND active = 1 ORDER BY name").all(),
  }));

  app.get('/api/admin/customers', secured, async () => ({
    customers: db.prepare('SELECT id,name,phone,notes,created_at FROM customers ORDER BY name LIMIT ?').all(LIMIT),
  }));
  app.post('/api/admin/customers', secured, async (request, reply) => {
    const input = parse(customerSchema, request.body, reply); if (!input) return;
    const phone = optionalText(input.phone);
    if (phone && !/^\+?[0-9 ()-]{7,25}$/.test(phone)) return err(reply,400,'Teléfono inválido');
    try {
      const result = db.prepare('INSERT INTO customers(name,phone,notes) VALUES(?,?,?)').run(input.name,phone,optionalText(input.notes));
      return reply.code(201).send({ id: Number(result.lastInsertRowid) });
    } catch (e) { if (String(e).includes('UNIQUE')) return err(reply,409,'Este teléfono ya está registrado'); throw e; }
  });
  app.patch('/api/admin/customers/:id', secured, async (request, reply) => {
    const id = resolveId(request,reply); if (!id) return;
    const input = parse(customerSchema.partial().refine(v => Object.keys(v).length > 0),request.body,reply);
    if (!input) return;
    const old = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as Record<string, any> | undefined;
    if (!old) return err(reply,404,'Cliente no encontrado');
    const phone = input.phone === undefined ? old.phone : optionalText(input.phone);
    if (phone && !/^\+?[0-9 ()-]{7,25}$/.test(phone)) return err(reply,400,'Teléfono inválido');
    try {
      db.prepare('UPDATE customers SET name = ?, phone = ?, notes = ? WHERE id = ?').run(input.name ?? old.name,phone,input.notes === undefined ? old.notes : optionalText(input.notes),id);
      return { ok: true };
    } catch (e) { if (String(e).includes('UNIQUE')) return err(reply,409,'Este teléfono ya está registrado'); throw e; }
  });

  app.get('/api/admin/days', secured, async () => ({
    days: db.prepare(`SELECT d.id,d.store,d.purchase_date,d.cutoff_at,d.buyer_id,d.status,
      u.name buyer_name,(SELECT count(*) FROM orders o WHERE o.shopping_day_id=d.id) order_count
      FROM shopping_days d LEFT JOIN users u ON u.id=d.buyer_id ORDER BY d.purchase_date DESC,d.id DESC LIMIT ?`).all(LIMIT),
  }));
  app.post('/api/admin/days', secured, async (request,reply) => {
    const input = parse(daySchema,request.body,reply); if(!input) return;
    if(!validDatePair(input.purchase_date,input.cutoff_at)) return err(reply,400,'La fecha límite debe ser anterior o igual a la compra');
    if(input.buyer_id && !hasBuyer.get(input.buyer_id)) return err(reply,400,'Comprador no disponible');
    const result = db.prepare('INSERT INTO shopping_days(store,purchase_date,cutoff_at,buyer_id) VALUES(?,?,?,?)')
      .run(input.store,input.purchase_date,input.cutoff_at,input.buyer_id);
    return reply.code(201).send({id:Number(result.lastInsertRowid)});
  });
  app.patch('/api/admin/days/:id', secured, async (request,reply) => {
    const id=resolveId(request,reply); if(!id) return;
    const input=parse(dayPatchSchema.refine(v=>Object.keys(v).length>0),request.body,reply); if(!input) return;
    const current=db.prepare('SELECT * FROM shopping_days WHERE id=?').get(id) as Record<string, any>|undefined;
    if(!current) return err(reply,404,'Jornada no encontrada');
    if (current.status==='finalizada' || current.status==='cancelada') return err(reply,409,'Jornada cerrada');
    const next={...current,...input};
    if(!validDatePair(next.purchase_date,next.cutoff_at)) return err(reply,400,'La fecha límite debe ser anterior o igual a la compra');
    if(next.buyer_id && !hasBuyer.get(next.buyer_id)) return err(reply,400,'Comprador no disponible');
    db.prepare('UPDATE shopping_days SET store=?,purchase_date=?,cutoff_at=?,buyer_id=?,status=? WHERE id=?')
      .run(next.store,next.purchase_date,next.cutoff_at,next.buyer_id,next.status,id);
    return {ok:true};
  });

  app.get('/api/admin/orders', secured, async () => ({
    orders: db.prepare(`SELECT o.id,o.customer_id,o.shopping_day_id,o.status,o.notes,o.created_at,o.source,
      c.name customer_name,d.store,d.purchase_date,
      (SELECT count(*) FROM order_items i WHERE i.order_id=o.id) item_count
      FROM orders o JOIN customers c ON c.id=o.customer_id JOIN shopping_days d ON d.id=o.shopping_day_id
      ORDER BY o.id DESC LIMIT ?`).all(LIMIT),
  }));
  app.post('/api/admin/orders', secured, async (request,reply) => {
    const input=parse(orderSchema,request.body,reply);if(!input)return;
    if(!hasCustomer.get(input.customer_id)) return err(reply,400,'Cliente no encontrado');
    if(!hasDay.get(input.shopping_day_id)) return err(reply,400,'Jornada cerrada o inexistente');
    const result=db.prepare("INSERT INTO orders(customer_id,shopping_day_id,source,notes) VALUES(?,?,'manual',?)")
      .run(input.customer_id,input.shopping_day_id,optionalText(input.notes));
    return reply.code(201).send({id:Number(result.lastInsertRowid)});
  });
  app.get('/api/admin/orders/:id',secured,async (request,reply)=>{
    const id=resolveId(request,reply);if(!id)return;
    const order=db.prepare(`SELECT o.*,c.name customer_name,c.phone customer_phone,d.store,d.purchase_date
      FROM orders o JOIN customers c ON c.id=o.customer_id JOIN shopping_days d ON d.id=o.shopping_day_id WHERE o.id=?`).get(id);
    if(!order) return err(reply,404,'Pedido no encontrado');
    const items=db.prepare(`SELECT i.*,a.id image_id,a.original_name image_name
      FROM order_items i LEFT JOIN attachments a ON a.order_item_id=i.id
      WHERE i.order_id=? ORDER BY i.id,a.id`).all(id);
    const compact=new Map<number,Record<string,unknown>>();
    for(const record of items as Array<Record<string,any>>) {
      if(!compact.has(record.id)) compact.set(record.id,{id:record.id,order_id:record.order_id,description:record.description,
        quantity:record.quantity,notes:record.notes,product_url:record.product_url,status:record.status,
        purchased_quantity:record.purchased_quantity,price_cents:record.price_cents,images:[] as {id:number;name:string}[]});
      if(record.image_id) (compact.get(record.id)!.images as {id:number;name:string}[]).push({id:record.image_id,name:record.image_name});
    }
    return {order,items:[...compact.values()]};
  });
  app.patch('/api/admin/orders/:id',secured,async(request,reply)=>{
    const id=resolveId(request,reply);if(!id)return;
    const input=parse(orderPatch.refine(v=>Object.keys(v).length>0),request.body,reply);if(!input)return;
    const current=db.prepare('SELECT * FROM orders WHERE id=?').get(id) as {status:string;notes:string|null}|undefined;
    if(!current)return err(reply,404,'Pedido no encontrado');
    if(['finalizado','cancelado'].includes(current.status))return err(reply,409,'Pedido cerrado');
    if(input.status && !['borrador','pendiente_revision','confirmado','cancelado'].includes(input.status))
      return err(reply,400,'El comprador cambiará este estado en la Fase 2');
    if(input.status==='confirmado' && !(db.prepare('SELECT id FROM order_items WHERE order_id=? LIMIT 1').get(id)))
      return err(reply,409,'Agrega al menos un artículo antes de confirmar');
    db.prepare('UPDATE orders SET status=?, notes=? WHERE id=?')
      .run(input.status ?? current.status,input.notes===undefined?current.notes:optionalText(input.notes),id);
    return {ok:true};
  });

  app.post('/api/admin/orders/:id/items',secured,async (request,reply)=>{
    const id=resolveId(request,reply);if(!id)return;
    const input=parse(itemSchema,request.body,reply);if(!input)return;
    const order=db.prepare("SELECT o.id FROM orders o JOIN shopping_days d ON d.id=o.shopping_day_id WHERE o.id=? AND o.status NOT IN ('finalizado','cancelado') AND d.status NOT IN ('finalizada','cancelada')").get(id);
    if(!order)return err(reply,409,'Pedido inexistente o cerrado');
    const result=db.prepare('INSERT INTO order_items(order_id,description,quantity,notes,product_url) VALUES(?,?,?,?,?)')
      .run(id,input.description,input.quantity,optionalText(input.notes),optionalText(input.product_url));
    return reply.code(201).send({id:Number(result.lastInsertRowid)});
  });
  app.patch('/api/admin/items/:id',secured,async(request,reply)=>{
    const id=resolveId(request,reply);if(!id)return;
    const input=parse(itemSchema.partial().refine(v=>Object.keys(v).length>0),request.body,reply);if(!input)return;
    const current=editableItem.get(id) as Record<string,any>|undefined;
    if(!current)return err(reply,404,'Artículo no encontrado o pedido cerrado');
    db.prepare('UPDATE order_items SET description=?,quantity=?,notes=?,product_url=? WHERE id=?')
      .run(input.description ?? current.description,input.quantity ?? current.quantity,
        input.notes===undefined?current.notes:optionalText(input.notes),
        input.product_url===undefined?current.product_url:optionalText(input.product_url),id);
    return {ok:true};
  });
  app.delete('/api/admin/items/:id',secured,async (request,reply)=>{
    const id=resolveId(request,reply);if(!id)return;
    if(!editableItem.get(id))return err(reply,404,'Artículo no encontrado o pedido cerrado');
    const files=db.prepare('SELECT storage_path FROM attachments WHERE order_item_id=?').all(id) as {storage_path:string}[];
    db.prepare('DELETE FROM order_items WHERE id=?').run(id);
    for(const f of files) try { unlinkSync(join(uploadDir, f.storage_path)); } catch {/* Se puede limpiar después */ }
    return {ok:true};
  });

  app.post('/api/admin/items/:id/images',secured,async(request,reply)=>{
    const id=resolveId(request,reply);if(!id)return;
    if(!editableItem.get(id))return err(reply,404,'Artículo no encontrado o pedido cerrado');
    const input=parse(imageSchema,request.body,reply);if(!input)return;
    if(!/^[a-zA-Z0-9+/]*={0,2}$/.test(input.base64)||input.base64.length%4!==0)
      return err(reply,400,'Imagen en base64 inválida');
    const bytes=Buffer.from(input.base64,'base64');
    if(!validImage(bytes,input.mime_type))return err(reply,400,'Formato o tamaño de imagen no permitido (máximo 4 MB)');
    const ext:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
    const filename=randomUUID()+'.'+ext[input.mime_type];
    mkdirSync(uploadDir,{recursive:true});
    writeFileSync(join(uploadDir,filename),bytes,{flag:'wx',mode:0o600});
    try {
      const result=db.prepare('INSERT INTO attachments(order_item_id,storage_path,mime_type,original_name) VALUES(?,?,?,?)')
        .run(id,filename,input.mime_type,input.filename);
      return reply.code(201).send({id:Number(result.lastInsertRowid)});
    } catch(e) { unlinkSync(join(uploadDir,filename)); throw e; }
  });
  app.get('/api/admin/images/:id',secured,async(request,reply)=>{
    const id=resolveId(request,reply);if(!id)return;
    const file=db.prepare(`SELECT a.storage_path,a.mime_type FROM attachments a
      JOIN order_items i ON i.id=a.order_item_id WHERE a.id=?`).get(id) as {storage_path:string;mime_type:string}|undefined;
    if(!file)return err(reply,404,'Imagen no encontrada');
    if(!/^[\w-]+\.(png|jpg|webp)$/.test(file.storage_path))return err(reply,404,'Imagen no encontrada');
    const path=join(uploadDir,file.storage_path);
    if(!existsSync(path))return err(reply,404,'Archivo no encontrado');
    reply.header('Cache-Control','private, no-store');
    return {mime_type:file.mime_type,base64:readFileSync(path).toString('base64')};
  });
}
