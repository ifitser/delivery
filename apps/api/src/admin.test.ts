import assert from 'node:assert/strict';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import { unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from './server.js';
import { openDatabase } from './db.js';

test('Fase 1: administración de clientes, jornadas, pedidos, artículos e imágenes protegidas', async () => {
  const db = openDatabase(':memory:');
  const password = 'clave-de-prueba-segura';
  const hash = await bcrypt.hash(password, 4);
  const adminId = Number(db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'admin')").run('Admin','admin@test.local',hash).lastInsertRowid);
  const buyerId = Number(db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'buyer')").run('Comprador','buyer@test.local',hash).lastInsertRowid);
  const app = buildApp({ db, jwtSecret: 'una-clave-local-de-pruebas-larga-y-segura', webOrigin: 'http://localhost:5173' });
  let savedPhoto: string | undefined;
  const invoke = async (url: string, method = 'GET', payload?: unknown, auth?: string) =>
    app.inject({ method: method as 'GET' | 'POST' | 'PATCH' | 'DELETE', url, payload, headers: auth ? { authorization: 'Bearer '+auth } : undefined });
  try {
    const login = await invoke('/api/auth/login','POST',{email:'admin@test.local',password});
    assert.equal(login.statusCode,200,login.body);
    const token = login.json().token as string;
    const buyerLogin = await invoke('/api/auth/login','POST',{email:'buyer@test.local',password});
    const buyerToken = buyerLogin.json().token as string;
    assert.equal((await invoke('/api/admin/customers')).statusCode,401);
    assert.equal((await invoke('/api/admin/customers','GET',undefined,buyerToken)).statusCode,403);

    const badCustomer = await invoke('/api/admin/customers','POST',{name:''},token);
    assert.equal(badCustomer.statusCode,400);
    const createdCustomer = await invoke('/api/admin/customers','POST',{name:'María López',phone:'+52 998 123 4567',notes:'Prefiere sin azúcar'},token);
    assert.equal(createdCustomer.statusCode,201,createdCustomer.body);
    const customerId = createdCustomer.json().id as number;
    assert.equal((await invoke('/api/admin/customers','POST',{name:'Otra',phone:'+52 998 123 4567'},token)).statusCode,409);
    assert.equal((await invoke('/api/admin/customers/'+customerId,'PATCH',{notes:'Confirmar cantidad'},token)).statusCode,200);

    const invalidDay = await invoke('/api/admin/days','POST',{store:'costco',purchase_date:'2026-11-03',cutoff_at:'2026-11-05T18:00',buyer_id:buyerId},token);
    assert.equal(invalidDay.statusCode,400);
    const newDay=await invoke('/api/admin/days','POST',{store:'costco',purchase_date:'2026-11-03',cutoff_at:'2026-11-02T18:00',buyer_id:buyerId},token);
    assert.equal(newDay.statusCode,201,newDay.body);
    const dayId=newDay.json().id as number;
    assert.equal((await invoke('/api/admin/days','GET',undefined,token)).json().days[0].buyer_name,'Comprador');

    const newOrder=await invoke('/api/admin/orders','POST',{customer_id:customerId,shopping_day_id:dayId,notes:'Entregar sábado'},token);
    assert.equal(newOrder.statusCode,201,newOrder.body);
    const orderId=newOrder.json().id as number;
    assert.equal((await invoke('/api/admin/orders/'+orderId,'PATCH',{status:'confirmado'},token)).statusCode,409);
    const item=await invoke('/api/admin/orders/'+orderId+'/items','POST',{description:'Café Kirkland 1 kg',quantity:2,product_url:'https://example.com/cafe',notes:'En grano'},token);
    assert.equal(item.statusCode,201,item.body);
    const itemId=item.json().id as number;
    assert.equal((await invoke('/api/admin/items/'+itemId,'PATCH',{quantity:3},token)).statusCode,200);
    assert.equal((await invoke('/api/admin/items/'+itemId+'/images','POST',{filename:'archivo.txt',mime_type:'image/png',base64:Buffer.from('no es una imagen').toString('base64')},token)).statusCode,400);
    const jpeg=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,255,217]);
    const uploaded=await invoke('/api/admin/items/'+itemId+'/images','POST',{filename:'cafe.jpg',mime_type:'image/jpeg',base64:jpeg.toString('base64')},token);
    assert.equal(uploaded.statusCode,201,uploaded.body);
    const attachmentId=uploaded.json().id as number;
    savedPhoto=(db.prepare('SELECT storage_path FROM attachments WHERE id=?').get(attachmentId) as {storage_path:string}).storage_path;
    assert.equal((await invoke('/api/admin/images/'+attachmentId,'GET',undefined,buyerToken)).statusCode,403);
    assert.equal((await invoke('/api/admin/images/'+attachmentId,'GET',undefined,token)).json().base64,jpeg.toString('base64'));
    const detail=await invoke('/api/admin/orders/'+orderId,'GET',undefined,token);
    assert.equal(detail.json().items[0].quantity,3);
    assert.equal(detail.json().items[0].images[0].id,attachmentId);
    assert.equal((await invoke('/api/admin/orders/'+orderId,'PATCH',{status:'confirmado'},token)).statusCode,200);
    assert.equal((await invoke('/api/admin/summary','GET',undefined,token)).json().orders,1);
    assert.equal((await invoke('/api/admin/items/'+itemId,'DELETE',undefined,token)).statusCode,200);
    assert.equal((await invoke('/api/admin/orders/'+orderId,'GET',undefined,token)).json().items.length,0);

    assert.equal(adminId>0,true);
  } finally {
    if(savedPhoto) try { unlinkSync(resolve(process.cwd(),'storage/uploads',savedPhoto)); } catch { /* ya eliminada */ }
    await app.close();
    db.close();
  }
});
