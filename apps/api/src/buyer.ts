import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from './db.js';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

type Hook=(req:FastifyRequest,reply:FastifyReply)=>Promise<unknown>;
type DayRow={id:number;status:string;store:string;purchase_date:string;buyer_id:number};
type ItemRow={id:number;order_id:number;quantity:number;purchased_quantity:number;price_cents:number|null;status:string;day_status:string;order_status:string;shopping_day_id:number;buyer_id:number|null};
const idSchema=z.object({id:z.coerce.number().int().positive()});
const progress=z.object({
  status:z.enum(['pendiente','en_busqueda','comprado','no_disponible']),
  purchased_quantity:z.number().int().min(0).max(999).optional(),
  price_cents:z.number().int().min(0).max(100000000).nullable().optional(),
}).strict();
const question=z.object({
  question:z.string().trim().min(3).max(1200),
  alternative_description:z.string().trim().max(1200).nullish(),
  estimated_price_cents:z.number().int().min(0).max(100000000).nullish(),
}).strict();
const responseSchema=z.object({
  decision:z.enum(['aceptar','rechazar','pregunta']),
  response:z.string().trim().min(2).max(1200),
}).strict();
const imageSchema=z.object({
  filename:z.string().trim().min(1).max(150),
  mime_type:z.enum(['image/png','image/jpeg','image/webp']),
  base64:z.string().min(20).max(5600000),
}).strict();
const uploadDir=resolve(process.cwd(),'storage/uploads');
function error(reply:FastifyReply,status:number,message:string){return reply.code(status).send({error:message});}
function parse<T extends z.ZodTypeAny>(schema:T,body:unknown,reply:FastifyReply):z.output<T>|undefined{
  const result=schema.safeParse(body);
  if(!result.success){void error(reply,400,result.error.issues.map(i=>i.message).join('; '));return;}
  return result.data;
}
function identifier(request:FastifyRequest,reply:FastifyReply):number|undefined{
  const result=idSchema.safeParse(request.params);
  if(!result.success){void error(reply,400,'Identificador inválido');return;}
  return result.data.id;
}
function detectValidImage(data:Buffer,mime:string){
  if(data.length===0||data.length>4*1024*1024)return false;
  if(mime==='image/png')return data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(mime==='image/jpeg')return data.length>3&&data[0]===255&&data[1]===216&&data[2]===255;
  if(mime==='image/webp')return data.length>12&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP';
  return false;
}
function publicImage(reply:FastifyReply,record:{storage_path:string;mime_type:string}|undefined){
  if(!record||!(/^[\w-]+\.(png|jpg|webp)$/.test(record.storage_path)))return error(reply,404,'Imagen no encontrada');
  const path=join(uploadDir,record.storage_path);
  if(!existsSync(path))return error(reply,404,'Archivo no encontrado');
  reply.header('Cache-Control','private, no-store');
  return {mime_type:record.mime_type,base64:readFileSync(path).toString('base64')};
}

