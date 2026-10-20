# Fase 2 — Comprador en tienda

El comprador utiliza una aplicación web adaptable al celular (es el mismo sitio Delivery, con su propio rol). No es una aplicación nativa.

## Flujo mínimo

1. Administrador: registra cliente, jornada y pedido con artículos.
2. Administrador: asigna un usuario con rol `buyer` a la jornada y **confirma los pedidos**.
3. Comprador: inicia sesión con su propia cuenta; solamente ve **sus** jornadas.
4. Comprador: entra a una jornada, revisa la lista general o agrupada por cliente y toca **Iniciar jornada**.
5. Por artículo: **Buscando**, **Comprado** (cantidad y precio unitario real) o **No disponible**.
6. Si no está seguro, selecciona **Consultar** y registra pregunta, alternativa, precio estimado y fotografía opcional.
7. La consulta aparece en **Administrador > Consultas**. Como WhatsApp no está integrado aún, el administrador pregunta al cliente fuera del sistema y transcribe su aprobación, rechazo o nueva pregunta.
8. El comprador ve esa respuesta en el artículo y decide si compra o marca como no disponible.
9. El comprador cierra la jornada cuando todos sus artículos están resueltos y no quedan consultas pendientes; los pedidos pasan a `finalizado`.

## Detalles

- El precio `price_cents` se interpreta como **precio unitario real, en centavos de MXN**; total por artículo = precio unitario × cantidad comprada.
- Se admite compra parcial: la cantidad comprada puede ser menor a la solicitada, pero no mayor. Registra por separado la situación de faltantes en observaciones si es necesario; el manejo detallado de compras parciales queda para iteraciones futuras.
- Las fotografías de alternativas se asocian a la consulta; también quedan visibles en el detalle administrativo del artículo.
- Las fotografías son privadas: solamente el administrador o el comprador de esa jornada pueden recuperarlas a través de su ruta autenticada.
- El comprador **no puede visualizar ni modificar las jornadas de otros compradores**.
- Los borradores y pedidos sin confirmar no se muestran al comprador.
- Las jornadas deben comenzar con pedidos confirmados; el inicio cambia esos pedidos a `en_compra`.
- Después del inicio se bloquean cambios administrativos sobre productos y asignaciones, para evitar inconsistencias.
- Una consulta pendiente impide marcar como comprado ese artículo y también impide cerrar la jornada.
- La API deja los cambios en la base de datos y en las fotos locales persistentes. Necesitamos respaldos y servidor activo para uso real.

## Fuera de alcance

- No se envían preguntas automáticamente por WhatsApp.
- El cliente todavía no tiene un panel para responder directamente.
- No hay pagos, inventario, GPS, reparto ni captura de ticket.
- No hay sincronización sin conexión; el celular debe tener Internet o conectividad con el servidor.

## Pruebas y despliegue

```bash
npm install
npm run db:migrate
npm run test
npm run typecheck
npm run build
npm run dev
```

El test de Fase 2 recorre los permisos de dos compradores, el inicio de jornada, consulta, respuesta del administrador, adjuntos, precios, resolución y cierre.

> **Importante:** el repositorio continúa público y las claves de la aplicación no deben publicarse. Antes de utilizar datos reales, convertir el repositorio a privado, asegurar la aplicación con HTTPS, almacenamiento persistente, respaldos y autenticación de producción.

## Dependencias de ramas

El PR de esta fase se basa en `feat/fase-1-gestion` porque las fases 0 y 1 aún no están fusionadas a `main`. Integrar primero PR #1, luego PR #2 y finalmente PR #3 (ajustando la base a `main`).
