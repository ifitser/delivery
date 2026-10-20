# Delivery — preparación para pruebas integrales

Las fases 0 a 4 ya están fusionadas en la rama `main`. Esta guía ejecuta la aplicación web y la API con una única instancia Node, sin exponerla en Internet.

## Requisitos

- Docker Engine + Docker Compose recientes.
- Puerto 8080 libre en tu computadora.
- El repositorio clonado. Una máquina con espacio para SQLite, fotos y sesión de WhatsApp.
- **No usar datos ni teléfonos comerciales reales durante esta etapa.** El repositorio está público.

## Primer arranque

1. Copia `.env.example` como `.env`, usa un JWT secreto aleatorio:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Copia el resultado a `JWT_SECRET` en `.env` y crea contraseñas únicas de 12+ caracteres para `SEED_ADMIN_PASSWORD` y `SEED_BUYER_PASSWORD`.
2. Mantén las claves de IA vacías y no uses el WhatsApp principal.
3. Desde la raíz del repositorio:

   ```bash
   docker compose -f compose.local.yml build
   docker compose -f compose.local.yml run --rm --no-deps -e NODE_ENV=development app node dist/scripts/seed.js
   docker compose -f compose.local.yml up -d
   npm run smoke
   ```

4. Abre **http://localhost:8080** y accede con el correo y contraseña definidos en `.env`.

El script de seed aplica migraciones al abrir SQLite. No actualiza contraseñas de usuarios existentes. No guardes el contenido del archivo `.env` en GitHub.

## Flujo de aceptación manual

- [ ] Admin inicia sesión con cuenta de prueba.
- [ ] Registra un cliente ficticio y una jornada futura en Costco.
- [ ] Asigna el comprador de prueba a esa jornada.
- [ ] Crea un pedido con dos artículos y una fotografía de prueba.
- [ ] Confirma el pedido.
- [ ] Comprador inicia sesión; ve solo la jornada asignada.
- [ ] Inicia jornada, registra un artículo comprado y su precio.
- [ ] Abre consulta para el otro artículo.
- [ ] Administrador registra respuesta ficticia a la consulta.
- [ ] Comprador registra resultado del artículo y termina la jornada.
- [ ] Admin comprueba estados y precios finales.
- [ ] Realiza respaldo y verifica que se genere en el volumen de respaldos.

## WhatsApp y AI: pruebas controladas

El Compose local establece `WHATSAPP_RESUME=false`: evita conectarse automáticamente con una sesión anterior. **El botón Conectar todavía permitiría vincular un teléfono**, por lo que NO lo pulses con el WhatsApp comercial. Usa un número de prueba voluntario; Baileys es no oficial y puede provocar restricciones. Después de la prueba, usa **Desvincular**.

Para verificar IA primero prueba sin API keys (modo reglas locales). Luego, únicamente si cuentas con una clave de un proveedor gratuito y aceptas sus condiciones, establece `OPENROUTER_API_KEY` en tu archivo `.env`, reinicia la aplicación y analiza mensajes ficticios. El modelo de OpenRouter es `openrouter/free`; hay cuotas y disponibilidad variables. No cargues fotos ni datos de clientes reales a proveedores externos.

## Operación

```bash
# Ver estado y logs (no compartas logs sin revisar posibles datos personales)
docker compose -f compose.local.yml ps
docker compose -f compose.local.yml logs --tail=80 app

# Generar respaldo manual de base de datos y fotos
docker compose -f compose.local.yml exec app node dist/scripts/backup.js

# Detener sin borrar datos
docker compose -f compose.local.yml down
```

Los volúmenes `delivery_data`, `delivery_uploads` y `delivery_backups` **persisten** después de `down`. No uses `down -v` salvo que quieras destruir permanentemente la información local. Los respaldos en el mismo equipo NO sustituyen copias externas.

## Límites antes de producción

Este Compose publica el sitio **solo en 127.0.0.1**, sin TLS, e incorpora deliberadamente un único servidor. No lo abras a toda la red. Antes de ofrecerlo a clientes necesitamos dominio, HTTPS, controles de acceso más robustos (cookies HttpOnly/revocación, retención, backups externos), repositorio privado y pruebas reales del QR. No hay servidor de producción configurado ni conexión a WhatsApp o IA establecida desde GitHub Actions.
