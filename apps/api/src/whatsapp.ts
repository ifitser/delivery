import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Db } from './db.js';
import { ingest } from './whatsapp-inbox.js';

type Status='disconnected'|'connecting'|'qr'|'connected'|'reconnecting'|'error';
export type WhatsAppState={status:Status;qr_image:string|null;message:string|null};
type Socket=Awaited<ReturnType<typeof import('@whiskeysockets/baileys').default>>;

export class WhatsAppService {
  private socket:Socket|null=null;
  private status:Status='disconnected';
  private qr_image:string|null=null;
  private message:string|null=null;
  private wanted=false;
  private starting:Promise<void>|null=null;
  private retry:ReturnType<typeof setTimeout>|null=null;
  private attempt=0;
  private epoch=0;
  private readonly authDir=resolve(process.cwd(),'../../data/whatsapp-auth');

  constructor(private db:Db){}
  getState():WhatsAppState{return {status:this.status,qr_image:this.qr_image,message:this.message};}
  hasSavedSession(){return existsSync(resolve(this.authDir,'creds.json'));}

  async resume(){
    if(this.hasSavedSession()&&process.env.WHATSAPP_RESUME!=='false'){
      try{await this.start();}catch(e){this.message='No se pudo recuperar la sesión; conecta manualmente';this.status='error';}
    }
  }
  async start(){
    if(this.starting)return this.starting;
    if(this.status==='connected'||this.status==='qr'||this.status==='connecting')return;
    this.wanted=true;
    if(this.retry){clearTimeout(this.retry);this.retry=null;}
    const generation=++this.epoch;
    this.status='connecting';this.message=null;this.qr_image=null;
    this.starting=this.connect(generation).catch(e=>{
      if(generation===this.epoch&&this.wanted){
        this.status='error';this.message='No fue posible iniciar WhatsApp';
        this.scheduleRetry();
      }
      throw e;
    }).finally(()=>{this.starting=null;});
    return this.starting;
  }
  private scheduleRetry(){
    if(!this.wanted||this.retry)return;
    if(this.attempt>=6){this.status='error';this.message='Demasiados reintentos; vuelve a conectar manualmente';return;}
    this.status='reconnecting';this.attempt++;
    const delay=Math.min(30_000,2000*Math.pow(2,this.attempt-1));
    this.retry=setTimeout(()=>{
      this.retry=null;
      this.status='disconnected';
      void this.start().catch(()=>{});
    },delay);
  }
  private async connect(generation:number){
    mkdirSync(this.authDir,{recursive:true,mode:0o700});
    const baileys=await import('@whiskeysockets/baileys');
    const qr=await import('qrcode');
    const pino=(await import('pino')).default;
    const {state,saveCreds}=await baileys.useMultiFileAuthState(this.authDir);
    if(generation!==this.epoch||!this.wanted)return;
    const socket=baileys.default({auth:state,logger:pino({level:'silent'}),markOnlineOnConnect:false,printQRInTerminal:false});
    this.socket=socket;
    socket.ev.on('creds.update',()=>{void saveCreds().catch(()=>{this.message='Error guardando sesión de WhatsApp';});});
    socket.ev.on('connection.update',update=>{
      if(generation!==this.epoch||!this.wanted)return;
      if(update.qr){
        void qr.toDataURL(update.qr,{margin:2,width:300}).then(data=>{
          if(generation!==this.epoch||!this.wanted)return;
          this.qr_image=data;this.status='qr';this.message=null;
        }).catch(()=>{this.message='No se pudo generar el QR';});
      }
      if(update.connection==='open'){
        this.status='connected';this.qr_image=null;this.message=null;this.attempt=0;
      }
      if(update.connection==='close'){
        this.socket=null;this.qr_image=null;
        const code=(update.lastDisconnect?.error as {output?:{statusCode?:number}}|undefined)?.output?.statusCode;
        if(code===baileys.DisconnectReason.loggedOut){
          this.status='disconnected';this.message='Sesión cerrada en WhatsApp; vincula nuevamente';
          this.wanted=false;
          rmSync(this.authDir,{recursive:true,force:true});
        }else{
          this.status='disconnected';
          this.scheduleRetry();
        }
      }
    });
    socket.ev.on('messages.upsert',event=>{
      if(generation!==this.epoch||!this.wanted||event.type!=='notify')return;
      for(const m of event.messages){
        void (async()=>{
          const jid=m.key.remoteJid||'',id=m.key.id||'';
          if(!m.message||!jid||!id||m.key.fromMe)return;
          // Sin grupos, canales, difusiones, estados ni mensajes propios.
          if(!(/@(s\.whatsapp\.net|lid)$/.test(jid)))return;
          const externalId=jid+'/'+id;
          if(this.db.prepare('SELECT id FROM inbound_messages WHERE external_id=?').get(externalId))return;
          const msg=m.message.ephemeralMessage?.message??m.message;
          const image=msg.imageMessage;
          const body=(msg.conversation??msg.extendedTextMessage?.text??image?.caption??'').trim().slice(0,5000)||null;
          if(!body&&!image)return;
          let imageData:{bytes:Buffer;mimeType:string}|undefined;
          if(image){
            const type=(image.mimetype||'image/jpeg').split(';')[0].toLowerCase();
            if(['image/png','image/jpeg','image/webp'].includes(type)){
              try{
                const chunks:Buffer[]=[];
                let bytes=0;
                const stream=await baileys.downloadContentFromMessage(image,'image');
                for await(const chunk of stream){
                  const b=Buffer.from(chunk);bytes+=b.length;
                  if(bytes>4*1024*1024)throw new Error('Imagen demasiado grande');
                  chunks.push(b);
                }
                imageData={bytes:Buffer.concat(chunks),mimeType:type};
              }catch{ /* guardar el mensaje aunque no se logre descargar la fotografía */ }
            }
          }
          if(generation!==this.epoch||!this.wanted)return;
          ingest(this.db,{externalId,remoteJid:jid,body,kind:image?'image':'text',
            receivedAt:new Date().toISOString(),image:imageData});
        })().catch(()=>{this.message='Error al guardar un mensaje entrante';});
      }
    });
  }
  async disconnect(){
    this.wanted=false;
    ++this.epoch;
    if(this.retry){clearTimeout(this.retry);this.retry=null;}
    const old=this.socket;this.socket=null;this.qr_image=null;this.status='disconnected';this.message=null;
    this.attempt=0;
    if(old){
      try{await old.logout();}catch{try{old.ws.close();}catch{}}
    }
    rmSync(this.authDir,{recursive:true,force:true});
  }
  async shutdown(){
    this.wanted=false;++this.epoch;
    if(this.retry)clearTimeout(this.retry);
    const socket=this.socket;this.socket=null;
    if(socket)try{socket.ws.close();}catch{}
    this.status='disconnected';this.qr_image=null;
  }
}
