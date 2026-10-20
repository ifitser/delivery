import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from './db.js';
import { WhatsAppService } from './whatsapp.js';
import { InboxError, convertMessages, inboxRows, inboundImage } from './whatsapp-inbox.js';
import { AIError, interpret, providersAvailable, requestSchema } from './ai.js';

type Hook=(request:FastifyRequest,reply:FastifyReply)=>Promise<unknown>;
const idSchema=z.object({id:z.coerce.number().int().positive()});
const assignSchema=z.object({customer_id:z.number().int().positive()}).strict();
const convertSchema=z.object({
  shopping_day_id:z.number().int().positive(),
  customer_id:z.number().int().positive(),
  items:z.array(z.object({
    message_id:z.number().int().positive(),
    source_message_ids:z.array(z.number().int().positive()).min(1).max(10).optional(),
    description:z.string().trim().min(2).max(2000),
    quantity:z.number().int().min(1).max(999),
    notes:z.string().trim().max(1200).nullable().optional(),
    product_url:z.union([z.url().refine(s=>/^https?:\/\//i.test(s)).max(2000),z.literal(''),z.null()]).optional(),
  }).strict()).min(1).max(100),
}).strict().refine(v=>v.items.every(i=>!i.source_message_ids||
  (i.source_message_ids.includes(i.message_id)&&new Set(i.source_message_ids).size===i.source_message_ids.length)),
  'Verifica los identificadores de mensajes');
function id(request:FastifyRequest,reply:FastifyReply){
  const result=idSchema.safeParse(request.params);
  if(!result.success){void reply.code(400).send({error:'Identificador incorrecto'});return null;}
  return result.data.id;
}
export function registerWhatsAppRoutes(
  app:FastifyInstance,db:Db,service:WhatsAppService,authenticate:Hook,requireAdmin:Hook,
){
  const secured={preHandler:[authenticate,requireAdmin]};
  const sendError=(reply:FastifyReply,e:unknown)=>{
    if(e instanceof InboxError)return reply.code(e.status).send({error:e.message});
    app.log.error(e);
    return reply.code(500).send({error:'No fue posible completar la operación'});
  };
  app.get('/api/admin/whatsapp/status',secured,async()=>service.getState());
  app.post('/api/admin/whatsapp/connect',secured,async(_request,reply)=>{
    try{await service.start();return service.getState();}
    catch(e){return sendError(reply,e);}
  });
  app.post('/api/admin/whatsapp/disconnect',secured,async(_request,reply)=>{
    try{await service.disconnect();return service.getState();}
    catch(e){return sendError(reply,e);}
  });
  app.get('/api/admin/whatsapp/inbox',secured,async()=>({messages:inboxRows(db)}));
  app.get('/api/admin/ai/providers',secured,async()=>{
    const providers=providersAvailable().map(p=>({
      name:p.name,configured:p.enabled,vision:p.vision,daily_limit:p.limit,
      used_today:(db.prepare("SELECT COUNT(*) n FROM ai_attempts WHERE provider=? AND attempted_at>=? AND attempted_at<?")
        .get(p.name,new Date().toISOString().slice(0,10)+'T00:00:00',new Date().toISOString().slice(0,10)+'T23:59:59.999Z') as {n:number}).n,
    }));
    return {providers,notice:'Los límites locales no sustituyen los del proveedor. Solo OpenRouter con modelo openrouter/free está activado por defecto.'};
  });
  app.post('/api/admin/ai/interpret',{
    ...secured,config:{rateLimit:{max:5,timeWindow:'1 minute'}},
  },async(request,reply)=>{
    const parsed=requestSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'Selecciona de 1 a 10 mensajes distintos'});
    try{return await interpret(db,parsed.data);}
    catch(e){
      if(e instanceof AIError)return reply.code(e.code).send({error:e.message});
      app.log.error(e);return reply.code(500).send({error:'No se pudo interpretar el pedido'});
    }
  });
  app.get('/api/admin/whatsapp/images/:id',secured,async(request,reply)=>{
    const photoId=id(request,reply);if(photoId===null)return;
    const image=inboundImage(db,photoId);
    if(!image)return reply.code(404).send({error:'Imagen no encontrada'});
    reply.header('Cache-Control','private, no-store');
    return image;
  });
  app.patch('/api/admin/whatsapp/messages/:id/customer',secured,async(request,reply)=>{
    const messageId=id(request,reply);if(messageId===null)return;
    const parsed=assignSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'Selecciona un cliente válido'});
    const customer=db.prepare('SELECT id FROM customers WHERE id=?').get(parsed.data.customer_id);
    if(!customer)return reply.code(404).send({error:'Cliente inexistente'});
    const result=db.prepare("UPDATE inbound_messages SET customer_id=? WHERE id=? AND status IN ('pendiente','error_media')")
      .run(parsed.data.customer_id,messageId);
    if(!result.changes)return reply.code(409).send({error:'Mensaje no editable'});
    return {ok:true};
  });
  app.patch('/api/admin/whatsapp/messages/:id/archive',secured,async(request,reply)=>{
    const messageId=id(request,reply);if(messageId===null)return;
    const result=db.prepare("UPDATE inbound_messages SET status='archivado' WHERE id=? AND status IN ('pendiente','error_media')")
      .run(messageId);
    if(!result.changes)return reply.code(409).send({error:'Mensaje no disponible'});
    return {ok:true};
  });
  app.patch('/api/admin/whatsapp/messages/:id/restore',secured,async(request,reply)=>{
    const messageId=id(request,reply);if(messageId===null)return;
    const record=db.prepare("SELECT id,kind FROM inbound_messages WHERE id=? AND status='archivado'").get(messageId) as
      {id:number;kind:string}|undefined;
    if(!record)return reply.code(409).send({error:'Mensaje no archivado'});
    const hasPhoto=!!db.prepare('SELECT id FROM attachments WHERE message_id=?').get(messageId);
    const next=record.kind==='image'&&!hasPhoto?'error_media':'pendiente';
    db.prepare("UPDATE inbound_messages SET status=? WHERE id=? AND status='archivado'").run(next,messageId);
    return {ok:true};
  });
  app.post('/api/admin/whatsapp/convert',secured,async(request,reply)=>{
    const parsed=convertSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:parsed.error.issues.map(i=>i.message).join('; ')});
    try{
      const orderId=convertMessages(db,parsed.data);
      return reply.code(201).send({id:orderId});
    }catch(e){return sendError(reply,e);}
  });
}
