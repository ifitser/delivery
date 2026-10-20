# Delivery — Compras por encargo

Base técnica para coordinar jornadas y pedidos de **Costco** y **Sam's Club**. La plataforma incluirá tres roles (administrador, comprador y cliente), y en fases posteriores recibirá pedidos desde WhatsApp.

> **Estado actual: Fases 0, 1 y 2.** Login por rol; el administrador organiza clientes, jornadas, pedidos y consultas, y el comprador opera sus jornadas desde celular con listas, estados, fotos y precios. **Todavía no** hay integración con WhatsApp ni IA.

## Requisitos

- Node.js 22 o superior
- npm
- Máquina donde se pueda ejecutar Node.js y conservar datos en disco

## Ejecutar localmente

1. Clona el repositorio y entra a su carpeta.
2. Copia `.env.example` a `.env`.
3. Sustituye `JWT_SECRET` por un secreto aleatorio de al menos 32 caracteres. Por ejemplo, genera uno con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. Establece `SEED_ADMIN_PASSWORD` y `SEED_BUYER_PASSWORD` con contraseñas **distintas** de 12+ caracteres (opcionalmente `SEED_CUSTOMER_PASSWORD`).
5. Ejecuta:

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

6. Abre **http://localhost:5173**. Ingresa con `SEED_ADMIN_EMAIL` o `SEED_BUYER_EMAIL` y su contraseña.

La API corre en **http://localhost:3001**, con `GET /api/health` como comprobación. El frontend redirige `/api` al backend durante el desarrollo.

> Las credenciales del seed se usan solamente para crear usuarios inexistentes. Cambiar sus valores en .env **no** cambia contraseñas ya registradas. El seed está deshabilitado con NODE_ENV=production.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Inicia frontend y backend |
| `npm run typecheck` | Revisa los tipos |
| `npm run build` | Compila ambas aplicaciones |
| `npm run test` | Prueba inicio de sesión y permisos |
| `npm run db:migrate` | Aplica migraciones pendientes |
| `npm run db:seed` | Crea usuarios locales configurados |
| `npm run db:backup` | Copia consistente de SQLite y archivos subidos |

Los respaldos se guardan en `backups/`, que no se versiona. La base de datos se guarda en `data/` y los archivos futuros en `apps/api/storage/uploads/`. Protege ambos junto con las credenciales.

## Estructura

```text
apps/
  api/
    migrations/        # Esquema inicial SQLite
    src/               # Rutas de autenticación y scripts
    storage/uploads/   # Adjuntos futuros, fuera de Git
  web/
    src/               # Login y paneles según rol
docs/
  DECISIONES.md         # Alcance, seguridad y próximos pasos
.github/workflows/
  ci.yml                # Build y pruebas
```

## Fase 1 — Cómo empezar

Entra con la cuenta de administrador, registra un cliente, programa una jornada y crea un pedido. Abre el pedido para agregar sus artículos y fotos, luego confírmalo. Consulta [docs/FASE_1.md](docs/FASE_1.md) para las operaciones y sus límites.

## Fase 2 — Compra en tienda

Inicia sesión con el usuario **comprador** asignado a una jornada. Desde su panel puede iniciar la compra, consultar listas, registrar precios y gestionar alternativas. El administrador puede registrar la respuesta recibida de clientes desde **Consultas**. Guía completa: [docs/FASE_2.md](docs/FASE_2.md).

## Fase 3 — WhatsApp por QR

Entra como administrador a la nueva sección **WhatsApp** para vincular el número por QR. Los mensajes nuevos (texto/fotografías) se guardan en una bandeja, se identifican por número si es posible y pueden convertirse en pedidos **pendientes de revisión**. Lee [docs/FASE_3.md](docs/FASE_3.md) antes de vincular un número real. La integración es **no oficial** y puede desconectarse o sufrir restricciones.

## Fase 4 — IA gratuita opcional

En **Administrador → WhatsApp**, selecciona mensajes y pulsa **Interpretar mensajes**. Puedes enviar imágenes solo con consentimiento y permiso explícito. Edita las sugerencias y crea el pedido para revisión. Configura `OPENROUTER_API_KEY` para usar `openrouter/free`; Gemini y Groq están deshabilitados por defecto hasta verificar sus planes gratuitos. Consulta [docs/FASE_4.md](docs/FASE_4.md) para información de privacidad, costos y limitaciones.

## Próximo paso

Realizar pruebas reales de WhatsApp y de las APIs elegidas en un servidor de desarrollo seguro, antes de utilizar información de clientes.

**Seguridad:** este repositorio está público actualmente. Cámbialo a **privado** antes de usar datos o números telefónicos reales. No publiques `.env` ni la base de datos. El prototipo local no está listo para exposición pública a Internet.
