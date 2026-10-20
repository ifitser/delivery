import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { openDatabase } from './db.js';
import { buildApp } from './server.js';
import { ingest, convertMessages } from './whatsapp-inbox.js';
import { interpret, redactSensitive, textFallback, type ProviderTransport } from './ai.js';

test('Fase 4: reglas privadas, enrutamiento y fallback, visión y caché sin coste',async()=>{
  const db=openDatabase(':memory:');
  const customer=Number(db.prepare('INSERT INTO customers(name,phone) VALUES (?,?)').run('Cliente', '+52 998 000 0000').lastInsertRowid);
  const phone='529980000000@s.whatsapp.net';
  const img=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(32),Buffer.from([255,217])]);
  const files:string[]=[];
  try{
    assert.match(redactSensitive('Escríbeme a maria@email.com al +529981234567'),/\[correo omitido\]/);
    assert.ok(!redactSensitive('Llámame al +529981234567').includes('529981234567'));
    assert.equal(textFallback('2 x café\nshampoo x 3',42).length,2);
    const one=ingest(db,{externalId:'wa-1',remoteJid:phone,body:'2 x café\n1 x jabón',kind:'text',receivedAt:new Date().toISOString()});
    const two=ingest(db,{externalId:'wa-2',remoteJid:phone,body:'¿Este me traes dos?',kind:'image',
      receivedAt:new Date().toISOString(),image:{mimeType:'image/jpeg',bytes:img}});
    assert.ok(one.id&&two.id);
    const paths=db.prepare('SELECT storage_path FROM attachments').all() as {storage_path:string}[];
    files.push(...paths.map(x=>x.storage_path));
    const ids=[one.id!,two.id!];
    const calls:string[]=[];
    const transport:ProviderTransport=async request=>{
      calls.push(request.provider);
      assert.equal(request.payload.messages[0].id,ids[0]);
      if(request.provider==='openrouter')throw new Error('429 proveedor agotado');
      if(request.provider==='gemini')return {model:'gemini-2.5-flash-lite',items:[
        {source_message_ids:[ids[0]],description:'Café molido',quantity:2,confidence:'alta',notes:null,product_url:null},
        {source_message_ids:[ids[0]],description:'Jabón de baño',quantity:1,confidence:'media',notes:null,product_url:null},
        {source_message_ids:[ids[1]],description:'Producto foto',quantity:2,confidence:'baja',notes:null,product_url:null},
      ]};
      throw new Error('No debería usarse Groq con imágenes');
    };
    const env={OPENROUTER_API_KEY:'prueba-openrouter',GEMINI_API_KEY:'prueba-gemini',
      AI_ENABLE_GEMINI_FREE:'true',GROQ_API_KEY:'prueba-groq',AI_ENABLE_GROQ_FREE:'true'};
    const input={message_ids:ids,send_images:true};
    const result=await interpret(db,input,{env,transport});
    assert.equal(result.provider,'gemini');assert.equal(result.items.length,3);
    assert.equal(result.image_count,1);
    assert.deepEqual(calls,['openrouter','gemini']);
    const second=await interpret(db,input,{env,transport});
    assert.equal(second.cached,true);assert.equal(calls.length,2);
    const attempts=db.prepare('SELECT provider,result FROM ai_attempts ORDER BY id').all() as Array<{provider:string;result:string}>;
    assert.deepEqual(attempts.map(r=>r.provider),['openrouter','gemini']);
    assert.deepEqual(attempts.map(r=>r.result),['error','success']);
    // Sin claves, se usan reglas; la imagen y los datos de cliente no salen.
    const fallback=await interpret(db,{message_ids:[ids[0]],send_images:false},{env:{},transport});
    assert.equal(fallback.provider,'reglas');assert.equal(fallback.items.length,2);
    assert.ok(fallback.items.every(item=>item.confidence==='baja'));
    assert.equal(customer>0,true);
  }finally{
    db.close();
    for(const file of files)try{unlinkSync(resolve(process.cwd(),'storage/uploads',file));}catch{}
  }
});

