import assert from 'node:assert/strict';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import { unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from './db.js';
import { buildApp } from './server.js';

test('Fase 2: comprador sólo ve asignaciones, consulta alternativas y finaliza sin pendientes',async()=>{
  const db=openDatabase(':memory:');
  const password='clave-de-prueba-comprador-123';
  const hash=await bcrypt.hash(password,4);
  const add=(name:string,email:string,role:string)=>Number(db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(name,email,hash,role).lastInsertRowid);
  const admin=add('Admin','admin2@test.local','admin');
  const buyer=add('Luis','buyer1@test.local','buyer');
  const another=add('Mar','buyer2@test.local','buyer');
  const customer=Number(db.prepare('INSERT INTO customers(name,phone) VALUES(?,?)').run('María López','9981112233').lastInsertRowid);
  const d1=Number(db.prepare("INSERT INTO shopping_days(store,purchase_date,cutoff_at,buyer_id) VALUES ('costco','2026-11-12','2026-11-11T20:00',?)").run(buyer).lastInsertRowid);
  const d2=Number(db.prepare("INSERT INTO shopping_days(store,purchase_date,cutoff_at,buyer_id) VALUES ('sams','2026-11-13','2026-11-12T20:00',?)").run(another).lastInsertRowid);
  const o1=Number(db.prepare("INSERT INTO orders(customer_id,shopping_day_id,status) VALUES (?,?,'confirmado')").run(customer,d1).lastInsertRowid);
  const o2=Number(db.prepare("INSERT INTO orders(customer_id,shopping_day_id,status) VALUES (?,?,'confirmado')").run(customer,d2).lastInsertRowid);
  const a=Number(db.prepare("INSERT INTO order_items(order_id,description,quantity) VALUES (?,'Café de prueba',3)").run(o1).lastInsertRowid);
  const b=Number(db.prepare("INSERT INTO order_items(order_id,description,quantity) VALUES (?,'Shampoo de prueba',1)").run(o1).lastInsertRowid);
  db.prepare("INSERT INTO order_items(order_id,description,quantity) VALUES (?,'Otro artículo',2)").run(o2);
  const app=buildApp({db,jwtSecret:'clave-larga-de-pruebas-para-test-fase-dos',webOrigin:'http://localhost:5173'});
  const photoPaths:string[]=[];
  const request=(method:'GET'|'POST'|'PATCH'|'DELETE',url:string,token?:string,payload?:unknown)=>
    app.inject({method,url,headers:token?{authorization:'Bearer '+token}:undefined,payload});
  async function login(email:string){
    const r=await request('POST','/api/auth/login',undefined,{email,password});
    assert.equal(r.statusCode,200,r.body);
    return r.json().token as string;
  }
  try{
    const adminToken=await login('admin2@test.local');
    const buyerToken=await login('buyer1@test.local');
    const secondToken=await login('buyer2@test.local');
    assert.ok(admin>0);
    assert.equal((await request('GET','/api/buyer/days')).statusCode,401);
    assert.equal((await request('GET','/api/buyer/days',adminToken)).statusCode,403);
    const assigned=await request('GET','/api/buyer/days',buyerToken);
    assert.equal(assigned.statusCode,200,assigned.body);
    assert.deepEqual(assigned.json().days.map((d:{id:number})=>d.id),[d1]);
    assert.equal((await request('GET','/api/buyer/days/'+d2,buyerToken)).statusCode,404);
    assert.equal((await request('POST','/api/buyer/days/'+d2+'/start',buyerToken)).statusCode,404);
    assert.equal((await request('GET','/api/buyer/days/'+d1,secondToken)).statusCode,404);
    assert.equal((await request('PATCH','/api/buyer/items/'+a,buyerToken,{status:'comprado',purchased_quantity:2,price_cents:35000})).statusCode,409);

    const newPhoto=await request('POST','/api/admin/items/'+a+'/images',adminToken,{
      filename:'original.jpg',mime_type:'image/jpeg',
      base64:Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(20),Buffer.from([255,217])]).toString('base64'),
    });
    assert.equal(newPhoto.statusCode,201,newPhoto.body);
    const originalId=newPhoto.json().id as number;
    photoPaths.push((db.prepare('SELECT storage_path FROM attachments WHERE id=?').get(originalId) as {storage_path:string}).storage_path);
    assert.equal((await request('GET','/api/buyer/images/'+originalId,buyerToken)).statusCode,200);
    assert.equal((await request('GET','/api/buyer/images/'+originalId,secondToken)).statusCode,404);

    const started=await request('POST','/api/buyer/days/'+d1+'/start',buyerToken);
    assert.equal(started.statusCode,200,started.body);
    assert.equal((await request('POST','/api/buyer/days/'+d1+'/start',buyerToken)).statusCode,200);
    assert.equal((db.prepare('SELECT status FROM orders WHERE id=?').get(o1) as {status:string}).status,'en_compra');
    assert.equal((await request('POST','/api/admin/orders/'+o1+'/items',adminToken,{description:'Inadmisible',quantity:1})).statusCode,409);
    assert.equal((await request('PATCH','/api/admin/days/'+d1,adminToken,{buyer_id:another})).statusCode,409);

    const search=await request('PATCH','/api/buyer/items/'+a,buyerToken,{status:'en_busqueda'});
    assert.equal(search.statusCode,200,search.body);
    const consultation=await request('POST','/api/buyer/items/'+a+'/consultations',buyerToken,{
      question:'¿Acepta una presentación más pequeña?',
      alternative_description:'Café 500 gramos',estimated_price_cents:15999,
    });
    assert.equal(consultation.statusCode,201,consultation.body);
    const cid=consultation.json().id as number;
    assert.equal((await request('POST','/api/buyer/items/'+a+'/consultations',buyerToken,{question:'Doble consulta'})).statusCode,409);
    assert.equal((await request('PATCH','/api/buyer/items/'+a,buyerToken,{status:'comprado',purchased_quantity:2,price_cents:15999})).statusCode,409);
    assert.equal((await request('POST','/api/buyer/days/'+d1+'/finish',buyerToken)).statusCode,409);

    const alternativePhoto=await request('POST','/api/buyer/consultations/'+cid+'/images',buyerToken,{
      filename:'alternativa.png',mime_type:'image/png',
      base64:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(20)]).toString('base64'),
    });
    assert.equal(alternativePhoto.statusCode,201,alternativePhoto.body);
    const altId=alternativePhoto.json().id as number;
    photoPaths.push((db.prepare('SELECT storage_path FROM attachments WHERE id=?').get(altId) as {storage_path:string}).storage_path);
    assert.equal((await request('POST','/api/buyer/consultations/'+cid+'/images',secondToken,{
      filename:'otra.png',mime_type:'image/png',base64:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(20)]).toString('base64')})).statusCode,404);
    assert.equal((await request('GET','/api/admin/images/'+altId,adminToken)).statusCode,200);
    assert.equal((await request('GET','/api/buyer/images/'+altId,buyerToken)).statusCode,200);
    const consultList=await request('GET','/api/admin/consultations',adminToken);
    assert.equal(consultList.json().consultations[0].id,cid);
    assert.equal((await request('POST','/api/admin/consultations/'+cid+'/respond',buyerToken,{decision:'aceptar',response:'Sí'})).statusCode,403);
    assert.equal((await request('POST','/api/admin/consultations/'+cid+'/respond',adminToken,{decision:'aceptar',response:'Sí, aprobado'})).statusCode,200);
    assert.equal((await request('POST','/api/admin/consultations/'+cid+'/respond',adminToken,{decision:'rechazar',response:'No'})).statusCode,409);
    const detail=await request('GET','/api/buyer/days/'+d1,buyerToken);
    assert.equal(detail.statusCode,200);
    const entry=(detail.json().items as Array<{id:number;consultations:Array<{latest_response:string;images:Array<{id:number}>}>}>).find(i=>i.id===a)!;
    assert.equal(entry.consultations[0].latest_response,'Sí, aprobado');
    assert.equal(entry.consultations[0].images[0].id,altId);
    assert.equal((await request('PATCH','/api/buyer/items/'+a,buyerToken,{status:'comprado',purchased_quantity:9,price_cents:15999})).statusCode,400);
    assert.equal((await request('PATCH','/api/buyer/items/'+a,buyerToken,{status:'comprado',purchased_quantity:2,price_cents:15999})).statusCode,200);
    assert.equal((await request('PATCH','/api/buyer/items/'+b,buyerToken,{status:'no_disponible'})).statusCode,200);
    const close=await request('POST','/api/buyer/days/'+d1+'/finish',buyerToken);
    assert.equal(close.statusCode,200,close.body);
    assert.equal((db.prepare('SELECT status FROM orders WHERE id=?').get(o1) as {status:string}).status,'finalizado');
    assert.equal((await request('PATCH','/api/buyer/items/'+a,buyerToken,{status:'en_busqueda'})).statusCode,409);
    assert.equal((await request('POST','/api/buyer/days/'+d1+'/finish',buyerToken)).statusCode,409);
    const last=(await request('GET','/api/buyer/days',buyerToken)).json().days[0];
    assert.equal(last.resolved_count,2);
  }finally{
    for(const file of photoPaths){try{unlinkSync(resolve(process.cwd(),'storage/uploads',file));}catch{}}
    await app.close();db.close();
  }
});