export function registerBuyerRoutes(app:FastifyInstance,db:Db,authenticate:Hook,requireBuyer:Hook){
  const secured={preHandler:[authenticate,requireBuyer]};
  const dayFor=db.prepare('SELECT id,store,purchase_date,status,buyer_id FROM shopping_days WHERE id=? AND buyer_id=?');
  const itemFor=db.prepare(`SELECT i.*,o.status order_status,o.shopping_day_id,d.status day_status,d.buyer_id
    FROM order_items i JOIN orders o ON o.id=i.order_id
    JOIN shopping_days d ON d.id=o.shopping_day_id
    WHERE i.id=? AND d.buyer_id=?`);
  const consultationFor=db.prepare(`SELECT c.*,i.order_id,i.status item_status,o.status order_status,d.buyer_id,d.status day_status
    FROM consultations c JOIN order_items i ON i.id=c.item_id
    JOIN orders o ON o.id=i.order_id JOIN shopping_days d ON d.id=o.shopping_day_id
    WHERE c.id=? AND d.buyer_id=?`);

  app.get('/api/buyer/days',secured,async request=>({
    days:db.prepare(`SELECT d.id,d.store,d.purchase_date,d.cutoff_at,d.status,
      (SELECT count(*) FROM orders o WHERE o.shopping_day_id=d.id AND o.status IN ('confirmado','en_compra','finalizado')) order_count,
      (SELECT count(*) FROM order_items i JOIN orders o ON o.id=i.order_id
       WHERE o.shopping_day_id=d.id AND o.status IN ('confirmado','en_compra','finalizado')) item_count,
      (SELECT count(*) FROM order_items i JOIN orders o ON o.id=i.order_id
       WHERE o.shopping_day_id=d.id AND o.status IN ('confirmado','en_compra','finalizado') AND i.status IN ('comprado','no_disponible')) resolved_count
      FROM shopping_days d WHERE d.buyer_id=? ORDER BY d.purchase_date DESC,d.id DESC LIMIT 200`)
      .all(Number(request.user.sub)),
  }));

  app.get('/api/buyer/days/:id',secured,async (request,reply)=>{
    const id=identifier(request,reply);if(!id)return;
    const day=dayFor.get(id,Number(request.user.sub)) as DayRow|undefined;
    if(!day)return error(reply,404,'Jornada no asignada');
    const orders=db.prepare(`SELECT o.id,o.status,o.notes,c.name customer_name,c.phone customer_phone
      FROM orders o JOIN customers c ON c.id=o.customer_id
      WHERE o.shopping_day_id=? AND o.status IN ('confirmado','en_compra','finalizado')
      ORDER BY c.name,o.id`).all(id) as Array<Record<string,unknown>>;
    const items=db.prepare(`SELECT i.id,i.order_id,i.description,i.quantity,i.purchased_quantity,i.price_cents,
      i.notes,i.product_url,i.status
      FROM order_items i JOIN orders o ON o.id=i.order_id
      WHERE o.shopping_day_id=? AND o.status IN ('confirmado','en_compra','finalizado')
      ORDER BY i.order_id,i.id`).all(id) as Array<Record<string,unknown>>;
    const ids=items.map(i=>i.id as number);
    const photos=db.prepare(`SELECT a.id,a.order_item_id,a.consultation_id,a.original_name
      FROM attachments a JOIN order_items i ON i.id=a.order_item_id JOIN orders o ON o.id=i.order_id
      WHERE o.shopping_day_id=? ORDER BY a.id`).all(id) as Array<{id:number;order_item_id:number;consultation_id:number|null;original_name:string|null}>;
    const consultations=db.prepare(`SELECT c.id,c.item_id,c.question,c.alternative_description,c.estimated_price_cents,c.status,c.created_at,
      (SELECT r.response FROM consultation_responses r WHERE r.consultation_id=c.id ORDER BY r.id DESC LIMIT 1) latest_response,
      (SELECT r.decision FROM consultation_responses r WHERE r.consultation_id=c.id ORDER BY r.id DESC LIMIT 1) latest_decision
      FROM consultations c JOIN order_items i ON i.id=c.item_id JOIN orders o ON o.id=i.order_id
      WHERE o.shopping_day_id=? ORDER BY c.id DESC`).all(id) as Array<Record<string,unknown>>;
    return {day,orders,items:items.map(i=>({...i,
      images:photos.filter(p=>p.order_item_id===i.id&&!p.consultation_id),
      consultations:consultations.filter(c=>c.item_id===i.id).map(c=>({...c,images:photos.filter(p=>p.consultation_id===c.id)})),
    })),total_items:ids.length};
  });

  app.post('/api/buyer/days/:id/start',secured,async(request,reply)=>{
    const id=identifier(request,reply);if(!id)return;
    const day=dayFor.get(id,Number(request.user.sub)) as DayRow|undefined;
    if(!day)return error(reply,404,'Jornada no asignada');
    if(day.status==='en_curso')return {ok:true,status:'en_curso'};
    if(day.status!=='programada')return error(reply,409,'Jornada cerrada');
    const count=(db.prepare(`SELECT count(*) total FROM orders WHERE shopping_day_id=? AND status='confirmado'`)
      .get(id) as {total:number}).total;
    if(count===0)return error(reply,409,'No hay pedidos confirmados para comprar');
    db.transaction(()=>{
      db.prepare("UPDATE shopping_days SET status='en_curso' WHERE id=?").run(id);
      db.prepare("UPDATE orders SET status='en_compra' WHERE shopping_day_id=? AND status='confirmado'").run(id);
    })();
    return {ok:true,status:'en_curso'};
  });

  app.patch('/api/buyer/items/:id',secured,async(request,reply)=>{
    const id=identifier(request,reply);if(!id)return;
    const input=parse(progress,request.body,reply);if(!input)return;
    const item=itemFor.get(id,Number(request.user.sub)) as ItemRow|undefined;
    if(!item)return error(reply,404,'Artículo no asignado');
    if(item.day_status!=='en_curso'||item.order_status!=='en_compra')
      return error(reply,409,'La jornada o pedido no está en compra');
    if(input.status==='comprado'&&(!input.purchased_quantity||input.purchased_quantity>item.quantity||input.price_cents===null||input.price_cents===undefined))
      return error(reply,400,'Indica cantidad comprada y precio unitario en centavos');
    if(input.status==='comprado'&&db.prepare("SELECT id FROM consultations WHERE item_id=? AND status='pendiente' LIMIT 1").get(id))
      return error(reply,409,'Resuelve la consulta pendiente antes de comprar');
    const quantity=input.status==='comprado'?input.purchased_quantity!:0;
    const price=input.status==='comprado'?input.price_cents!:null;
    db.prepare('UPDATE order_items SET status=?,purchased_quantity=?,price_cents=? WHERE id=?')
      .run(input.status,quantity,price,id);
    return {ok:true,status:input.status};
  });

  app.post('/api/buyer/items/:id/consultations',secured,async(request,reply)=>{
    const id=identifier(request,reply);if(!id)return;
    const input=parse(question,request.body,reply);if(!input)return;
    const item=itemFor.get(id,Number(request.user.sub)) as ItemRow|undefined;
    if(!item)return error(reply,404,'Artículo no asignado');
    if(item.day_status!=='en_curso'||item.order_status!=='en_compra'
      ||['comprado','no_disponible'].includes(item.status))return error(reply,409,'Este artículo no admite nuevas consultas');
    if(db.prepare("SELECT id FROM consultations WHERE item_id=? AND status='pendiente'").get(id))
      return error(reply,409,'Este artículo ya tiene una consulta pendiente');
    const newId=db.transaction(()=>{
      const result=db.prepare('INSERT INTO consultations(item_id,question,alternative_description,estimated_price_cents) VALUES(?,?,?,?)')
        .run(id,input.question,input.alternative_description?.trim()||null,input.estimated_price_cents??null);
      db.prepare("UPDATE order_items SET status='en_consulta',purchased_quantity=0,price_cents=NULL WHERE id=?").run(id);
      return Number(result.lastInsertRowid);
    })();
    return reply.code(201).send({id:newId});
  });

  app.post('/api/buyer/consultations/:id/images',secured,async(request,reply)=>{
    const id=identifier(request,reply);if(!id)return;
    const consultation=consultationFor.get(id,Number(request.user.sub)) as
      {item_id:number;item_status:string;status:string;day_status:string;order_status:string}|undefined;
    if(!consultation)return error(reply,404,'Consulta no asignada');
    if(consultation.status!=='pendiente'||consultation.day_status!=='en_curso'||consultation.order_status!=='en_compra')
      return error(reply,409,'La consulta está cerrada');
    const input=parse(imageSchema,request.body,reply);if(!input)return;
    if(!/^[a-zA-Z0-9+/]*={0,2}$/.test(input.base64)||input.base64.length%4!==0)
      return error(reply,400,'Imagen inválida');
    const content=Buffer.from(input.base64,'base64');
    if(!detectValidImage(content,input.mime_type))return error(reply,400,'Formato inválido o imagen mayor a 4 MB');
    const ext:{[key:string]:string}={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
    const filename=randomUUID()+'.'+ext[input.mime_type];
    mkdirSync(uploadDir,{recursive:true});
    writeFileSync(join(uploadDir,filename),content,{flag:'wx',mode:0o600});
    try{
      const result=db.prepare('INSERT INTO attachments(order_item_id,consultation_id,storage_path,mime_type,original_name) VALUES(?,?,?,?,?)')
        .run(consultation.item_id,id,filename,input.mime_type,input.filename);
      return reply.code(201).send({id:Number(result.lastInsertRowid)});
    }catch(e){try{const {unlinkSync}=await import('node:fs');unlinkSync(join(uploadDir,filename));}catch{}throw e;}
  });

  app.get('/api/buyer/images/:id',secured,async(request,reply)=>{
    const id=identifier(request,reply);if(!id)return;
    const file=db.prepare(`SELECT a.storage_path,a.mime_type FROM attachments a
      JOIN order_items i ON i.id=a.order_item_id JOIN orders o ON o.id=i.order_id
      JOIN shopping_days d ON d.id=o.shopping_day_id
      WHERE a.id=? AND d.buyer_id=? AND o.status IN ('confirmado','en_compra','finalizado')`)
      .get(id,Number(request.user.sub)) as {storage_path:string;mime_type:string}|undefined;
    return publicImage(reply,file);
  });

  app.post('/api/buyer/days/:id/finish',secured,async(request,reply)=>{
    const id=identifier(request,reply);if(!id)return;
    const day=dayFor.get(id,Number(request.user.sub)) as DayRow|undefined;
    if(!day)return error(reply,404,'Jornada no asignada');
    if(day.status!=='en_curso')return error(reply,409,'La jornada no está en curso');
    const unready=(db.prepare(`SELECT count(*) total FROM orders o WHERE o.shopping_day_id=?
      AND (o.status NOT IN ('en_compra','finalizado') OR EXISTS (
      SELECT 1 FROM order_items i WHERE i.order_id=o.id AND i.status NOT IN ('comprado','no_disponible')))
      `).get(id) as {total:number}).total;
    const unresolved=(db.prepare(`SELECT count(*) total FROM consultations c JOIN order_items i ON i.id=c.item_id
      JOIN orders o ON o.id=i.order_id WHERE o.shopping_day_id=? AND c.status='pendiente'`)
      .get(id) as {total:number}).total;
    if(unready>0||unresolved>0)return error(reply,409,'Hay pedidos, artículos o consultas por resolver');
    const cnt=(db.prepare("SELECT count(*) total FROM orders WHERE shopping_day_id=? AND status='en_compra'")
      .get(id) as {total:number}).total;
    if(cnt===0)return error(reply,409,'No hay pedidos en compra');
    db.transaction(()=>{
      db.prepare("UPDATE shopping_days SET status='finalizada' WHERE id=?").run(id);
      db.prepare("UPDATE orders SET status='finalizado' WHERE shopping_day_id=? AND status='en_compra'").run(id);
    })();
    return {ok:true,status:'finalizada'};
  });
}

export function registerAdminConsultationRoutes(app:FastifyInstance,db:Db,authenticate:Hook,requireAdmin:Hook){
  const secured={preHandler:[authenticate,requireAdmin]};
  app.get('/api/admin/consultations',secured,async()=>({
    consultations:db.prepare(`SELECT c.id,c.item_id,c.question,c.alternative_description,c.estimated_price_cents,c.status,
      c.created_at,i.description product_description,i.quantity,cust.name customer_name,d.store,d.purchase_date,
      (SELECT r.response FROM consultation_responses r WHERE r.consultation_id=c.id ORDER BY r.id DESC LIMIT 1) latest_response,
      (SELECT r.decision FROM consultation_responses r WHERE r.consultation_id=c.id ORDER BY r.id DESC LIMIT 1) latest_decision
      FROM consultations c JOIN order_items i ON i.id=c.item_id JOIN orders o ON o.id=i.order_id
      JOIN customers cust ON cust.id=o.customer_id JOIN shopping_days d ON d.id=o.shopping_day_id
      ORDER BY CASE WHEN c.status='pendiente' THEN 0 ELSE 1 END,c.id DESC LIMIT 200`).all(),
  }));
  app.post('/api/admin/consultations/:id/respond',secured,async(request,reply)=>{
    const id=identifier(request,reply);if(!id)return;
    const input=parse(responseSchema,request.body,reply);if(!input)return;
    const record=db.prepare(`SELECT c.id,c.item_id,c.status,d.status day_status,o.status order_status
      FROM consultations c JOIN order_items i ON i.id=c.item_id JOIN orders o ON o.id=i.order_id
      JOIN shopping_days d ON d.id=o.shopping_day_id WHERE c.id=?`)
      .get(id) as {id:number;item_id:number;status:string;day_status:string;order_status:string}|undefined;
    if(!record)return error(reply,404,'Consulta no encontrada');
    if(record.status!=='pendiente'||record.day_status!=='en_curso'||record.order_status!=='en_compra')
      return error(reply,409,'La consulta ya está cerrada');
    db.transaction(()=>{
      db.prepare('INSERT INTO consultation_responses(consultation_id,response,decision) VALUES(?,?,?)')
        .run(id,input.response,input.decision);
      if(input.decision!=='pregunta'){
        db.prepare("UPDATE consultations SET status=? WHERE id=?").run(input.decision==='aceptar'?'aceptada':'rechazada',id);
        db.prepare("UPDATE order_items SET status='en_busqueda' WHERE id=? AND status='en_consulta'").run(record.item_id);
      }
    })();
    return {ok:true,status:input.decision==='pregunta'?'pendiente':input.decision==='aceptar'?'aceptada':'rechazada'};
  });
}