test('Fase 4: ruta privada, cuotas y datos no inventados',async()=>{
  const db=openDatabase(':memory:');
  const hash=await bcrypt.hash('clave-de-prueba-ia',4);
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES ('Admin','ai-admin@test.local',?,'admin')").run(hash);
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES ('Buyer','ai-buyer@test.local',?,'buyer')").run(hash);
  const customer=Number(db.prepare("INSERT INTO customers(name,phone) VALUES ('María','529982233445')").run().lastInsertRowid);
  const msg=ingest(db,{externalId:'wa-local',remoteJid:'529982233445@s.whatsapp.net',
    body:'2 x detergente',kind:'text',receivedAt:new Date().toISOString()});
  assert.ok(customer&&msg.id);
  const app=buildApp({db,jwtSecret:'clave-de-pruebas-de-32-caracteres-para-ia',webOrigin:'http://localhost:5173'});
  const login=async(email:string)=>{
    const r=await app.inject({method:'POST',url:'/api/auth/login',payload:{email,password:'clave-de-prueba-ia'}});
    assert.equal(r.statusCode,200);return r.json().token as string;
  };
  try{
    const admin=await login('ai-admin@test.local');
    const buyer=await login('ai-buyer@test.local');
    const post=(token:string|undefined,payload:unknown)=>app.inject({method:'POST',url:'/api/admin/ai/interpret',payload,
      headers:token?{authorization:'Bearer '+token}:undefined});
    assert.equal((await post(undefined,{message_ids:[msg.id],send_images:false})).statusCode,401);
    assert.equal((await post(buyer,{message_ids:[msg.id],send_images:false})).statusCode,403);
    assert.equal((await post(admin,{message_ids:[msg.id,msg.id],send_images:false})).statusCode,400);
    const r=await post(admin,{message_ids:[msg.id],send_images:false});
    assert.equal(r.statusCode,200,r.body);
    assert.equal(r.json().provider,'reglas');
    assert.equal(r.json().items[0].description,'detergente');
    const p=await app.inject({url:'/api/admin/ai/providers',headers:{authorization:'Bearer '+admin}});
    assert.equal(p.statusCode,200);assert.equal(p.json().providers.length,3);
    assert.ok(p.json().providers.every((v:{configured:boolean})=>!v.configured));
  }finally{await app.close();db.close();}
});

test('Fase 4: varias líneas para un mensaje se convierten sin consumirlo dos veces',()=>{
  const db=openDatabase(':memory:');
  try{
    const customer=Number(db.prepare("INSERT INTO customers(name) VALUES ('Cliente')").run().lastInsertRowid);
    const day=Number(db.prepare("INSERT INTO shopping_days(store,purchase_date,cutoff_at) VALUES ('costco','2026-12-10','2026-12-09T18:00')").run().lastInsertRowid);
    const msg=ingest(db,{externalId:'wa-multiple',remoteJid:'529988776655@s.whatsapp.net',
      body:'2 x pasta\n3 x jabón',kind:'text',receivedAt:new Date().toISOString()});
    assert.ok(msg.id);
    db.prepare('UPDATE inbound_messages SET customer_id=? WHERE id=?').run(customer,msg.id);
    const order=convertMessages(db,{customer_id:customer,shopping_day_id:day,items:[
      {message_id:msg.id!,source_message_ids:[msg.id!],description:'Pasta',quantity:2},
      {message_id:msg.id!,source_message_ids:[msg.id!],description:'Jabón',quantity:3},
    ]});
    assert.equal((db.prepare('SELECT count(*) n FROM order_items WHERE order_id=?').get(order) as {n:number}).n,2);
    assert.equal((db.prepare('SELECT status FROM inbound_messages WHERE id=?').get(msg.id) as {status:string}).status,'convertido');
  }finally{db.close();}
});
