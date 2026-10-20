import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, CheckCheck, ChevronRight, CircleHelp, ClipboardList, Clock, LogOut, MessageCircle, PackageCheck, RefreshCw, Search, ShoppingBasket, Store, Wallet, X } from 'lucide-react';
import './buyer.css';

type Day={id:number;store:string;purchase_date:string;cutoff_at:string;status:string;order_count:number;item_count:number;resolved_count:number};
type Order={id:number;customer_name:string;customer_phone:string|null;status:string;notes:string|null};
type Image={id:number;original_name:string|null;consultation_id:number|null};
type Consultation={id:number;question:string;alternative_description:string|null;estimated_price_cents:number|null;status:string;latest_response:string|null;latest_decision:string|null;images:Image[]};
type Item={id:number;order_id:number;description:string;quantity:number;purchased_quantity:number;price_cents:number|null;notes:string|null;product_url:string|null;status:string;images:Image[];consultations:Consultation[]};
type Detail={day:Day;orders:Order[];items:Item[];total_items:number};
type Props={user:{name:string};token:string;onLogout:()=>void};
const money=(c:number)=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(c/100);
const date=(d:string)=>new Date(d+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'});
const shop=(x:string)=>x==='costco'?'Costco':"Sam's Club";
const states:Record<string,string>={programada:'Programada',en_curso:'En compra',finalizada:'Finalizada',cancelada:'Cancelada',pendiente:'Pendiente',en_busqueda:'Buscando',en_consulta:'En consulta',comprado:'Comprado',no_disponible:'No disponible',aceptada:'Aceptada',rechazada:'Rechazada'};
const isDone=(s:string)=>s==='comprado'||s==='no_disponible';
async function api<T>(path:string,token:string,options:RequestInit={}):Promise<T>{
  const res=await fetch((import.meta.env.VITE_API_URL??'')+'/api/buyer'+path,{
    ...options,headers:{Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},
  });
  const json=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error((json as {error?:string}).error||'No se pudo completar la operación');
  return json as T;
}
function ImageThumb({id,token,name}:{id:number;token:string;name:string}){
  const [src,setSrc]=useState('');
  useEffect(()=>{let active=true;api<{mime_type:string;base64:string}>('/images/'+id,token)
    .then(v=>{if(active)setSrc('data:'+v.mime_type+';base64,'+v.base64);}).catch(()=>{});
    return()=>{active=false;};},[id,token]);
  return src?<a href={src} target="_blank" rel="noreferrer" title={name}><img className="b-photo" src={src} alt={name}/></a>
    :<div className="b-photo b-placeholder"><Camera size={19}/></div>;
}
async function fileBase64(file:File):Promise<string>{
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=()=>reject(new Error('No se pudo leer la imagen'));r.readAsDataURL(file);});
}
function Pill({status}:{status:string}){return <span className={'b-pill b-'+status}>{states[status]??status}</span>;}

