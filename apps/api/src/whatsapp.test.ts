import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { openDatabase } from './db.js';
import { buildApp } from './server.js';
import { ingest, inboxRows, senderPhone } from './whatsapp-inbox.js';

test('Fase 3: bandeja idempotente, identificación, fotos y conversión sin IA',async()=>{
  const db=openDatabase(':memory:');
  const files:string[]=[];
  const pw='contrasena-local-de-prueba';
  const hash=await bcrypt.hash(pw,4);
  const insertUser=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)');
  insertUser.run('Administrador','admin-wa@test.local',hash,'admin');
  insertUser.run('Comprador','buyer-wa@test.local',hash,'buyer');
  const customerId=Number(db.prepare('INSERT INTO customers(name,phone) VALUES (?,?)')
    .run('Cliente WA','+52 998 111 2233').lastInsertRowid);
  const jid='529981112233@s.whatsapp.net';
  const date='2026-10-20T14:00:00.000Z';
  assert.equal(senderPhone(jid),'529981112233');
  assert.equal(senderPhone('123456@lid'),null);
  const first=ingest(db,{externalId:jid+'/one',remoteJid:jid,body:'Quiero dos cafés',kind:'text',receivedAt:date});
  assert.equal(first.inserted,true);assert.ok(first.id);
  assert.equal(ingest(db,{externalId:jid+'/one',remoteJid:jid,body:'Otro',kind:'text',receivedAt:date}).inserted,false);
  const jpg=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(40),Buffer.from([255,217])]);
  const second=ingest(db,{externalId:jid+'/two',remoteJid:jid,body:'Este producto',kind:'image',receivedAt:date,
    image:{mimeType:'image/jpeg',bytes:jpg}});
  assert.ok(second.id);
  const rows=inboxRows(db) as Array<{id:number;customer_id:number;image_id:number|null;status:string}>;
  assert.equal(rows.length,2);assert.ok(rows.every(row=>row.customer_id===customerId));
  const media=rows.find(r=>r.id===second.id)!;
  assert.ok(media.image_id);
  const storedFiles=db.prepare('SELECT storage_path FROM attachments').all() as Array<{storage_path:string}>;
  files.push(...storedFiles.map(x=>x.storage_path));
  const missing=ingest(db,{externalId:'lid-123/test',remoteJid:'123456@lid',body:'Imagen sin descarga',
    kind:'image',receivedAt:date});
  assert.ok(missing.id);
  assert.equal((inboxRows(db) as Array<{id:number;status:string}>).find(x=>x.id===missing.id)?.status,'error_media');
  const dayId=Number(db.prepare(`INSERT INTO shopping_days(store,purchase_date,cutoff_at,status)
    VALUES('costco','2026-11-04','2026-11-03T18:00','programada')`).run().lastInsertRowid);
  const app=buildApp({db,jwtSecret:'clave-de-prueba-de-32-caracteres-de-seguridad',webOrigin:'http://localhost:5173'});
  const call=(method:'GET'|'PATCH'|'POST',path:string,token?:string,payload?:unknown)=>
    app.inject({method,url:path,headers:token?{authorization:'Bearer '+token}:undefined,payload});
  try{
    const login=async(email:string)=>{
      const response=await call('POST','/api/auth/login',undefined,{email,password:pw});
      assert.equal(response.statusCode,200,response.body);
      return response.json().token as string;
    };
    const admin=await login('admin-wa@test.local');
    const buyer=await login('buyer-wa@test.local');
    assert.equal((await call('GET','/api/admin/whatsapp/status')).statusCode,401);
    assert.equal((await call('GET','/api/admin/whatsapp/status',buyer)).statusCode,403);
    const status=await call('GET','/api/admin/whatsapp/status',admin);
    assert.equal(status.statusCode,200,status.body);
    assert.equal(status.json().status,'disconnected');
    const inbox=await call('GET','/api/admin/whatsapp/inbox',admin);
    assert.equal(inbox.json().messages.length,3);
    assert.equal((await call('GET','/api/admin/whatsapp/images/'+media.image_id,buyer)).statusCode,403);
    assert.equal((await call('GET','/api/admin/whatsapp/images/'+media.image_id,admin)).json().base64,jpg.toString('base64'));
    assert.equal((await call('POST','/api/admin/whatsapp/convert',buyer,{})).statusCode,403);
    assert.equal((await call('POST','/api/admin/whatsapp/convert',admin,{
      customer_id:customerId,shopping_day_id:dayId,
      items:[{message_id:first.id,description:'Café de prueba',quantity:2},
        {message_id:first.id,description:'Duplicado',quantity:1}],
    })).statusCode,400);
    assert.equal((await call('POST','/api/admin/whatsapp/convert',admin,{
      customer_id:customerId,shopping_day_id:dayId,
      items:[{message_id:first.id,description:'Café',quantity:2},
        {message_id:missing.id,description:'De otro cliente',quantity:1}],
    })).statusCode,409);
    assert.equal((db.prepare('SELECT count(*) n FROM orders').get() as {n:number}).n,0);
    const created=await call('POST','/api/admin/whatsapp/convert',admin,{
      customer_id:customerId,shopping_day_id:dayId,items:[
        {message_id:first.id,description:'Café 1 kilo',quantity:2},
        {message_id:second.id,description:'Producto en fotografía',quantity:1},
      ],
    });
    assert.equal(created.statusCode,201,created.body);
    const orderId=created.json().id as number;
    const order=db.prepare('SELECT source,status FROM orders WHERE id=?').get(orderId) as {source:string;status:string};
    assert.equal(order.source,'whatsapp');assert.equal(order.status,'pendiente_revision');
    assert.equal((db.prepare('SELECT count(*) n FROM order_items WHERE order_id=?').get(orderId) as {n:number}).n,2);
    const bothPhotos=db.prepare('SELECT storage_path FROM attachments').all() as Array<{storage_path:string}>;
    files.push(...bothPhotos.map(x=>x.storage_path));
    assert.equal(bothPhotos.length,2);assert.notEqual(bothPhotos[0].storage_path,bothPhotos[1].storage_path);
    assert.equal((await call('POST','/api/admin/whatsapp/convert',admin,{
      customer_id:customerId,shopping_day_id:dayId,items:[{message_id:first.id,description:'Duplicado',quantity:1}],
    })).statusCode,409);
    assert.equal((await call('PATCH','/api/admin/whatsapp/messages/'+first.id+'/archive',admin)).statusCode,409);
    assert.equal((await call('PATCH','/api/admin/whatsapp/messages/'+missing.id+'/customer',admin,{customer_id:customerId})).statusCode,200);
    assert.equal((await call('PATCH','/api/admin/whatsapp/messages/'+missing.id+'/archive',admin)).statusCode,200);
    assert.equal((await call('PATCH','/api/admin/whatsapp/messages/'+missing.id+'/restore',admin)).statusCode,200);
    const recovered=await call('POST','/api/admin/whatsapp/convert',admin,{
      customer_id:customerId,shopping_day_id:dayId,
      items:[{message_id:missing.id,description:'Sin foto original',quantity:1}],
    });
    assert.equal(recovered.statusCode,201,recovered.body);
    assert.equal((db.prepare('SELECT count(*) n FROM orders').get() as {n:number}).n,2);
  }finally{
    await app.close();
    db.close();
    for(const f of new Set(files)){try{unlinkSync(resolve(process.cwd(),'storage/uploads',f));}catch{}}
  }
});
