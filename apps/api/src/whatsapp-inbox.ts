import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { Db } from './db.js';

const uploadDir = resolve(process.cwd(), 'storage/uploads');
export const itemSchema=z.object({
  message_id:z.number().int().positive(),
  description:z.string().trim().min(2).max(2000),
  quantity:z.number().int().min(1).max(999),
  notes:z.string().trim().max(1200).nullable().optional(),
  product_url:z.union([z.url().refine(s=>/^https?:\/\//i.test(s)).max(2000),z.literal(''),z.null()]).optional(),
}).strict();
export const convertSchema=z.object({
  shopping_day_id:z.number().int().positive(),customer_id:z.number().int().positive(),
  items:z.array(itemSchema).min(1).max(100),
}).strict().refine(data=>new Set(data.items.map(i=>i.message_id)).size===data.items.length,
  'No repitas mensajes dentro de un mismo pedido');

export function onlyDigits(value:string|null|undefined){return (value??'').replace(/\D/g,'');}
export function senderPhone(remoteJid:string):string|null{
  const match=/^([0-9]{8,16})@s\.whatsapp\.net$/.exec(remoteJid);
  return match?match[1]:null; // JID @lid no representa un teléfono confiable
}
export function matchedCustomer(db:Db,phone:string|null):number|null{
  if(!phone)return null;
  const rows=db.prepare('SELECT id,phone FROM customers WHERE phone IS NOT NULL').all() as {id:number;phone:string}[];
  const found=rows.filter(row=>onlyDigits(row.phone)===phone);
  return found.length===1?found[0].id:null;
}
export type Incoming={
  externalId:string;remoteJid:string;body:string|null;
  kind:'text'|'image';receivedAt:string;image?:{bytes:Buffer;mimeType:string};
};
export function ingest(db:Db,input:Incoming):{inserted:boolean;id:number|null}{
  if(!input.externalId||!input.remoteJid)return {inserted:false,id:null};
  if(db.prepare('SELECT id FROM inbound_messages WHERE external_id=?').get(input.externalId))
    return {inserted:false,id:null};
  const phone=senderPhone(input.remoteJid);
  const customer=matchedCustomer(db,phone);
  const mime=input.image?.mimeType;
  const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  const accepted=input.image&&mime&&extensions[mime]&&input.image.bytes.length<=4*1024*1024
    &&input.image.bytes.length>0;
  const filename=accepted?randomUUID()+'.'+extensions[mime]:null;
  try{
    if(filename&&input.image){
      mkdirSync(uploadDir,{recursive:true});
      writeFileSync(join(uploadDir,filename),input.image.bytes,{flag:'wx',mode:0o600});
    }
    const saved=db.transaction(()=>{
      const result=db.prepare(`INSERT OR IGNORE INTO inbound_messages
        (external_id,customer_id,body,received_at,status,remote_jid,sender_phone,kind)
        VALUES (?,?,?,?,'pendiente',?,?,?)`)
        .run(input.externalId,customer,input.body?.slice(0,5000)||null,input.receivedAt,input.remoteJid,phone,input.kind);
      if(!result.changes)return null;
      const id=Number(result.lastInsertRowid);
      if(filename&&mime){
        db.prepare('INSERT INTO attachments(message_id,storage_path,mime_type,original_name) VALUES(?,?,?,?)')
          .run(id,filename,mime,'WhatsApp '+id+'.'+extensions[mime]);
      }
      return id;
    })();
    if(saved===null&&filename)unlinkSync(join(uploadDir,filename));
    return {inserted:saved!==null,id:saved};
  }catch(e){if(filename&&existsSync(join(uploadDir,filename)))unlinkSync(join(uploadDir,filename));throw e;}
}
export function inboxRows(db:Db){
  return db.prepare(`SELECT m.id,m.customer_id,m.body,m.received_at,m.status,m.kind,m.sender_phone,m.remote_jid,m.order_id,
    c.name customer_name,a.id image_id,
    (SELECT count(*) FROM attachments x WHERE x.message_id=m.id) image_count
    FROM inbound_messages m LEFT JOIN customers c ON c.id=m.customer_id
    LEFT JOIN attachments a ON a.message_id=m.id
    ORDER BY m.id DESC LIMIT 200`).all();
}
export function inboundImage(db:Db,id:number){
  const image=db.prepare(`SELECT a.mime_type,a.storage_path FROM attachments a
    JOIN inbound_messages m ON m.id=a.message_id WHERE a.id=?`)
    .get(id) as {mime_type:string;storage_path:string}|undefined;
  if(!image||!(/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(image.storage_path)))return null;
  const path=join(uploadDir,image.storage_path);
  if(!existsSync(path))return null;
  return {mime_type:image.mime_type,base64:readFileSync(path).toString('base64')};
}
export class InboxError extends Error{constructor(public status:number,message:string){super(message);}}
export function convertMessages(db:Db,input:z.output<typeof convertSchema>):number{
  const day=db.prepare("SELECT id FROM shopping_days WHERE id=? AND status='programada'").get(input.shopping_day_id);
  if(!day)throw new InboxError(409,'Selecciona una jornada programada');
  const customer=db.prepare('SELECT id FROM customers WHERE id=?').get(input.customer_id);
  if(!customer)throw new InboxError(400,'Cliente no encontrado');
  const copies:string[]=[];
  try{
    const order=db.transaction(()=>{
      for(const item of input.items){
        const msg=db.prepare("SELECT id,customer_id,status FROM inbound_messages WHERE id=?").get(item.message_id)
          as {id:number;customer_id:number|null;status:string}|undefined;
        if(!msg||msg.status!=='pendiente'||msg.customer_id!==input.customer_id)
          throw new InboxError(409,'Los mensajes deben estar pendientes y pertenecer al mismo cliente');
      }
      const result=db.prepare(`INSERT INTO orders(customer_id,shopping_day_id,source,status,notes)
        VALUES (?,?,'whatsapp','pendiente_revision','Recibido desde WhatsApp; revisar antes de confirmar')`)
        .run(input.customer_id,input.shopping_day_id);
      const orderId=Number(result.lastInsertRowid);
      for(const item of input.items){
        const added=db.prepare(`INSERT INTO order_items(order_id,description,quantity,notes,product_url)
          VALUES(?,?,?,?,?)`).run(orderId,item.description,item.quantity,item.notes||null,item.product_url||null);
        const itemId=Number(added.lastInsertRowid);
        const attachments=db.prepare('SELECT storage_path,mime_type,original_name FROM attachments WHERE message_id=?')
          .all(item.message_id) as {storage_path:string;mime_type:string;original_name:string|null}[];
        for(const photo of attachments){
          if(!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(photo.storage_path))continue;
          const extension=photo.storage_path.split('.').pop()!;
          const copy=randomUUID()+'.'+extension;
          copyFileSync(join(uploadDir,photo.storage_path),join(uploadDir,copy));
          copies.push(copy);
          db.prepare('INSERT INTO attachments(order_item_id,storage_path,mime_type,original_name) VALUES(?,?,?,?)')
            .run(itemId,copy,photo.mime_type,photo.original_name);
        }
        db.prepare("UPDATE inbound_messages SET status='convertido',order_id=? WHERE id=? AND status='pendiente'")
          .run(orderId,item.message_id);
      }
      return orderId;
    })();
    return order;
  }catch(e){
    for(const copy of copies)try{unlinkSync(join(uploadDir,copy));}catch{}
    throw e;
  }
}
