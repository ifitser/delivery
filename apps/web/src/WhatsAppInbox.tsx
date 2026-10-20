import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Archive, CheckCircle2, ClipboardList, Image, Link2, MessageCircle, QrCode, RefreshCw, ShieldAlert, Smartphone, Unplug, X } from 'lucide-react';
import './whatsapp.css';

type Connection={status:'disconnected'|'connecting'|'qr'|'connected'|'reconnecting'|'error';qr_image:string|null;message:string|null};
type Customer={id:number;name:string;phone:string|null};
type Day={id:number;store:string;purchase_date:string;status:string};
type InboxMessage={id:number;customer_id:number|null;customer_name:string|null;body:string|null;received_at:string;status:string;kind:string;sender_phone:string|null;remote_jid:string|null;order_id:number|null;image_id:number|null;image_count:number};
type Editable={message_id:number;description:string;quantity:number;notes:string;product_url:string};
const isPending=(s:string)=>s==='pendiente'||s==='error_media';
const initialStatus:Connection={status:'disconnected',qr_image:null,message:null};
const labels:Record<Connection['status'],string>={disconnected:'Desconectado',connecting:'Conectando',qr:'Esperando escaneo QR',connected:'Conectado',reconnecting:'Reconectando',error:'Error de conexión'};
async function getApi<T>(token:string,path:string,options:RequestInit={}):Promise<T>{
  const res=await fetch((import.meta.env.VITE_API_URL??'')+'/api/admin'+path,{
    ...options,headers:{Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error((data as {error?:string}).error??'No se pudo completar la operación');
  return data as T;
}
function InboxImage({token,id}:{token:string;id:number}){
  const [src,setSrc]=useState('');
  useEffect(()=>{let alive=true;getApi<{mime_type:string;base64:string}>(token,'/whatsapp/images/'+id)
    .then(v=>{if(alive)setSrc('data:'+v.mime_type+';base64,'+v.base64);}).catch(()=>{});
    return()=>{alive=false;};},[token,id]);
  return src?<a href={src} rel="noreferrer" target="_blank"><img className="wa-inbox-image" alt="Foto recibida por WhatsApp" src={src}/></a>
    :<div className="wa-image-empty"><Image size={19}/></div>;
}
function readableDate(s:string){const date=new Date(s);return Number.isNaN(date.getTime())?s:date.toLocaleString('es-MX',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
export default function WhatsAppInbox({token,onConverted}:{token:string;onConverted:()=>Promise<void>}){
  const [connection,setConnection]=useState<Connection>(initialStatus);
  const [messages,setMessages]=useState<InboxMessage[]>([]);
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [days,setDays]=useState<Day[]>([]);
  const [selected,setSelected]=useState<number[]>([]);
  const [edits,setEdits]=useState<Record<number,Editable>>({});
  const [customerId,setCustomerId]=useState<number|null>(null);
  const [dayId,setDayId]=useState<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [showArchive,setShowArchive]=useState(false);
  const [assignments,setAssignments]=useState<Record<number,number>>({});
  const status=useCallback(async()=>setConnection(await getApi<Connection>(token,'/whatsapp/status')),[token]);
  const reload=useCallback(async()=>{
    const [list,c,d]=await Promise.all([
      getApi<{messages:InboxMessage[]}>(token,'/whatsapp/inbox'),
      getApi<{customers:Customer[]}>(token,'/customers'),
      getApi<{days:Day[]}>(token,'/days'),
    ]);
    setMessages(list.messages);setCustomers(c.customers);setDays(d.days);
  },[token]);
  useEffect(()=>{
    void status().catch(e=>setError(String(e)));
    void reload().catch(e=>setError(String(e)));
    const timer=setInterval(()=>{
      void status().catch(()=>{});
      void reload().catch(()=>{});
    },5000);
    return()=>clearInterval(timer);
  },[status,reload]);
  const pending=messages.filter(m=>isPending(m.status));
  const visible=messages.filter(m=>isPending(m.status)||(showArchive&&m.status==='archivado'));
  const selectedMessages=useMemo(()=>messages.filter(m=>selected.includes(m.id)&&isPending(m.status)),[selected,messages]);
  const selectionCustomer=selectedMessages.length&&selectedMessages.every(m=>m.customer_id===selectedMessages[0].customer_id)
    ?selectedMessages[0].customer_id:null;
  useEffect(()=>{setCustomerId(selectionCustomer);},[selectionCustomer]);
  const ready=selectedMessages.length>0&&selectionCustomer!==null&&dayId!==null&&selectedMessages.every(m=>{
    const v=edits[m.id];return Boolean(v?.description?.trim()&&v.quantity>=1);
  });
  async function perform(callback:()=>Promise<unknown>,success:string){
    setError('');setNotice('');setBusy(true);
    try{await callback();await reload();await status();setNotice(success);}
    catch(e){setError(e instanceof Error?e.message:'Error inesperado');}
    finally{setBusy(false);}
  }
  function toggle(message:InboxMessage){
    if(!isPending(message.status))return;
    setSelected(old=>old.includes(message.id)?old.filter(i=>i!==message.id):[...old,message.id]);
    setEdits(old=>({...old,[message.id]:old[message.id]??{
      message_id:message.id,description:message.body||'',quantity:1,notes:'',product_url:'',
    }}));
  }
  function edit(id:number,key:keyof Editable,value:string|number){
    setEdits(old=>({...old,[id]:{...old[id],[key]:value}}));
  }
  async function assign(message:InboxMessage){
    const id=assignments[message.id];
    if(!id)return setError('Selecciona un cliente');
    await perform(()=>getApi(token,'/whatsapp/messages/'+message.id+'/customer',{
      method:'PATCH',body:JSON.stringify({customer_id:id}),
    }),'Cliente vinculado al mensaje');
  }
  async function convert(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!customerId||!dayId||!ready)return;
    await perform(async()=>{
      const result=await getApi<{id:number}>(token,'/whatsapp/convert',{method:'POST',body:JSON.stringify({
        customer_id:customerId,shopping_day_id:dayId,items:selectedMessages.map(m=>({
          ...edits[m.id],
          notes:edits[m.id].notes||null,
          product_url:edits[m.id].product_url||null,
        })),
      })});
      setSelected([]);setEdits({});setDayId(null);
      await onConverted();
      setNotice('Pedido #'+result.id+' creado para revisión');
    },'Pedido registrado para revisión');
  }
  return <section className="wa-page">
    <div className="d-page-header"><div><span className="d-kicker">INTEGRACIÓN · FASE 3</span><h1>WhatsApp</h1>
      <p>Conecta el número por QR y organiza pedidos sin salir del sistema.</p></div>
      <button className="d-secondary wa-refresh" onClick={()=>{void status();void reload();}}><RefreshCw size={17}/> Actualizar</button>
    </div>
    {error&&<div className="d-alert error" role="alert"><span>{error}</span><button onClick={()=>setError('')}><X size={17}/></button></div>}
    {notice&&<div className="d-alert success" role="status"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={17}/></button></div>}
    <div className="wa-connection d-card">
      <div className="wa-connect-head"><span className="wa-connect-icon"><MessageCircle size={27}/></span><div><h2>Conexión del negocio</h2><p>WhatsApp Web · Modo recepción</p></div>
        <span className={'wa-conn-status wa-'+connection.status}>{labels[connection.status]}</span></div>
      {connection.message&&<p className="wa-warning"><ShieldAlert size={16}/>{connection.message}</p>}
      {connection.status==='qr'&&connection.qr_image&&<div className="wa-scan"><img src={connection.qr_image} alt="QR para vincular WhatsApp del negocio"/><div><h3>Vincula el teléfono</h3><p>En WhatsApp entra a <b>Dispositivos vinculados → Vincular dispositivo</b> y escanea el QR.</p><small>Este código es temporal; se actualiza automáticamente.</small></div></div>}
      {connection.status==='connected'&&<div className="wa-online"><CheckCircle2 size={19}/> Conexión activa. Los mensajes directos nuevos se guardan en la bandeja.</div>}
      <div className="wa-connect-actions">
        {!['connected','connecting','qr','reconnecting'].includes(connection.status)&&<button disabled={busy} className="d-primary" onClick={()=>void perform(()=>getApi(token,'/whatsapp/connect',{method:'POST'}),'Conexión iniciada: escanea el QR cuando aparezca.')}><QrCode size={18}/> Conectar WhatsApp</button>}
        {connection.status!=='disconnected'&&<button disabled={busy} className="d-secondary" onClick={()=>{
          if(window.confirm('Esto desvinculará el dispositivo y eliminará la sesión QR guardada en el servidor. ¿Continuar?'))
            void perform(()=>getApi(token,'/whatsapp/disconnect',{method:'POST'}),'WhatsApp desvinculado');
        }}><Unplug size={17}/> Desvincular</button>}
      </div>
    </div>
    <div className="wa-inbox-head"><div><h2>Bandeja de mensajes <span>{pending.length} pendientes</span></h2><p>Los mensajes no se convierten en pedidos hasta que un administrador los revise.</p></div>
      <label className="wa-toggle"><input type="checkbox" checked={showArchive} onChange={e=>setShowArchive(e.target.checked)}/> Mostrar archivados</label></div>
    <div className="wa-layout">
      <div className="wa-inbox">
        {!visible.length?<div className="d-card wa-empty"><Smartphone size={28}/><b>Sin mensajes pendientes</b><p>Cuando lleguen mensajes nuevos al número vinculado se mostrarán aquí.</p></div>:
          visible.map(m=><article className={'wa-message d-card'+(selected.includes(m.id)?' selected':'')} key={m.id}>
            <div className="wa-message-head">
              {isPending(m.status)&&<input type="checkbox" aria-label={'Seleccionar mensaje '+m.id} checked={selected.includes(m.id)} onChange={()=>toggle(m)}/>}
              <div className="wa-message-owner"><b>{m.customer_name||'Cliente sin identificar'}</b><small>{m.sender_phone||m.remote_jid||'Remitente desconocido'} · {readableDate(m.received_at)}</small></div>
              <span className="wa-badge">{m.status==='error_media'?'Foto no descargada':m.status==='archivado'?'Archivado':m.kind==='image'?'Imagen':'Texto'}</span>
            </div>
            {m.image_id&&<InboxImage token={token} id={m.image_id}/>}
            <p className="wa-message-body">{m.body||'Fotografía sin descripción'}</p>
            {m.status==='error_media'&&<p className="wa-warning">La imagen no se pudo conservar; solicita al cliente que la reenvíe si es necesaria.</p>}
            {!m.customer_id&&isPending(m.status)&&<div className="wa-assign">
              <select aria-label={'Asignar cliente a mensaje '+m.id} value={assignments[m.id]||''} onChange={e=>setAssignments(old=>({...old,[m.id]:Number(e.target.value)}))}>
                <option value="">Asignar a un cliente</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select><button disabled={busy||!assignments[m.id]} className="d-secondary" onClick={()=>void assign(m)}><Link2 size={15}/> Vincular</button>
            </div>}
            <div className="wa-message-foot">
              <small>Mensaje #{m.id}{m.order_id?' · Pedido #'+m.order_id:''}</small>
              {isPending(m.status)&&<button disabled={busy} onClick={()=>void perform(()=>getApi(token,'/whatsapp/messages/'+m.id+'/archive',{method:'PATCH'}),'Mensaje archivado')}><Archive size={15}/> Archivar</button>}
              {m.status==='archivado'&&<button disabled={busy} onClick={()=>void perform(()=>getApi(token,'/whatsapp/messages/'+m.id+'/restore',{method:'PATCH'}),'Mensaje restaurado')}>Restaurar</button>}
            </div>
          </article>)}
      </div>
      <aside className="d-card wa-convert">
        <div className="wa-convert-title"><ClipboardList size={22}/><div><h2>Crear pedido</h2><p>{selectedMessages.length} mensajes seleccionados</p></div></div>
        {selectedMessages.length===0?<div className="wa-convert-empty"><p>Selecciona los mensajes que pertenecen al mismo pedido y cliente.</p><small>Por ahora las descripciones y cantidades se revisan manualmente; la IA será opcional en la próxima fase.</small></div>:
          <form onSubmit={e=>void convert(e)} className="wa-convert-form">
            {!selectionCustomer&&<p className="wa-warning">Selecciona mensajes de un solo cliente identificado.</p>}
            <label>Cliente<input readOnly value={customers.find(c=>c.id===customerId)?.name||'Asignar cliente a los mensajes primero'}/></label>
            <label>Jornada<select required value={dayId||''} onChange={e=>setDayId(Number(e.target.value)||null)}>
              <option value="">Selecciona una jornada</option>{days.filter(d=>d.status==='programada').map(d=><option key={d.id} value={d.id}>{d.store==='costco'?'Costco':"Sam's"} · {d.purchase_date}</option>)}
            </select></label>
            {selectedMessages.map(m=><div className="wa-line" key={m.id}>
              <div className="wa-line-head"><b>Artículo del mensaje #{m.id}</b><button type="button" title="Quitar" onClick={()=>toggle(m)}><X size={16}/></button></div>
              <label>Descripción<textarea required minLength={2} maxLength={2000} value={edits[m.id]?.description||''} onChange={e=>edit(m.id,'description',e.target.value)} placeholder="Nombre del producto, presentación, etc."/></label>
              <label>Cantidad<input type="number" required min={1} max={999} value={edits[m.id]?.quantity??1} onChange={e=>edit(m.id,'quantity',Number(e.target.value))}/></label>
              <label>Notas<input maxLength={1200} value={edits[m.id]?.notes||''} onChange={e=>edit(m.id,'notes',e.target.value)} placeholder="Preferencias o alternativas"/></label>
              <label>Enlace opcional<input type="url" value={edits[m.id]?.product_url||''} onChange={e=>edit(m.id,'product_url',e.target.value)} placeholder="https://..."/></label>
            </div>)}
            <button className="d-primary" type="submit" disabled={!ready||busy}>Crear pedido por revisar</button>
            <p className="wa-disclaimer">El pedido queda en <b>pendiente de revisión</b>, nunca confirmado automáticamente.</p>
          </form>}
      </aside>
    </div>
  </section>;
}
