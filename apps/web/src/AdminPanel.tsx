import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, CalendarDays, Check, ChevronRight, ClipboardList, ImagePlus, LayoutDashboard, LogOut, Pencil, Plus, RefreshCw, ShoppingBasket, Store, Trash2, Users, X, MessageCircle, QrCode } from 'lucide-react';
import './admin.css';
import AdminConsultations from './AdminConsultations';
import WhatsAppInbox from './WhatsAppInbox';

type Customer={id:number;name:string;phone:string|null;notes:string|null};
type Day={id:number;store:'costco'|'sams';purchase_date:string;cutoff_at:string;buyer_id:number|null;buyer_name:string|null;status:string;order_count:number};
type Buyer={id:number;name:string;email:string};
type Order={id:number;customer_id:number;shopping_day_id:number;customer_name:string;store:string;purchase_date:string;status:string;notes:string|null;item_count:number;source:string};
type Item={id:number;description:string;quantity:number;purchased_quantity:number;price_cents:number|null;notes:string|null;product_url:string|null;status:string;images:{id:number;name:string}[]};
type Detail={order:Order;items:Item[]};
type Summary={customers:number;days:number;orders:number;items:number};
type Tab='inicio'|'clientes'|'jornadas'|'pedidos'|'consultas'|'whatsapp';
type Props={user:{name:string;email:string};token:string;onLogout:()=>void};
const storeName=(store:string)=>store==='costco'?'Costco':"Sam's Club";
const formatDate=(d:string)=>new Date(d+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'});
const statusNames:Record<string,string>={programada:'Programada',en_curso:'En curso',finalizada:'Finalizada',cancelada:'Cancelada',borrador:'Borrador',pendiente_revision:'Por revisar',confirmado:'Confirmado',en_compra:'En compra',finalizado:'Finalizado',pendiente:'Pendiente',en_busqueda:'En búsqueda',en_consulta:'En consulta',comprado:'Comprado',no_disponible:'No disponible'};
function Status({value}:{value:string}){return <span className={'d-status '+(['confirmado','comprado','finalizada'].includes(value)?'good':['cancelada','cancelado','no_disponible'].includes(value)?'bad':'')}>{statusNames[value]??value}</span>;}

async function request<T>(path:string,token:string,options:RequestInit={}):Promise<T>{
  const response=await fetch((import.meta.env.VITE_API_URL??'')+'/api/admin'+path,{
    ...options,headers:{Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error((data as {error?:string}).error||'Ocurrió un error en el servidor');
  return data as T;
}
async function toBase64(file:File):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
    reader.onerror=()=>reject(new Error('No fue posible leer la fotografía'));
    reader.readAsDataURL(file);
  });
}
function Photo({id,token,name}:{id:number;token:string;name:string}){
  const [src,setSrc]=useState('');
  useEffect(()=>{let alive=true;request<{mime_type:string;base64:string}>('/images/'+id,token).then(f=>{if(alive)setSrc('data:'+f.mime_type+';base64,'+f.base64);}).catch(()=>{});return()=>{alive=false;};},[id,token]);
  return src?<a href={src} target="_blank" rel="noreferrer" title={name}><img className="d-photo" src={src} alt={name}/></a>:<span className="d-photo d-photo-placeholder">Imagen</span>;
}
const dayDefault={store:'costco',purchase_date:'',cutoff_at:'',buyer_id:''};

export default function AdminPanel({user,token,onLogout}:Props){
  const [tab,setTab]=useState<Tab>('inicio');
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [days,setDays]=useState<Day[]>([]);
  const [buyers,setBuyers]=useState<Buyer[]>([]);
  const [orders,setOrders]=useState<Order[]>([]);
  const [summary,setSummary]=useState<Summary>({customers:0,days:0,orders:0,items:0});
  const [detail,setDetail]=useState<Detail|null>(null);
  const [selectedOrder,setSelectedOrder]=useState<number|null>(null);
  const [form,setForm]=useState<null|'cliente'|'jornada'|'pedido'>(null);
  const [editingCustomer,setEditingCustomer]=useState<Customer|null>(null);
  const [editingDay,setEditingDay]=useState<Day|null>(null);
  const [editingItem,setEditingItem]=useState<Item|null>(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [photoBusy,setPhotoBusy]=useState<number|null>(null);

  const load=useCallback(async()=>{
    const [c,d,b,o,s]=await Promise.all([
      request<{customers:Customer[]}>('/customers',token),
      request<{days:Day[]}>('/days',token),
      request<{buyers:Buyer[]}>('/buyers',token),
      request<{orders:Order[]}>('/orders',token),
      request<Summary>('/summary',token),
    ]);
    setCustomers(c.customers);setDays(d.days);setBuyers(b.buyers);setOrders(o.orders);setSummary(s);
  },[token]);
  const loadDetail=useCallback(async(id:number)=>setDetail(await request<Detail>('/orders/'+id,token)),[token]);
  useEffect(()=>{let active=true;load().catch(e=>{if(active)setError(String(e));}).finally(()=>{if(active)setLoading(false);});},[load]);
  useEffect(()=>{if(selectedOrder!==null)loadDetail(selectedOrder).catch(e=>setError(String(e)));else setDetail(null);},[selectedOrder,loadDetail]);

  async function action(fn:()=>Promise<unknown>,message:string){
    setError('');setSuccess('');setBusy(true);
    try {await fn();await load();if(selectedOrder!==null)await loadDetail(selectedOrder);setSuccess(message);return true;}
    catch(e){setError(e instanceof Error?e.message:'No se pudo completar la acción');return false;}
    finally{setBusy(false);}
  }
  function resetForms(){setForm(null);setEditingCustomer(null);setEditingDay(null);setEditingItem(null);}
  function openTab(next:Tab){setTab(next);setSelectedOrder(null);resetForms();setError('');setSuccess('');}
  const activeDays=days.filter(d=>d.status==='programada'||d.status==='en_curso');

  async function saveCustomer(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const data=new FormData(e.currentTarget);
    const body={name:String(data.get('name')||''),phone:String(data.get('phone')||'')||null,notes:String(data.get('notes')||'')||null};
    if(await action(()=>request(editingCustomer?'/customers/'+editingCustomer.id:'/customers',token,{method:editingCustomer?'PATCH':'POST',body:JSON.stringify(body)}),editingCustomer?'Cliente actualizado':'Cliente registrado'))resetForms();
  }
  async function saveDay(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const data=new FormData(e.currentTarget);
    const body={store:String(data.get('store')),purchase_date:String(data.get('purchase_date')),
      cutoff_at:String(data.get('cutoff_at')),buyer_id:Number(data.get('buyer_id'))||null,
      ...(editingDay?{status:String(data.get('status'))}:{})};
    if(await action(()=>request(editingDay?'/days/'+editingDay.id:'/days',token,{method:editingDay?'PATCH':'POST',body:JSON.stringify(body)}),editingDay?'Jornada actualizada':'Jornada programada'))resetForms();
  }
  async function saveOrder(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const data=new FormData(e.currentTarget);
    const body={customer_id:Number(data.get('customer_id')),shopping_day_id:Number(data.get('shopping_day_id')),notes:String(data.get('notes'))||null};
    let created:number|null=null;
    if(await action(async()=>{const result=await request<{id:number}>('/orders',token,{method:'POST',body:JSON.stringify(body)});created=result.id;},'Pedido creado: agrega ahora sus productos')){
      resetForms();if(created!==null)setSelectedOrder(created);
    }
  }
  async function saveItem(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!selectedOrder)return;
    const data=new FormData(e.currentTarget);
    const body={description:String(data.get('description')||''),quantity:Number(data.get('quantity'))||1,
      product_url:String(data.get('product_url')||'')||null,notes:String(data.get('notes')||'')||null};
    const input=e.currentTarget.elements.namedItem('photo') as HTMLInputElement|null;
    const file=input?.files?.[0];
    if(file && (file.size>4*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))){
      setError('Usa una imagen JPG, PNG o WebP menor de 4 MB.');return;
    }
    const ok=await action(async()=>{
      let itemId=editingItem?.id;
      if(editingItem)await request('/items/'+editingItem.id,token,{method:'PATCH',body:JSON.stringify(body)});
      else{const created=await request<{id:number}>('/orders/'+selectedOrder+'/items',token,{method:'POST',body:JSON.stringify(body)});itemId=created.id;}
      if(file && itemId)await request('/items/'+itemId+'/images',token,{method:'POST',body:JSON.stringify({filename:file.name,mime_type:file.type,base64:await toBase64(file)})});
    },editingItem?'Artículo actualizado':'Artículo agregado');
    if(ok)setEditingItem(null);
  }
  async function uploadPhoto(item:number,file:File){
    if(file.size>4*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type)){setError('Solo JPG, PNG o WebP de hasta 4 MB');return;}
    setPhotoBusy(item);
    await action(async()=>request('/items/'+item+'/images',token,{method:'POST',body:JSON.stringify({filename:file.name,mime_type:file.type,base64:await toBase64(file)})}),'Fotografía guardada');
    setPhotoBusy(null);
  }
  async function confirmOrder(id:number){
    await action(()=>request('/orders/'+id,token,{method:'PATCH',body:JSON.stringify({status:'confirmado'})}),'Pedido confirmado');
  }

  const nav:[Tab,string,typeof LayoutDashboard][]=[
    ['inicio','Resumen',LayoutDashboard],['clientes','Clientes',Users],['jornadas','Jornadas',CalendarDays],['pedidos','Pedidos',ClipboardList],['consultas','Consultas',MessageCircle],['whatsapp','WhatsApp',QrCode]
  ];
  return <div className="d-shell">
    <aside className="d-sidebar">
      <div className="d-brand"><span className="d-brand-symbol"><ShoppingBasket size={23}/></span><b>delivery<span>.</span></b></div>
      <div className="d-sidebar-label">ESPACIO DE TRABAJO</div>
      <nav className="d-menu" aria-label="Navegación principal">
        {nav.map(([key,label,Icon])=><button key={key} className={tab===key?'active':''} onClick={()=>openTab(key)}><Icon size={19}/>{label}<ChevronRight className="d-nav-chevron" size={15}/></button>)}
      </nav>
      <div className="d-side-bottom"><span className="d-avatar">{user.name.slice(0,1).toUpperCase()}</span><div><b>{user.name}</b><small>Administrador</small></div><button onClick={onLogout} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={18}/></button></div>
    </aside>
    <div className="d-main">
      <header className="d-header"><div className="d-mobile-brand">delivery<span>.</span></div><div className="d-header-right"><span className="d-connected"><span className="live-dot"/> Sistema local</span><button onClick={()=>{setError('');load().catch(e=>setError(String(e)));}} title="Actualizar datos"><RefreshCw size={18}/></button><button onClick={onLogout} className="d-mobile-logout"><LogOut size={18}/></button></div></header>
      <div className="d-body">
        {error&&<div className="d-alert error" role="alert"><span>{error}</span><button onClick={()=>setError('')} aria-label="Cerrar"><X size={16}/></button></div>}
        {success&&<div className="d-alert success" role="status"><Check size={17}/><span>{success}</span><button onClick={()=>setSuccess('')} aria-label="Cerrar"><X size={16}/></button></div>}
        {loading?<p>Cargando información...</p>:<>
          {tab==='inicio'&&<>
            <div className="d-welcome"><div><span className="d-kicker">PANEL ADMINISTRATIVO</span><h1>Buen día, {user.name} 👋</h1><p>Tu operación de compras en un solo lugar.</p></div><button className="d-primary" onClick={()=>{openTab('jornadas');setForm('jornada');}}><Plus size={18}/> Nueva jornada</button></div>
            <div className="d-stats"><Metric label="Clientes registrados" value={summary.customers} icon={Users}/><Metric label="Jornadas activas" value={summary.days} icon={CalendarDays}/><Metric label="Pedidos abiertos" value={summary.orders} icon={ClipboardList}/><Metric label="Artículos registrados" value={summary.items} icon={ShoppingBasket}/></div>
            <div className="d-two-cols">
              <section className="d-card"><div className="d-card-head"><div><h2>Próximas jornadas</h2><p>Fechas y compradores asignados</p></div><button className="d-text-action" onClick={()=>openTab('jornadas')}>Ver todas <ChevronRight size={16}/></button></div>
                {activeDays.length===0?<Empty text="Todavía no hay jornadas programadas"/>:activeDays.slice(0,5).map(d=><div className="d-listrow" key={d.id}><span className="d-listicon"><Store size={20}/></span><div><b>{storeName(d.store)}</b><small>{formatDate(d.purchase_date)} · {d.buyer_name||'Sin comprador'}</small></div><Status value={d.status}/></div>)}
              </section>
              <section className="d-card"><div className="d-card-head"><div><h2>Últimos pedidos</h2><p>Encargos registrados manualmente</p></div><button className="d-text-action" onClick={()=>openTab('pedidos')}>Ver pedidos <ChevronRight size={16}/></button></div>
                {orders.length===0?<Empty text="Crea tu primer pedido desde el panel de pedidos"/>:orders.slice(0,5).map(o=><button className="d-listrow d-rowbutton" key={o.id} onClick={()=>{openTab('pedidos');setSelectedOrder(o.id);}}><span className="d-listicon"><ClipboardList size={20}/></span><div><b>#{o.id} · {o.customer_name}</b><small>{storeName(o.store)} · {o.item_count} artículos</small></div><Status value={o.status}/></button>)}
              </section>
            </div>
            <p className="d-hint">Fase 1 · Clientes, jornadas y pedidos manuales. WhatsApp e IA se incorporarán más adelante.</p>
          </>}
          {tab==='clientes'&&<>
            <PageHeader kicker="DIRECTORIO" title="Clientes" subtitle="Registra las personas que te encargan productos." action="Nuevo cliente" onAction={()=>{resetForms();setForm('cliente');}}/>
            {form==='cliente'&&<section className="d-card d-form-card"><FormTitle title={editingCustomer?'Editar cliente':'Registrar cliente'} close={resetForms}/><form key={editingCustomer?.id||'new'} onSubmit={saveCustomer} className="d-form-grid">
              <Field label="Nombre completo"><input name="name" required minLength={2} maxLength={150} defaultValue={editingCustomer?.name||''} placeholder="Ej. María López"/></Field>
              <Field label="Teléfono (opcional)"><input name="phone" defaultValue={editingCustomer?.phone||''} placeholder="+52 998 123 4567"/></Field>
              <Field label="Notas" wide><textarea name="notes" maxLength={1200} defaultValue={editingCustomer?.notes||''} placeholder="Dirección, preferencias u observaciones"/></Field>
              <FormButtons busy={busy} close={resetForms} text={editingCustomer?'Guardar cambios':'Crear cliente'}/>
            </form></section>}
            <section className="d-card d-table-card"><div className="d-table-head"><h2>Clientes registrados <span>{customers.length}</span></h2></div>
              {customers.length===0?<Empty text="Todavía no hay clientes. Registra el primero para comenzar."/>:<div className="d-scroll"><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Notas</th><th></th></tr></thead><tbody>{customers.map(c=><tr key={c.id}><td><b>{c.name}</b></td><td>{c.phone||'—'}</td><td className="d-clamp">{c.notes||'—'}</td><td><button className="d-inline-btn" onClick={()=>{setEditingCustomer(c);setForm('cliente');}} aria-label={'Editar '+c.name}><Pencil size={16}/> Editar</button></td></tr>)}</tbody></table></div>}
            </section>
          </>}
          {tab==='jornadas'&&<>
            <PageHeader kicker="CALENDARIO" title="Jornadas de compra" subtitle="Organiza días de compra en Costco y Sam's Club." action="Nueva jornada" onAction={()=>{resetForms();setForm('jornada');}}/>
            {form==='jornada'&&<section className="d-card d-form-card"><FormTitle title={editingDay?'Editar jornada':'Programar jornada'} close={resetForms}/><form key={editingDay?.id||'new'} onSubmit={saveDay} className="d-form-grid">
              <Field label="Tienda"><select name="store" defaultValue={editingDay?.store||dayDefault.store} required><option value="costco">Costco</option><option value="sams">Sam's Club</option></select></Field>
              <Field label="Fecha de compra"><input name="purchase_date" type="date" required defaultValue={editingDay?.purchase_date||''}/></Field>
              <Field label="Fecha límite para pedidos"><input name="cutoff_at" type="datetime-local" required defaultValue={editingDay?.cutoff_at?.slice(0,16)||''}/></Field>
              <Field label="Comprador asignado"><select name="buyer_id" defaultValue={editingDay?.buyer_id||''}><option value="">Sin asignar</option>{buyers.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></Field>
              {editingDay&&<Field label="Estado"><select name="status" defaultValue={editingDay.status}><option value="programada">Programada</option><option value="cancelada">Cancelada</option></select></Field>}
              <FormButtons busy={busy} close={resetForms} text={editingDay?'Guardar cambios':'Programar jornada'}/>
            </form><p className="d-footnote">Para asignar un comprador primero crea su usuario desde el script de configuración. El plazo de pedidos es informativo por ahora; los administradores pueden capturarlos manualmente.</p></section>}
            <section className="d-card d-table-card"><div className="d-table-head"><h2>Jornadas <span>{days.length}</span></h2></div>
              {days.length===0?<Empty text="Programa una jornada para comenzar a registrar pedidos."/>:<div className="d-scroll"><table><thead><tr><th>Tienda</th><th>Compra</th><th>Fecha límite</th><th>Comprador</th><th>Pedidos</th><th>Estado</th><th></th></tr></thead><tbody>{days.map(d=><tr key={d.id}><td><b>{storeName(d.store)}</b></td><td>{formatDate(d.purchase_date)}</td><td>{d.cutoff_at.replace('T',' ')}</td><td>{d.buyer_name||'Sin asignar'}</td><td>{d.order_count}</td><td><Status value={d.status}/></td><td>{d.status==='programada'&&<button className="d-inline-btn" onClick={()=>{setEditingDay(d);setForm('jornada');}}><Pencil size={15}/> Editar</button>}</td></tr>)}</tbody></table></div>}
            </section>
          </>}
          {tab==='consultas'&&<AdminConsultations token={token}/>}
          {tab==='whatsapp'&&<WhatsAppInbox token={token} onConverted={load}/>} 
          {tab==='pedidos'&&<>
            {selectedOrder!==null?<div className="d-backrow"><button className="d-back" onClick={()=>{setSelectedOrder(null);setEditingItem(null);}}><ArrowLeft size={18}/> Volver a pedidos</button></div>:<PageHeader kicker="GESTIÓN" title="Pedidos" subtitle="Captura encargos y revisa los productos de cada cliente." action="Nuevo pedido" onAction={()=>{resetForms();setForm('pedido');}}/>}
            {!selectedOrder&&form==='pedido'&&<section className="d-card d-form-card"><FormTitle title="Nuevo pedido manual" close={resetForms}/><form onSubmit={saveOrder} className="d-form-grid">
              <Field label="Cliente"><select name="customer_id" required defaultValue=""><option value="" disabled>Selecciona un cliente</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Field label="Jornada"><select name="shopping_day_id" required defaultValue=""><option value="" disabled>Selecciona la jornada</option>{days.filter(d=>d.status==='programada').map(d=><option key={d.id} value={d.id}>{storeName(d.store)} · {formatDate(d.purchase_date)}</option>)}</select></Field>
              <Field label="Notas del pedido" wide><textarea name="notes" placeholder="Instrucciones generales (opcional)"/></Field>
              <FormButtons busy={busy} close={resetForms} text="Crear pedido"/>
            </form>{(!customers.length||!days.some(d=>d.status==='programada'))&&<p className="d-footnote">Necesitas al menos un cliente y una jornada abierta antes de crear un pedido.</p>}</section>}
            {selectedOrder!==null?(!detail?<p>Cargando pedido...</p>:<>
              <section className="d-detail-head"><div><span className="d-kicker">PEDIDO #{detail.order.id}</span><h1>{detail.order.customer_name}</h1><p>{storeName(detail.order.store)} · {formatDate(detail.order.purchase_date)} · {detail.items.length} artículos</p></div><div className="d-detail-actions"><Status value={detail.order.status}/>{['borrador','pendiente_revision'].includes(detail.order.status)&&<button className="d-primary" disabled={busy||detail.items.length===0} onClick={()=>confirmOrder(detail.order.id)}><Check size={18}/> Confirmar pedido</button>}</div></section>
              <section className="d-card d-items-card"><div className="d-card-head"><div><h2>Artículos solicitados</h2><p>Imágenes, enlaces, cantidades y observaciones</p></div></div>
                {detail.items.length===0?<Empty text="Este pedido no tiene productos todavía."/>:detail.items.map(item=><article className="d-item" key={item.id}>
                  <div className="d-item-media">{item.images.length?item.images.map(image=><Photo key={image.id} id={image.id} token={token} name={image.name}/>):<span className="d-photo d-photo-placeholder"><ShoppingBasket size={26}/></span>}</div>
                  <div className="d-item-main"><div className="d-item-line"><b>{item.description}</b><Status value={item.status}/></div><p><strong>Cantidad:</strong> {item.quantity}{item.notes?' · '+item.notes:''}</p>{item.product_url&&<a href={item.product_url} target="_blank" rel="noopener noreferrer">Ver enlace del producto ↗</a>}
                    {item.status==='comprado'&&<p className="d-purchase-receipt"><Check size={16}/> Compradas: {item.purchased_quantity} · Precio unitario: {((item.price_cents??0)/100).toLocaleString('es-MX',{style:'currency',currency:'MXN'})} · Total: {((item.price_cents??0)*item.purchased_quantity/100).toLocaleString('es-MX',{style:'currency',currency:'MXN'})}</p>}
                    {['borrador','pendiente_revision','confirmado'].includes(detail.order.status)&&<div className="d-item-buttons"><button onClick={()=>setEditingItem(item)}><Pencil size={15}/> Editar</button><label className="d-upload"><ImagePlus size={16}/>{photoBusy===item.id?'Subiendo...':'Añadir foto'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||photoBusy!==null} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadPhoto(item.id,file);e.target.value='';}}/></label><button className="danger" disabled={busy} onClick={()=>{if(window.confirm('¿Eliminar este artículo y sus fotos?'))void action(()=>request('/items/'+item.id,token,{method:'DELETE'}),'Artículo eliminado');}}><Trash2 size={15}/> Quitar</button></div>}
                  </div>
                </article>)}
              </section>
              {['borrador','pendiente_revision','confirmado'].includes(detail.order.status)&&<section className="d-card d-form-card"><FormTitle title={editingItem?'Editar artículo':'Agregar artículo'} close={()=>setEditingItem(null)}/><form key={editingItem?.id||'new-item'} onSubmit={saveItem} className="d-form-grid">
                <Field label="Producto / descripción" wide><textarea required name="description" minLength={2} placeholder="Ej. Detergente Kirkland, botella de 5 litros" defaultValue={editingItem?.description||''}/></Field>
                <Field label="Cantidad"><input type="number" name="quantity" min="1" max="999" required defaultValue={editingItem?.quantity||1}/></Field>
                <Field label="Enlace (opcional)"><input type="url" name="product_url" placeholder="https://..." defaultValue={editingItem?.product_url||''}/></Field>
                <Field label="Notas" wide><textarea name="notes" placeholder="Preferencia, tamaño, alternativa..." defaultValue={editingItem?.notes||''}/></Field>
                <Field label="Foto del producto (opcional)" wide><input name="photo" type="file" accept="image/jpeg,image/png,image/webp"/><span className="d-input-help">JPG, PNG o WebP. Máximo 4 MB por fotografía.</span></Field>
                <div className="d-form-buttons"><button type="submit" className="d-primary" disabled={busy}><Plus size={17}/>{busy?'Guardando...':editingItem?'Guardar artículo':'Agregar artículo'}</button>{editingItem&&<button className="d-secondary" type="button" onClick={()=>setEditingItem(null)}>Cancelar edición</button>}</div>
              </form></section>}
            </>):<section className="d-card d-table-card"><div className="d-table-head"><h2>Pedidos registrados <span>{orders.length}</span></h2></div>
              {orders.length===0?<Empty text="Todavía no hay pedidos. Crea uno y agrega sus artículos."/>:<div className="d-scroll"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Jornada</th><th>Artículos</th><th>Estado</th><th></th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><b>#{o.id}</b></td><td>{o.customer_name}</td><td>{storeName(o.store)} · {formatDate(o.purchase_date)}</td><td>{o.item_count}</td><td><Status value={o.status}/></td><td><button className="d-inline-btn" onClick={()=>setSelectedOrder(o.id)}>Abrir <ChevronRight size={16}/></button></td></tr>)}</tbody></table></div>}
            </section>}
          </>}
        </>}
      </div>
    </div>
    <nav className="d-mobile-nav" aria-label="Navegación móvil">{nav.map(([key,label,Icon])=><button key={key} className={tab===key?'active':''} onClick={()=>openTab(key)}><Icon size={20}/><span>{label}</span></button>)}</nav>
  </div>;
}
function Metric({label,value,icon:Icon}:{label:string;value:number;icon:typeof Users}){return <div className="d-metric"><div className="d-metric-top"><span>{label}</span><Icon size={21}/></div><strong>{value}</strong><small>Registros en el sistema</small></div>;}
function Empty({text}:{text:string}){return <div className="d-empty"><ClipboardList size={27}/><p>{text}</p></div>;}
function PageHeader({kicker,title,subtitle,action,onAction}:{kicker:string;title:string;subtitle:string;action:string;onAction:()=>void}){return <div className="d-page-header"><div><span className="d-kicker">{kicker}</span><h1>{title}</h1><p>{subtitle}</p></div><button className="d-primary" onClick={onAction}><Plus size={18}/>{action}</button></div>;}
function FormTitle({title,close}:{title:string;close:()=>void}){return <div className="d-form-title"><h2>{title}</h2><button type="button" onClick={close} aria-label="Cerrar formulario"><X size={19}/></button></div>;}
function Field({label,children,wide}:{label:string;children:ReactNode;wide?:boolean}){return <label className={'d-field'+(wide?' wide':'')}><span>{label}</span>{children}</label>;}
function FormButtons({busy,close,text}:{busy:boolean;close:()=>void;text:string}){return <div className="d-form-buttons"><button type="submit" className="d-primary" disabled={busy}>{busy?'Guardando...':text}</button><button type="button" className="d-secondary" onClick={close}>Cancelar</button></div>;}
