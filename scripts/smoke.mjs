#!/usr/bin/env node
// Smoke test de una instancia local o staging con datos de prueba.
// No utiliza credenciales ni llama a proveedores externos.
const origin = process.argv[2] || 'http://127.0.0.1:8080';
if (!/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d{2,5})?$/.test(origin)) {
  console.error('Por seguridad, smoke solo acepta localhost/127.0.0.1.');
  process.exit(2);
}
let ready = false;
for (let i = 0; i < 35; i++) {
  try {
    const response = await fetch(origin + '/api/health', {signal:AbortSignal.timeout(1500)});
    if (response.ok && (await response.json()).ok) { ready = true; break; }
  } catch {}
  await new Promise(r => setTimeout(r, 350));
}
if (!ready) {console.error('La API no responde en '+origin);process.exit(1);}
const checks = [
  {path:'/',status:200,contains:'<div id="root">' },
  {path:'/api/health',status:200,contains:'delivery-api'},
  {path:'/api/admin/summary',status:401,contains:'Sesión'},
  {path:'/api/buyer/days',status:401,contains:'Sesión'},
  {path:'/api/admin/whatsapp/status',status:401,contains:'Sesión'},
];
let failures=0;
for(const check of checks){
  const response=await fetch(origin+check.path,{headers:{accept:check.path==='/'?'text/html':'application/json'},signal:AbortSignal.timeout(3000)});
  const body=await response.text();
  const ok=response.status===check.status&&body.includes(check.contains);
  console.log((ok?'OK  ':'FAIL')+' '+check.path+' HTTP '+response.status);
  if(!ok)failures++;
}
if(failures){console.error('Smoke falló en '+failures+' rutas');process.exit(1);}
console.log('Entorno de pruebas: frontend, API y permisos básicos accesibles.');
