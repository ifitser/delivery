# Plan maestro de desarrollo

## Ecosistema de compras por encargo — Costco y Sam's Club

**Versión:** 1.0  
**Estado:** Propuesta de implementación  
**Objetivo:** MVP operativo con el menor costo y complejidad razonables  
**Repositorio:** [ifitser/delivery](https://github.com/ifitser/delivery)

---

## 1. Visión del proyecto

Crear una plataforma para organizar jornadas de compra en **Costco y Sam's Club**. Los clientes seguirán enviando sus encargos principalmente por **WhatsApp**, con fotografías, capturas de productos de Amazon, enlaces, cantidades y descripciones. El sistema conservará el material original, organizará los pedidos y permitirá que los compradores consulten alternativas mientras están en la tienda.

### Objetivos del MVP

1. Programar jornadas por tienda y fecha.
2. Recibir y registrar pedidos, tanto manualmente como desde WhatsApp.
3. Agrupar los artículos por cliente y jornada.
4. Ofrecer una lista de compra usable desde un celular.
5. Consultar dudas y sustituciones con el cliente y registrar su respuesta.
6. Registrar resultados y precios reales, con revisión humana.
7. Operar aunque WhatsApp o las IA estén temporalmente fuera de servicio.

### Principios

- **Primero funciona, después se automatiza.**
- Un solo sistema web adaptable a computadora y celular.
- Una sola base de datos y un backend modular; sin microservicios.
- Guardar siempre los mensajes, imágenes y enlaces originales.
- Ningún pedido interpretado por IA se confirma sin reglas de validación o revisión humana.
- El sistema nunca hará compras ni cargos automáticamente.
- No activar modelos de pago sin una decisión explícita.
- Mantener un camino manual para cualquier integración que falle.

---

## 2. Roles y paneles

### Panel del administrador

- Crear, editar, abrir y cerrar jornadas de compra.
- Configurar tienda, fecha, límite de recepción y comprador asignado.
- Registrar clientes y pedidos manualmente.
- Revisar pedidos recibidos por WhatsApp.
- Corregir interpretaciones y confirmar pedidos.
- Consultar artículos por cliente, jornada y estado.
- Supervisar consultas, compras y montos finales.
- Ver el estado de la conexión de WhatsApp.

### Panel del comprador

- Ver jornadas asignadas.
- Consultar una lista general de artículos y filtrar por cliente.
- Ver imágenes, descripciones, cantidades y preferencias.
- Cambiar estados de los artículos.
- Registrar precio y cantidad efectivamente comprada.
- Adjuntar foto y propuesta de alternativa.
- Ver respuestas y asuntos pendientes.
- Finalizar una jornada cuando todos los artículos estén resueltos.

### Panel del cliente

- Iniciar sesión opcionalmente en una etapa posterior.
- Consultar sus jornadas, productos y estados.
- Ver el historial y el importe registrado.
- Aceptar o rechazar alternativas desde su panel.

**Decisión de alcance:** WhatsApp será el canal principal para clientes en el MVP. El panel de cliente se desarrolla después de validar los flujos de administrador y comprador, pero se contempla desde el diseño de permisos y datos.

---

## 3. Flujo operativo

1. **Crear jornada:** el administrador configura una visita a Costco o Sam's, fecha y límite de pedidos.
2. **Recibir encargo:** el cliente envía imágenes, enlaces y texto por WhatsApp. También se pueden capturar pedidos manualmente.
3. **Formar borrador:** el sistema agrupa los mensajes relacionados y prepara un pedido borrador.
4. **Interpretar:** primero aplica reglas sencillas; si hace falta, prueba proveedores de IA gratuitos.
5. **Validar:** el administrador corrige nombre, cantidad, tienda y observaciones; después confirma el pedido.
6. **Comprar:** el comprador abre su lista móvil y registra el resultado de cada artículo.
7. **Consultar:** si falta un producto, propone una alternativa con foto, precio y pregunta; el cliente responde por WhatsApp.
8. **Resolver:** se registra la decisión del cliente y se continúa con la compra.
9. **Cerrar:** el comprador registra precios reales; el administrador revisa el resultado final y marca el pedido como listo o finalizado.

### Reglas de recepción por WhatsApp

- El cliente puede iniciar un pedido con **«Nuevo pedido»** e indicar Costco o Sam's.
- Puede adjuntar varias imágenes y enviar las descripciones después.
- **«Finalizar pedido»** cierra el lote y lo deja pendiente de revisión.
- Los mensajes inesperados quedan en una **bandeja de entrada**, sin convertirse automáticamente en pedidos confirmados.
- Si falta tienda, fecha, cantidad o referencia, el sistema pregunta o solicita revisión humana.
- Los mensajes y adjuntos duplicados se detectan por identificadores de WhatsApp.
- No se eliminan los originales después de crear artículos.

---

## 4. Arquitectura propuesta

| Capa | Tecnología inicial | Motivo |
| --- | --- | --- |
| Frontend | React + TypeScript + Tailwind CSS | Tres paneles responsivos en una aplicación |
| Backend | Node.js + TypeScript + Fastify | API sencilla y módulos separados |
| Base de datos | SQLite + migraciones | Bajo costo y mantenimiento simple |
| Archivos | Disco persistente con copias de seguridad | Guardar fotos y adjuntos al inicio |
| WhatsApp | Baileys (conexión por QR) | Integración experimental sin cobro por mensaje |
| IA | Adaptadores para proveedores con cuota gratuita | Interpretación asistida con fallback |
| Control de versiones | GitHub | Historial, incidencias y despliegues |
| Ejecución | Un servidor o equipo siempre encendido | Mantener conexión y datos disponibles |

> **Riesgo de WhatsApp:** Baileys utiliza una integración no oficial. La sesión puede desconectarse y puede haber restricciones o cambios de compatibilidad. La conexión se aislará detrás de una interfaz para poder migrar a la API oficial de Meta sin rehacer los pedidos. Evitar automatizaciones masivas o mensajes no solicitados.

> **Costo real:** «Gratis» se refiere a las licencias y cuotas gratuitas disponibles, no al equipo, electricidad, dominio, hospedaje, copias de seguridad ni eventuales cargos de un proveedor.

### Organización sugerida del repositorio

```text
compras-encargo/
├── apps/
│   ├── web/                   # React: administración, comprador y cliente
│   └── api/                   # Fastify: API HTTP
├── packages/
│   └── shared/                # Tipos, esquemas y validaciones compartidas
├── docs/
│   ├── decisiones/
│   ├── flujos/
│   └── api/
├── scripts/                   # Migraciones, respaldos y mantenimiento
├── .env.example
└── README.md
```

**Módulos del backend:** `auth`, `clientes`, `jornadas`, `pedidos`, `articulos`, `whatsapp`, `interpretacion`, `consultas`, `archivos`.

---

## 5. Datos principales

| Entidad | Campos clave |
| --- | --- |
| Usuario | id, nombre, rol, credenciales, estado |
| Cliente | id, nombre, teléfono normalizado, notas |
| Jornada | id, tienda, fecha, fecha límite, comprador, estado |
| Pedido | id, cliente, jornada, origen, estado, fecha |
| Artículo | id, pedido, descripción, cantidad solicitada, cantidad comprada, precio, estado |
| Adjunto | id, artículo o mensaje, tipo, ruta, metadatos |
| Mensaje | id externo, cliente, dirección, texto, fecha, adjuntos, estado de procesamiento |
| Consulta | id, artículo, pregunta, imagen opcional, alternativa, precio estimado, estado |
| Respuesta | id, consulta, origen, decisión, texto, fecha |
| Interpretación | id, mensaje/lote, proveedor, resultado JSON, confianza/validación, estado |

### Estados mínimos

**Jornada:** `programada` → `en_curso` → `finalizada` (también `cancelada`).  
**Pedido:** `borrador` → `pendiente_revision` → `confirmado` → `en_compra` → `finalizado` (también `cancelado`).  
**Artículo:** `pendiente`, `en_busqueda`, `en_consulta`, `comprado`, `no_disponible`.  
**Consulta:** `pendiente`, `aceptada`, `rechazada`, `sin_respuesta`.

**Regla:** registrar quién realizó cada cambio importante y cuándo ocurrió. No borrar el historial de alternativas ni respuestas.

---

## 6. Plan de desarrollo por fases

### Fase 0 — Preparación y cimientos

**Meta:** entorno funcional y base de datos lista.

- [ ] Crear repositorio privado y README.
- [ ] Inicializar frontend, backend y TypeScript.
- [ ] Preparar variables de entorno y configuraciones locales.
- [ ] Crear esquema de SQLite y migraciones.
- [ ] Implementar inicio de sesión y roles.
- [ ] Configurar almacenamiento local de imágenes.
- [ ] Cargar datos ficticios y crear respaldo de desarrollo.

**Entregable:** aplicación ejecutable con acceso por rol.  
**Criterio de aceptación:** un administrador y un comprador pueden iniciar sesión; sus permisos están separados.

### Fase 1 — Administración de jornadas y pedidos manuales

**Meta:** sistema útil sin depender todavía de WhatsApp ni IA.

- [ ] CRUD de clientes.
- [ ] Crear y editar jornadas de Costco y Sam's.
- [ ] Configurar fecha, límite y comprador.
- [ ] Capturar pedidos manualmente.
- [ ] Subir fotos y registrar enlaces de productos.
- [ ] Añadir artículos, cantidades y observaciones.
- [ ] Confirmar pedidos y asignarlos a jornadas.
- [ ] Listar y filtrar pedidos por fecha, tienda, cliente y estado.

**Entregable:** administrador capaz de preparar una jornada completa.  
**Criterio de aceptación:** registrar tres clientes, varios pedidos y adjuntos sin integraciones externas.

### Fase 2 — Panel móvil del comprador

**Meta:** realizar la compra usando el sistema.

- [ ] Lista de jornadas asignadas.
- [ ] Vista general por artículo y vista agrupada por cliente.
- [ ] Fotos ampliables y observaciones visibles.
- [ ] Cambio de estado individual.
- [ ] Registro de cantidad y precio reales.
- [ ] Filtro de pendientes y artículos en consulta.
- [ ] Resumen de productos comprados/no disponibles.

**Entregable:** lista de compra utilizable en tienda.  
**Criterio de aceptación:** completar una jornada de prueba desde un teléfono, con todos los resultados guardados.

### Fase 3 — WhatsApp por QR e inbox

**Meta:** recibir encargos sin perder información.

- [ ] Integrar adaptador de WhatsApp con Baileys.
- [ ] Mostrar QR y estado de conexión en el panel administrador.
- [ ] Guardar sesión vinculada de manera segura y persistente.
- [ ] Reconectar y mostrar avisos de desconexión.
- [ ] Recibir mensajes, imágenes, textos de acompañamiento y enlaces.
- [ ] Relacionar mensajes con clientes por teléfono.
- [ ] Conservar adjuntos originales y su trazabilidad.
- [ ] Crear bandeja de entrada revisable.
- [ ] Evitar duplicados tras reconexiones.
- [ ] Crear pedidos borrador a partir de mensajes seleccionados.
- [ ] Incorporar comandos simples «Nuevo pedido» y «Finalizar pedido».

**Entregable:** WhatsApp conectado con captura de mensajes y creación de borradores.  
**Criterio de aceptación:** un cliente envía dos imágenes y texto; ambos adjuntos quedan almacenados una sola vez y el administrador puede convertirlos en un pedido.

### Fase 4 — Interpretación de pedidos e IA gratuita

**Meta:** reducir captura manual sin crear dependencia de la IA.

- [ ] Definir formato JSON único de salida: artículos, cantidades, preferencias, enlaces y dudas.
- [ ] Añadir reglas de interpretación para textos sencillos.
- [ ] Agrupar los mensajes de un pedido antes de procesarlos.
- [ ] Crear adaptadores independientes para proveedores gratuitos de IA.
- [ ] Enrutar según capacidad: texto o visión.
- [ ] Configurar fallback por fallo/cuota agotada, con límites de intentos.
- [ ] Impedir uso de modelos de pago por defecto.
- [ ] Validar JSON y rechazar campos inventados o inciertos.
- [ ] Guardar proveedor, errores y resultados de cada intento.
- [ ] Crear pantalla para revisar/corregir la interpretación.
- [ ] Si todas las IA fallan, dejar el pedido pendiente de revisión.

**Entregable:** pedidos sugeridos automáticamente y editables.  
**Criterio de aceptación:** interpretar un pedido con texto e imágenes, corregirlo manualmente y confirmar sin pérdida de originales; simular fallo total de proveedores y comprobar que el sistema continúa.

**Nota:** los niveles gratuitos tienen límites variables y no equivalen a uso ilimitado. Las librerías de agregación no garantizan disponibilidad; probar su mantenimiento, licencia y compatibilidad antes de adoptarlas. Evitar rotación de cuentas o evasión de restricciones de proveedores.

### Fase 5 — Consultas y alternativas durante la compra

**Meta:** resolver dudas del comprador sin conversaciones desordenadas.

- [ ] Crear consulta vinculada a un artículo.
- [ ] Adjuntar foto de alternativa, descripción y precio estimado.
- [ ] Enviar consulta por WhatsApp desde el sistema.
- [ ] Correlacionar respuestas entrantes con una consulta abierta.
- [ ] Permitir aceptar, rechazar o pedir aclaración.
- [ ] Si la respuesta es ambigua, enviarla a revisión del comprador.
- [ ] Registrar fecha, remitente y resultado.
- [ ] Permitir resolver una consulta manualmente si WhatsApp falla.
- [ ] Mostrar consultas pendientes destacadas en el panel comprador.

**Entregable:** conversación contextual por artículo.  
**Criterio de aceptación:** el comprador propone una alternativa y una respuesta del cliente queda registrada en el artículo correcto, sin cambiarlo automáticamente a «comprado».

### Fase 6 — Panel del cliente

**Meta:** ofrecer consulta web sin obligar a abandonar WhatsApp.

- [ ] Crear acceso de cliente.
- [ ] Consultar únicamente sus propios pedidos.
- [ ] Ver productos, fotos, estados y precios finales.
- [ ] Consultar jornadas disponibles.
- [ ] Responder consultas desde el panel.
- [ ] Mostrar historial básico de pedidos.

**Entregable:** panel de autoservicio opcional.  
**Criterio de aceptación:** un cliente consulta sus pedidos, pero no puede acceder a los de otro.

### Fase 7 — Pruebas, seguridad y piloto real

**Meta:** operar con unos pocos clientes de forma controlada.

- [ ] Probar el flujo completo sin IA.
- [ ] Probar fallos y reconexión de WhatsApp.
- [ ] Probar adjuntos grandes y mensajes fuera de orden.
- [ ] Verificar duplicados y permisos entre clientes.
- [ ] Validar respaldos y recuperación de SQLite, imágenes y sesión.
- [ ] Registrar errores sin revelar datos sensibles.
- [ ] Revisar consentimiento, privacidad y conservación de mensajes.
- [ ] Hacer una jornada piloto con pocos clientes.
- [ ] Recopilar incidencias y resolver solo las críticas.
- [ ] Preparar instrucciones breves para administrador y comprador.

**Entregable:** versión 1.0 utilizable en una compra real.  
**Criterio de aceptación:** completar una jornada de principio a fin con trazabilidad de mensajes, artículos, decisiones y precios; restaurar una copia de seguridad de prueba.

---

## 7. Orden recomendado y dependencias

```text
Fase 0  Cimientos
   ↓
Fase 1  Jornadas + pedidos manuales
   ↓
Fase 2  Panel comprador
   ↓
Fase 3  WhatsApp + bandeja de entrada
   ↓
Fase 4  Interpretación por reglas + IA opcional
   ↓
Fase 5  Consultas y alternativas
   ↓
Fase 7  Piloto real y estabilización
   ↓
Fase 6  Panel del cliente (mejora posterior)
```

La **primera versión útil** se consigue al terminar las fases 0–2. La **primera versión integrada con WhatsApp** llega al completar la fase 3. La **versión piloto real** debe incluir consultas (fase 5), pero puede funcionar sin IA y sin portal de cliente.

---

## 8. Qué incluye y qué NO incluye el MVP

| Incluir desde el inicio | Posponer |
| --- | --- |
| Jornadas por tienda | Inventario o catálogo sincronizado con tiendas |
| Pedidos con fotos y enlaces | Extracción automática de precios de Amazon |
| WhatsApp como entrada | Aplicación Android/iOS nativa |
| Lista de compra móvil | GPS y seguimiento de entregas |
| Consultas y alternativas | Pagos en línea y facturación |
| Precios reales registrados | Comisiones y cálculos financieros avanzados |
| Revisión humana | Chat en tiempo real completo entre todos los roles |
| Respaldos y permisos | Automatizaciones complejas y analítica avanzada |

---

## 9. Reglas de confiabilidad y seguridad

1. **Idempotencia:** un mismo mensaje de WhatsApp no debe crear dos artículos por error.
2. **Trazabilidad:** cada artículo importado conserva referencia a los mensajes originales.
3. **Separación de roles:** clientes ven solo sus pedidos; compradores ven solo jornadas asignadas; administradores ven la operación completa.
4. **Sesión de WhatsApp:** credenciales de vinculación cifradas o protegidas fuera del repositorio; nunca subir claves, tokens ni archivos de sesión a GitHub.
5. **Datos mínimos para IA:** eliminar teléfono, nombre y otra información personal antes de enviar contenido a servicios externos siempre que sea posible; obtener consentimiento adecuado.
6. **IA no autoritativa:** no deducir precios, marcas o cantidades si no están claras; solicitar confirmación.
7. **Control de costos:** claves separadas por proveedor, límites de solicitudes y desactivación del tráfico de pago.
8. **Tolerancia a fallos:** si cae WhatsApp o la IA, el sistema permite registrar, consultar y resolver pedidos manualmente.
9. **Copias de seguridad:** respaldar base de datos y fotografías conjuntamente; comprobar la restauración periódicamente.
10. **Conectividad:** operaciones críticas deben mostrar si se guardaron realmente; evitar presentar cambios no sincronizados como completados.

---

## 10. Pruebas de aceptación de extremo a extremo

### Escenario A — Encargo normal

- [ ] Administrador crea jornada de Costco.
- [ ] Cliente envía por WhatsApp dos imágenes y cantidades.
- [ ] El sistema conserva los originales y crea borrador.
- [ ] Administrador confirma los artículos.
- [ ] Comprador los marca como comprados y registra precio.
- [ ] Administrador puede ver el resultado final.

### Escenario B — Producto agotado

- [ ] Comprador marca artículo «en consulta».
- [ ] Envía una alternativa con imagen y precio.
- [ ] Cliente responde que sí o que no.
- [ ] El sistema asocia la respuesta al artículo correcto.
- [ ] Comprador registra la decisión y continúa.

### Escenario C — Fallan las integraciones

- [ ] WhatsApp se desconecta y el panel lo muestra.
- [ ] Una foto no puede interpretarse con IA.
- [ ] Los mensajes conservados pueden revisarse manualmente.
- [ ] Ninguna llamada activa cobros inesperados.
- [ ] No se pierden pedidos ni aparecen duplicados.

---

## 11. Gestión del trabajo en GitHub

Utilizar **Issues** pequeños y **Pull Requests** para cada cambio. No crear un sistema de gestión de proyectos adicional al inicio.

### Etiquetas sugeridas

- `fase-0` a `fase-7`
- `frontend`, `backend`, `whatsapp`, `ia`, `datos`
- `bug`, `mejora`, `bloqueante`

### Definición de «terminado» para cada tarea

- [ ] Funciona en el entorno local.
- [ ] Tiene una validación o prueba adecuada para el cambio.
- [ ] Los errores comunes muestran un mensaje comprensible.
- [ ] No filtra credenciales ni datos de otros usuarios.
- [ ] La documentación mínima está actualizada.
- [ ] Los cambios están registrados en GitHub.

---

## 12. Primer sprint sugerido

**Objetivo:** dejar listo el esqueleto del sistema, sin WhatsApp ni IA todavía.

1. Crear repositorio y estructura del monorepositorio.
2. Crear backend Fastify con ruta de salud (`/health`).
3. Crear frontend React con navegación básica.
4. Implementar base de datos SQLite y migraciones.
5. Crear usuarios con roles de administrador y comprador.
6. Construir modelos de cliente, jornada, pedido y artículo.
7. Crear pantalla para listar jornadas y formulario para crear una.
8. Registrar un pedido manual con al menos una imagen.

**Demostración al finalizar:** desde el navegador se crea una jornada de Sam's, se registra un cliente y se añade un artículo con foto que persiste en la base de datos.

---

## 13. Decisiones pendientes antes del lanzamiento

Estas decisiones **no bloquean el primer sprint**:

- Número de WhatsApp a vincular y si puede usarse uno exclusivo para pruebas.
- Equipo o servidor que permanecerá encendido.
- Si habrá uno o varios compradores simultáneos.
- Política de entrega y cierre de pedidos.
- Tiempo de conservación de fotos y conversaciones.
- Política de consentimiento de clientes para el procesamiento externo por IA.

---

## 14. Indicadores básicos de éxito

- Porcentaje de pedidos que llegan con todos sus artículos correctos.
- Tiempo empleado por el administrador para confirmar cada pedido.
- Número de consultas sin resolver al cerrar la jornada.
- Número de mensajes duplicados o perdidos (**objetivo: cero**).
- Costo mensual de infraestructura y servicios externos.
- Porcentaje de pedidos que pueden gestionarse aun cuando la IA no está disponible.

**Resultado esperado:** un sistema ligero, usable y controlable, que organice compras por encargo en Costco y Sam's sin obligar a los clientes a cambiar sus hábitos de WhatsApp y sin depender de servicios de IA de pago.