export default function BuyerPanel({user,token,onLogout}:Props){
  const [days,setDays]=useState<Day[]>([]);
  const [dayId,setDayId]=useState<number|null>(null);
  const [detail,setDetail]=useState<Detail|null>(null);
  const [filter,setFilter]=useState<'todos'|'pendientes'|'resueltos'|'consultas'>('pendientes');
  const [group,setGroup]=useState<'cliente'|'lista'>('lista');
  const [search,setSearch]=useState('');
  const [form,setForm]=useState<{id:number;type:'comprar'|'consulta'}|null>(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const refresh=useCallback(async()=>{
    const result=await api<{days:Day[]}>('/days',token);
    setDays(result.days);
    if(dayId!==null)setDetail(await api<Detail>('/days/'+dayId,token));
  },[dayId,token]);
  useEffect(()=>{let active=true;setLoading(true);refresh().catch(e=>{if(active)setError(String(e));})
    .finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[refresh]);

  async function perform(fn:()=>Promise<unknown>,success:string){
    setError('');setMessage('');setBusy(true);
    try{await fn();await refresh();setForm(null);setMessage(success);return true;}
    catch(e){setError(e instanceof Error?e.message:'Ocurrió un error');return false;}
    finally{setBusy(false);}
  }
  async function update(item:Item,status:'pendiente'|'en_busqueda'|'comprado'|'no_disponible',qty?:number,price?:number){
    await perform(()=>api('/items/'+item.id,token,{method:'PATCH',body:JSON.stringify({status,...(status==='comprado'?{purchased_quantity:qty,price_cents:price}:{})})}),
      status==='comprado'?'Compra guardada':'Estado actualizado');
  }
  async function buy(e:FormEvent<HTMLFormElement>,item:Item){
    e.preventDefault();const data=new FormData(e.currentTarget);
    const quantity=Number(data.get('quantity'));const pesos=Number(data.get('price'));
    if(!Number.isInteger(quantity)||quantity<1||quantity>item.quantity||!Number.isFinite(pesos)||pesos<0||pesos>1000000){
      setError('Introduce una cantidad válida y un precio unitario correcto');return;
    }
    await update(item,'comprado',quantity,Math.round(pesos*100));
  }
  async function ask(e:FormEvent<HTMLFormElement>,item:Item){
    e.preventDefault();const data=new FormData(e.currentTarget);
    const priceText=String(data.get('price')||'').trim();const cost=priceText?Number(priceText):null;
    if(cost!==null&&(!Number.isFinite(cost)||cost<0||cost>1000000)){setError('Precio inválido');return;}
    const question=String(data.get('question')||'').trim();const alternative=String(data.get('alternative')||'').trim();
    const file=(e.currentTarget.elements.namedItem('photo') as HTMLInputElement)?.files?.[0];
    if(file&&(file.size>4*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))){setError('La foto debe ser JPG, PNG o WebP y pesar menos de 4 MB');return;}
    await perform(async()=>{
      const created=await api<{id:number}>('/items/'+item.id+'/consultations',token,{method:'POST',
        body:JSON.stringify({question,alternative_description:alternative||null,estimated_price_cents:cost===null?null:Math.round(cost*100)})});
      if(file)await api('/consultations/'+created.id+'/images',token,{method:'POST',
        body:JSON.stringify({filename:file.name,mime_type:file.type,base64:await fileBase64(file)})});
    },'Consulta registrada. El administrador puede registrar la respuesta del cliente.');
  }
  const allOrders=detail?.orders??[];
  const ordersById=useMemo(()=>new Map(allOrders.map(o=>[o.id,o])),[allOrders]);
  const list=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return (detail?.items??[]).filter(i=>{
      if(filter==='pendientes'&&isDone(i.status))return false;
      if(filter==='resueltos'&&!isDone(i.status))return false;
      if(filter==='consultas'&&!i.consultations.some(c=>c.status==='pendiente'))return false;
      return !q||i.description.toLowerCase().includes(q)||(ordersById.get(i.order_id)?.customer_name||'').toLowerCase().includes(q);
    }).sort((a,b)=>a.order_id-b.order_id||a.id-b.id);
  },[detail,filter,search,ordersById]);
  const done=(detail?.items??[]).filter(i=>isDone(i.status)).length;
  const total=detail?.items.length??0;
  const spend=(detail?.items??[]).reduce((sum,i)=>sum+(i.status==='comprado'?(i.price_cents||0)*i.purchased_quantity:0),0);
  const consultPending=(detail?.items??[]).reduce((sum,i)=>sum+i.consultations.filter(c=>c.status==='pendiente').length,0);
  const allResolved=total>0&&done===total&&consultPending===0;

  function ItemView({item}:{item:Item}){
    const editable=detail?.day.status==='en_curso';
    const customer=ordersById.get(item.order_id);
    const hasPending=item.consultations.some(c=>c.status==='pendiente');
    return <article className={'b-item'+(isDone(item.status)?' b-item-done':'')} key={item.id}>
      <div className="b-item-content">
        <div className="b-item-top"><span className="b-customer">{customer?.customer_name||'Cliente'} · #{item.order_id}</span><Pill status={item.status}/></div>
        <div className="b-item-inner">
          <div className="b-gallery">{item.images.length?item.images.map(pic=><ImageThumb key={pic.id} id={pic.id} token={token} name={pic.original_name||'Producto'}/>):<div className="b-photo b-placeholder"><ShoppingBasket size={25}/></div>}</div>
          <div className="b-item-copy"><h3>{item.description}</h3><p><b>{item.quantity} {item.quantity===1?'pieza':'piezas'}</b>{item.notes?' · '+item.notes:''}</p>
            {item.product_url&&<a href={item.product_url} rel="noopener noreferrer" target="_blank">Ver referencia ↗</a>}
            {item.status==='comprado'&&<div className="b-receipt"><CheckCheck size={16}/> {item.purchased_quantity} compradas · {money(item.price_cents||0)} por unidad · <b>{money((item.price_cents||0)*item.purchased_quantity)}</b></div>}
          </div>
        </div>
        {item.consultations.length>0&&<div className="b-consultations">{item.consultations.map(c=><div className="b-consult" key={c.id}>
          <div className="b-consult-head"><MessageCircle size={15}/><b>Consulta #{c.id}</b><Pill status={c.status}/></div>
          <p>{c.question}</p>{c.alternative_description&&<p className="b-subdued">Alternativa: {c.alternative_description}</p>}
          {c.estimated_price_cents!==null&&<p className="b-subdued">Precio estimado: {money(c.estimated_price_cents)}</p>}
          {!!c.images.length&&<div className="b-gallery">{c.images.map(pic=><ImageThumb key={pic.id} id={pic.id} token={token} name={pic.original_name||'Alternativa'}/>)}</div>}
          {c.latest_response&&<p className="b-response"><b>Respuesta registrada:</b> {c.latest_response}</p>}
          {c.status==='pendiente'&&<small>En espera de respuesta del administrador</small>}
        </div>)}</div>}
        {editable&&<div className="b-actions">
          {!isDone(item.status)&&<button disabled={busy} className="b-outline" onClick={()=>void update(item,'en_busqueda')}><Search size={17}/> Buscando</button>}
          <button disabled={busy||hasPending} className="b-buy" onClick={()=>setForm(form?.id===item.id&&form.type==='comprar'?null:{id:item.id,type:'comprar'})}><Check size={18}/> {item.status==='comprado'?'Corregir compra':'Comprado'}</button>
          <button disabled={busy} className="b-outline" onClick={()=>setForm(form?.id===item.id&&form.type==='consulta'?null:{id:item.id,type:'consulta'})}><CircleHelp size={17}/> Consultar</button>
          {item.status!=='no_disponible'&&<button disabled={busy} className="b-outline b-unavailable" onClick={()=>{if(window.confirm('¿Marcar como no disponible?'))void update(item,'no_disponible');}}>No disponible</button>}
        </div>}
        {editable&&form?.id===item.id&&<div className="b-form">
          <div className="b-form-head"><b>{form.type==='comprar'?'Registrar compra':'Preguntar por alternativa'}</b><button onClick={()=>setForm(null)} title="Cerrar"><X size={18}/></button></div>
          {form.type==='comprar'?<form onSubmit={e=>void buy(e,item)}>
            <label>Cantidad comprada <input type="number" name="quantity" required min="1" max={item.quantity} defaultValue={item.purchased_quantity||item.quantity}/></label>
            <label>Precio por unidad (MXN) <input type="number" name="price" required min="0" step="0.01" defaultValue={item.price_cents===null?'':(item.price_cents/100).toFixed(2)} placeholder="Ej. 249.90"/></label>
            <button disabled={busy} className="b-main-btn" type="submit">Guardar compra <ArrowRight size={17}/></button>
          </form>:<form onSubmit={e=>void ask(e,item)}>
            <label>Pregunta al cliente <textarea name="question" rows={3} minLength={3} maxLength={1200} required placeholder="No encontré la presentación solicitada. ¿Aceptas esta alternativa?"/></label>
            <label>Alternativa ofrecida <input name="alternative" maxLength={1200} placeholder="Ej. Otra marca, presentación 1 kg"/></label>
            <label>Precio estimado (MXN, opcional) <input type="number" name="price" min="0" step="0.01" placeholder="Ej. 179.00"/></label>
            <label>Foto de alternativa (opcional) <input name="photo" type="file" accept="image/jpeg,image/png,image/webp"/></label>
            <button disabled={busy||hasPending} className="b-main-btn" type="submit">Registrar consulta <ArrowRight size={17}/></button>
            <small>Esta versión no envía WhatsApp automáticamente. El administrador registra la respuesta en su panel.</small>
          </form>}
        </div>}
      </div>
    </article>;
  }

  return <div className="b-layout">
    <header className="b-topbar"><div className="b-brand"><span><ShoppingBasket size={21}/></span>delivery<b>.</b></div><div className="b-header-right"><small>Comprador · {user.name}</small><button title="Actualizar" onClick={()=>refresh().catch(e=>setError(String(e)))}><RefreshCw size={18}/></button><button onClick={onLogout} title="Salir"><LogOut size={18}/></button></div></header>
    <main className="b-container">
      {error&&<div className="b-alert error" role="alert"><span>{error}</span><button onClick={()=>setError('')}><X size={16}/></button></div>}
      {message&&<div className="b-alert success" role="status"><Check size={17}/><span>{message}</span><button onClick={()=>setMessage('')}><X size={16}/></button></div>}
      {dayId===null?<>
        <div className="b-hero"><span className="b-eyebrow">MI ESPACIO · COMPRADOR</span><h1>Hola, {user.name} 👋</h1><p>Consulta tus jornadas de compra y organiza cada producto en tienda.</p></div>
        <div className="b-section-title"><h2>Mis jornadas</h2><span>{days.length} asignadas</span></div>
        {loading?<p>Cargando jornadas…</p>:!days.length?<div className="b-empty"><CalendarIcon/><b>Aún no tienes jornadas asignadas</b><p>El administrador deberá programar una jornada y asignarte como comprador.</p></div>:
          <div className="b-days">{days.map(d=><button key={d.id} className="b-daycard" onClick={()=>{setDayId(d.id);setFilter('pendientes');setGroup('lista');setSearch('');setForm(null);setMessage('');}}>
            <span className="b-store-icon"><Store size={24}/></span><div className="b-dayinfo"><b>{shop(d.store)}</b><p>{date(d.purchase_date)}</p><small>{d.order_count} pedidos · {d.item_count} artículos</small></div>
            <div className="b-dayright"><Pill status={d.status}/><span className="b-dayprogress">{d.resolved_count}/{d.item_count} <ChevronRight size={16}/></span></div>
          </button>)}</div>}
      </>:<>
        <button className="b-back" onClick={()=>{setDayId(null);setDetail(null);setForm(null);}}><ArrowLeft size={18}/> Mis jornadas</button>
        {!detail?<p>Cargando productos…</p>:<>
          <div className="b-trip-header"><div><span className="b-eyebrow">JORNADA #{detail.day.id}</span><h1>{shop(detail.day.store)}</h1><p>{date(detail.day.purchase_date)} · {detail.orders.length} pedidos</p></div><Pill status={detail.day.status}/></div>
          <div className="b-progress-card"><div className="b-progress-title"><div><span>Progreso de compra</span><strong>{done} de {total} artículos</strong></div><b>{total?Math.round(done/total*100):0}%</b></div><div className="b-progress-track"><span style={{width:(total?done/total*100:0)+'%'}}/></div>
            <div className="b-progress-meta"><span><Wallet size={16}/> Total registrado: {money(spend)}</span><span><Clock size={16}/> {consultPending} consultas pendientes</span></div>
          </div>
          {detail.day.status==='programada'&&<button className="b-start" disabled={busy||detail.orders.length===0} onClick={()=>void perform(()=>api('/days/'+dayId+'/start',token,{method:'POST'}),'Jornada iniciada. ¡Buena compra!')}>Iniciar jornada de compra <ArrowRight size={19}/></button>}
          {detail.day.status==='en_curso'&&<button className="b-finish" disabled={busy||!allResolved} onClick={()=>{if(window.confirm('¿Finalizar la jornada? Los pedidos quedarán cerrados.'))void perform(()=>api('/days/'+dayId+'/finish',token,{method:'POST'}),'Jornada finalizada correctamente');}}><PackageCheck size={18}/> Finalizar jornada</button>}
          {detail.day.status==='en_curso'&&!allResolved&&<p className="b-finish-hint">Para finalizar, todos los artículos deben estar comprados o no disponibles y las consultas resueltas.</p>}
          <div className="b-section-title b-section-tools"><h2>Lista de compra</h2><span>{list.length} resultados</span></div>
          <div className="b-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar producto o cliente" aria-label="Buscar productos"/></div>
          <div className="b-filters">{([['pendientes','Por comprar'],['todos','Todos'],['resueltos','Resueltos'],['consultas','Consultas']] as const).map(([v,label])=><button key={v} className={filter===v?'active':''} onClick={()=>setFilter(v)}>{label}</button>)}</div>
          <div className="b-group-switch"><span>Agrupar</span><div><button className={group==='lista'?'active':''} onClick={()=>setGroup('lista')}>Lista general</button><button className={group==='cliente'?'active':''} onClick={()=>setGroup('cliente')}>Por cliente</button></div></div>
          {!list.length?<div className="b-empty"><CheckCheck size={28}/><b>Sin productos en esta vista</b><p>Prueba otro filtro o revisa si hay pedidos confirmados.</p></div>:group==='lista'?<div className="b-items">{list.map(i=><ItemView key={i.id} item={i}/>)}</div>
          :<div className="b-by-customer">{detail.orders.map(o=>{const items=list.filter(i=>i.order_id===o.id);return items.length?<section key={o.id}><div className="b-customer-title"><b>{o.customer_name}</b><span>{items.length} artículos</span></div><div className="b-items">{items.map(i=><ItemView key={i.id} item={i}/>)}</div></section>:null;})}</div>}
        </>}
      </>}
      <footer className="b-footer">Delivery · Panel de comprador · Fase 2</footer>
    </main>
  </div>;
}
function CalendarIcon(){return <ClipboardList size={30}/>;}
