import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Clock3, MessageSquareText, RefreshCw, Send } from 'lucide-react';

type Consultation={id:number;item_id:number;question:string;alternative_description:string|null;estimated_price_cents:number|null;status:string;created_at:string;product_description:string;quantity:number;customer_name:string;store:string;purchase_date:string;latest_response:string|null;latest_decision:string|null;images:{id:number;original_name:string|null}[]};
async function api<T>(path:string,token:string,init:RequestInit={}):Promise<T>{
  const result=await fetch((import.meta.env.VITE_API_URL??'')+'/api/admin'+path,{...init,
    headers:{Authorization:'Bearer '+token,...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});
  const data=await result.json().catch(()=>({}));
  if(!result.ok)throw new Error((data as {error?:string}).error||'Error al guardar la respuesta');
  return data as T;
}
const store=(s:string)=>s==='costco'?'Costco':"Sam's Club";
function AlternativePhoto({id,name,token}:{id:number;name:string;token:string}){
  const [src,setSrc]=useState('');
  useEffect(()=>{
    let alive=true;
    api<{mime_type:string;base64:string}>('/images/'+id,token)
      .then(v=>{if(alive)setSrc('data:'+v.mime_type+';base64,'+v.base64);}).catch(()=>{});
    return()=>{alive=false;};
  },[id,token]);
  return src?<a href={src} target="_blank" rel="noreferrer" title={name}>
    <img src={src} alt={name} className="d-alternative-photo"/>
  </a>:<span className="d-alternative-placeholder">Cargando imagen…</span>;
}

export default function AdminConsultations({token}:{token:string}){
  const [items,setItems]=useState<Consultation[]>([]);
  const [current,setCurrent]=useState<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [loading,setLoading]=useState(true);
  const refresh=useCallback(async()=>{const {consultations}=await api<{consultations:Consultation[]}>('/consultations',token);setItems(consultations);},[token]);
  useEffect(()=>{let alive=true;refresh().catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[refresh]);
  async function reply(e:FormEvent<HTMLFormElement>,id:number){
    e.preventDefault();
    const body=new FormData(e.currentTarget);
    setBusy(true);setError('');setMessage('');
    try{
      await api('/consultations/'+id+'/respond',token,{method:'POST',body:JSON.stringify({decision:body.get('decision'),response:body.get('response')})});
      await refresh();setCurrent(null);setMessage('Respuesta registrada correctamente.');
    }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar');}
    finally{setBusy(false);}
  }
  const pending=items.filter(c=>c.status==='pendiente');
  const answered=items.filter(c=>c.status!=='pendiente');
  return <section className="d-consult-page">
    <div className="d-page-header"><div><span className="d-kicker">ALTERNATIVAS Y DUDAS</span><h1>Consultas de compra</h1><p>El comprador registra sus preguntas. Aquí puedes anotar la respuesta recibida del cliente.</p></div>
      <button className="d-secondary d-refresh" onClick={()=>void refresh().catch(e=>setError(String(e)))}><RefreshCw size={17}/> Actualizar</button></div>
    <div className="d-consult-warning"><MessageSquareText size={21}/><span><b>WhatsApp todavía no está integrado.</b> Confirma la decisión con el cliente por fuera y registra aquí exactamente su respuesta. Nunca se aprueba una alternativa automáticamente.</span></div>
    {error&&<div className="d-alert error" role="alert">{error}</div>}{message&&<div className="d-alert success" role="status">{message}</div>}
    {loading?<p>Cargando consultas…</p>:items.length===0?<div className="d-card d-empty"><MessageSquareText size={27}/><p>No hay consultas. Cuando el comprador proponga alternativas aparecerán aquí.</p></div>:<>
      <h2 className="d-consult-label"><Clock3 size={19}/> Pendientes <span>{pending.length}</span></h2>
      {pending.length===0&&<p className="d-consult-none">No quedan consultas pendientes.</p>}
      <div className="d-consult-grid">{pending.map(c=><article className="d-card d-consult-card" key={c.id}>
        <div className="d-consult-cardtop"><span>Consulta #{c.id}</span><span className="d-status">Por responder</span></div>
        <h3>{c.product_description}</h3><p className="d-consult-meta">{c.customer_name} · {store(c.store)} · {c.quantity} unidades</p>
        <div className="d-consult-question"><b>Pregunta del comprador</b><p>{c.question}</p>
        {c.alternative_description&&<p><b>Alternativa:</b> {c.alternative_description}</p>}
        {c.estimated_price_cents!==null&&<p><b>Precio aproximado:</b> {(c.estimated_price_cents/100).toLocaleString('es-MX',{style:'currency',currency:'MXN'})}</p>}
        {!!c.images?.length&&<div className="d-alternative-images">{c.images.map(photo=><AlternativePhoto key={photo.id} id={photo.id} name={photo.original_name||'Alternativa'} token={token}/>)}</div>}</div>
        {current===c.id?<form className="d-consult-form" onSubmit={e=>void reply(e,c.id)}>
          <label>Decisión del cliente<select name="decision" defaultValue="aceptar" required><option value="aceptar">Acepta alternativa</option><option value="rechazar">Rechaza alternativa</option><option value="pregunta">Solicita más información</option></select></label>
          <label>Respuesta que dio el cliente<textarea name="response" required minLength={2} maxLength={1200} placeholder="Transcribe la respuesta del cliente..."/></label>
          <div className="d-consult-controls"><button type="submit" className="d-primary" disabled={busy}><Send size={15}/> Guardar respuesta</button><button type="button" className="d-secondary" onClick={()=>setCurrent(null)}>Cancelar</button></div>
        </form>:<button className="d-primary" onClick={()=>setCurrent(c.id)}>Registrar respuesta</button>}
      </article>)}</div>
      {answered.length>0&&<><h2 className="d-consult-label"><CheckCircle2 size={19}/> Respondidas <span>{answered.length}</span></h2>
      <div className="d-consult-grid">{answered.map(c=><article key={c.id} className="d-card d-consult-card">
        <div className="d-consult-cardtop"><span>Consulta #{c.id}</span><span className="d-status">{c.status==='aceptada'?'Aceptada':'Rechazada'}</span></div>
        <h3>{c.product_description}</h3><p className="d-consult-meta">{c.customer_name} · {store(c.store)}</p><p><b>Consulta:</b> {c.question}</p><p className="d-consult-answer"><b>Última respuesta:</b> {c.latest_response||'Sin detalle'}</p>
      </article>)}</div></>}
    </>}
  </section>;
}
