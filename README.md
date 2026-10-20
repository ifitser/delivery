# Delivery — Compras por encargo

Base técnica para coordinar jornadas y pedidos de **Costco** y **Sam's Club**. La plataforma incluirá tres roles (administrador, comprador y cliente), y en fases posteriores recibirá pedidos desde WhatsApp.

> **Estado actual: Fases 0 y 1.** Inicio de sesión por rol; el panel de administrador permite gestionar clientes, jornadas, pedidos manuales, artículos, imágenes y asignación de compradores. **Todavía no** hay integración con WhatsApp ni IA.

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

## Siguiente fase

**Fase 2:** panel móvil del comprador para consultar listas y actualizar artículos durante la compra. WhatsApp por QR e IA vienen después; ambos siguen siendo opcionales.

**Seguridad:** este repositorio está público actualmente. Cámbialo a **privado** antes de usar datos o números telefónicos reales. No publiques `.env` ni la base de datos. El prototipo local no está listo para exposición pública a Internet.
