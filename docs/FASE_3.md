# Fase 3 — WhatsApp por QR y bandeja de pedidos

Esta fase integra **Baileys 6.7.x**, una biblioteca **no oficial** que se conecta como dispositivo vinculado de WhatsApp Web. No utiliza la API oficial de Meta. Puede dejar de funcionar por cambios en WhatsApp o provocar restricciones de cuenta; úsala con conocimiento del riesgo, sin automatizaciones masivas ni spam.

## Qué hace

- Un administrador puede entrar en **WhatsApp** y pulsar **Conectar WhatsApp**.
- El servidor muestra un código QR temporal en el panel, visible **solo a un administrador autenticado**.
- Escanea el QR desde **WhatsApp > Dispositivos vinculados > Vincular dispositivo**.
- La sesión se almacena en `data/whatsapp-auth`, fuera de GitHub. Un arranque posterior la reutiliza si sigue siendo válida.
- El conector recibe **mensajes directos nuevos** con texto y fotografías (JPG, PNG, WebP, hasta 4 MB).
- No se procesan grupos, canales, estados ni mensajes enviados por el propio número. Tampoco se importan automáticamente conversaciones antiguas.
- Cada mensaje se guarda con un identificador único para **evitar duplicados**. Si falla la descarga de una imagen, el mensaje se conserva marcado como **foto no descargada**.
- Cuando el número de WhatsApp coincide exactamente con el número normalizado de un cliente registrado, se asigna automáticamente. Cuando llega como identificador `@lid` o no coincide, se deja **sin identificar** hasta la vinculación manual por el administrador.
- El administrador puede seleccionar uno o más mensajes **del mismo cliente**, ajustar descripción, cantidad, notas y enlace, elegir una jornada programada y crear un pedido.
- El pedido queda como `pendiente_revision`; requiere revisión y confirmación humana antes de enviarse al comprador.
- Se pueden archivar o restaurar mensajes pendientes.
- Al **Desvincular** se elimina la sesión local de WhatsApp (no los pedidos ni los mensajes almacenados).

## Qué no hace todavía

- No interpreta capturas de Amazon mediante IA ni analiza automáticamente cantidades.
- No envía mensajes de respuesta a los clientes, ni avisa automáticamente sobre alternativas. Esto seguirá manual hasta implementar un módulo de comunicación saliente con controles.
- No crea pedidos por cualquier mensaje entrante ni adivina la tienda.
- No incluye el protocolo "nuevo pedido / finalizar pedido": la agrupación se hace desde la bandeja administrativa, ideal para empezar con pocos clientes.
- No recopila chats antiguos ni mensajes de grupos.
- La identificación automática de clientes funciona solamente cuando el número está registrado con el mismo prefijo de país. Recomendado: **+52XXXXXXXXXX** en México.
- No hay tolerancia a varias réplicas del servidor usando el mismo directorio de sesión.

## Instalación

1. **No uses datos reales mientras el repositorio siga público y el servidor no tenga seguridad de producción.** Cambia el repositorio a privado.
2. Elige una computadora/servidor con **Node.js 22+, conexión estable y almacenamiento persistente** (no hosting puramente serverless).
3. Sigue el README del proyecto para crear `.env`, configurar `JWT_SECRET` y usuarios.
4. Instala dependencias y migra SQLite:

   ```bash
   npm install
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

5. Abre `http://localhost:5173`, inicia sesión como **administrador**, entra en **WhatsApp** y pulsa **Conectar WhatsApp**.
6. Vincula con el teléfono del negocio. Verifica que el panel muestre **Conectado**.
7. Desde un teléfono diferente, envía texto o una foto al número conectado y revisa la bandeja.
8. Registra el teléfono del cliente, asigna si es necesario y crea el pedido borrador.
9. En **Pedidos**, revisa y confirma el pedido.

No uses el QR ni las credenciales fuera de una sesión administrativa protegida. **Nunca compartas `data/whatsapp-auth`**: contiene claves criptográficas de la cuenta.

## Datos y seguridad

| Ubicación | Contenido | Git |
|---|---|---|
| `data/delivery.sqlite` | Clientes, mensajes, artículos, relaciones | Ignorado |
| `data/whatsapp-auth` | Credenciales cifradas/llaves de sesión de WhatsApp | Ignorado; no compartir |
| `apps/api/storage/uploads/` | Fotografías originales y copias de pedidos | Ignorado |

- **Respaldo:** `npm run db:backup` respalda SQLite y fotografías, pero **no** las credenciales WhatsApp. Si se pierde la sesión, escanea el QR de nuevo.
- El backend original escucha en `127.0.0.1:3001`; para acceder desde fuera de la máquina configura HTTPS y un proxy inverso seguro. No expongas la API por HTTP público.
- Mantén la aplicación en **una única instancia de Node** para no duplicar conexiones a WhatsApp. La sesión QR requiere proceso persistente.
- Controla el acceso al disco y los permisos del directorio de autenticación; no guardes logs de mensajes, QR o tokens.
- Protege la información y utiliza los mensajes únicamente para gestionar pedidos con consentimiento de los clientes. Define retención y eliminación antes de operar comercialmente.

## Pruebas

```bash
npm run typecheck
npm run test
npm run build
```

Las pruebas verifican permisos, deduplicación, asociación de cliente, fotos, archivado y conversión. **No prueban escaneo real ni continuidad de WhatsApp frente a cambios del servicio externo**.

## Arquitectura

- `whatsapp.ts`: conexión al socket y reconexión; descarga segura de imágenes; no envía respuestas.
- `whatsapp-inbox.ts`: recepción idempotente y operaciones sobre base de datos.
- `whatsapp-routes.ts`: API autenticada exclusivamente para administradores.
- `WhatsAppInbox.tsx`: panel de enlace QR y conversión manual.
- `003_whatsapp_inbox.sql`: columnas nuevas para remitente y estado de mensajes.

**Orden de ramas:** #1 Fase 0 → #2 Fase 1 → #3 Fase 2 → PR de Fase 3. Las ramas anteriores no estaban fusionadas con `main` cuando se inició este trabajo.
