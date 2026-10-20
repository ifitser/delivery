# Fase 1 — Operación manual (sin WhatsApp)

## Objetivo

Operar jornadas y pedidos sin depender de integraciones externas. Todo lo de esta fase se gestiona desde el panel **Administrador**.

## Guía de uso

1. Inicia sesión como administrador.
2. En **Clientes**, registra nombre, número telefónico (opcional) y observaciones. El teléfono no debe repetirse entre clientes.
3. En **Jornadas**, selecciona Costco o Sam's, fecha de compra y fecha límite para recibir pedidos; opcionalmente asigna un comprador activo.
4. En **Pedidos**, crea uno seleccionando cliente y jornada. El sistema lo registra como **borrador**.
5. Abre el pedido, agrega artículos con descripción, cantidad, notas, enlace y fotografía (JPG/PNG/WebP, máximo 4 MB). Se permiten varias fotografías por artículo.
6. Confirma el pedido cuando contenga al menos un artículo. Las listas de compra y el manejo de estados durante la visita pertenecen a la **Fase 2**.

## Restricciones y decisiones

- Las fechas límite son informativas durante la captura manual. El administrador puede recibir pedidos posteriores, siempre que la jornada continúe abierta.
- Los roles de comprador y cliente aún tienen paneles de marcador de posición: **no tienen acceso a datos administrativos**.
- Crea las cuentas iniciales de comprador mediante `npm run db:seed`, colocando valores `SEED_BUYER_*` en `.env`. La administración de cuentas se agrega más adelante.
- No hay creación pública de clientes ni subida de fotografías sin iniciar sesión como administrador.
- Todas las fotos se guardan en disco persistente en `apps/api/storage/uploads` fuera del repositorio; se acceden por una ruta autenticada.
- Las imágenes se validan por formato, tamaño y firma de archivo básica. Las validaciones completas de contenido y desinfección de imágenes se deben fortalecer antes de un despliegue expuesto a Internet.
- Se admiten hasta **200 registros** por tabla en los listados de esta primera etapa. Antes de usarlo con más clientes, añadir paginación.
- No permite borrar clientes/jornadas para no perder trazabilidad. Los productos sí pueden eliminarse (junto a sus imágenes).
- Todavía no hay precios totales, pagos, entregas, notificaciones ni comunicación con WhatsApp.

## Pruebas

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run dev
```

El test de la Fase 1 comprueba autorización, datos inválidos, duplicación de teléfonos, asignaciones, alta de pedidos y artículos, confirmación y carga/lectura de fotos.

## Protección de datos y entorno

El repositorio actualmente es público: **no publiques clientes reales hasta convertirlo a privado y desplegar con TLS, respaldos y controles de acceso apropiados**. El backend arranca localmente en `127.0.0.1`. Para acceso desde otro dispositivo se requerirá configurar un proxy inverso seguro y conexión cifrada.

## Dependencia con la Fase 0

La rama `feat/fase-1-gestion` se creó a partir de `feat/fase-0-cimientos` porque el PR #1 todavía no estaba fusionado con `main`. Fusionar primero PR #1 y después esta fase, verificando el destino de la PR antes de hacerlo.
