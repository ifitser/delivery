# Fase 4 — IA gratuita para interpretar pedidos de WhatsApp

## Objetivo

Extraer sugerencias de productos, cantidades, enlaces y observaciones desde mensajes nuevos de WhatsApp y capturas de artículos (incluidas capturas de Amazon). **No confirmar ni comprar automáticamente**: el administrador corrige los resultados antes de crear un pedido `pendiente_revision`.

## Funcionamiento

1. Admin → **WhatsApp**, selecciona de 1 a 10 mensajes **pendientes del mismo cliente**.
2. Si necesita interpretar fotografías, marca explícitamente **Permitir enviar fotografías a proveedores externos**.
3. Pulsa **Interpretar mensajes**. El sistema consulta proveedores gratuitos configurados; si uno falla o agota su cuota local intenta el siguiente.
4. El modelo propone un conjunto de líneas `{source_message_ids,description,quantity,notes,product_url,confidence}`. Puede extraer **varios productos del mismo mensaje**.
5. Edita, elimina o agrega líneas. Puedes cambiar entre interpretación sugerida y captura manual.
6. Selecciona Costco/Sam's y jornada. Pulsa **Crear pedido por revisar**.
7. Se crea en la BD un pedido `pendiente_revision` y **no** se confirma automáticamente. Las fotografías originales se conservan y se copian a los artículos relacionados.

## Enrutamiento y costos

| Proveedor | Modelo fijo | Tipo | Se activa |
|---|---|---|---|
| OpenRouter | `openrouter/free` | Texto e imágenes si hay modelo compatible | Al establecer `OPENROUTER_API_KEY` |
| Google Gemini | `gemini-2.5-flash-lite` | Texto e imágenes | Clave y `AI_ENABLE_GEMINI_FREE=true` |
| Groq | `openai/gpt-oss-20b` | Solo texto | Clave y `AI_ENABLE_GROQ_FREE=true` |
| Reglas locales | No utiliza IA | Texto simple | Siempre disponible |

### Configuración (.env)

```dotenv
OPENROUTER_API_KEY=
GEMINI_API_KEY=
AI_ENABLE_GEMINI_FREE=false
GROQ_API_KEY=
AI_ENABLE_GROQ_FREE=false
```

- **Configuración más segura para costo cero de inferencia:** solo `OPENROUTER_API_KEY`. El identificador `openrouter/free` solo enruta a modelos gratuitos según su documentación.
- Gemini y Groq deben habilitarse **manualmente** tras confirmar que la clave pertenece a una cuenta/proyecto dentro de su nivel gratuito. **Gemini puede cobrar si el proyecto tiene facturación de pago**; este programa no puede verificar la modalidad de facturación del proveedor ni impedir cargos externos.
- Nunca se cambia a un modelo de pago mediante un nombre dinámico o proporcionado por el cliente. Tampoco se utilizan servicios que extraigan tokens de sitios sin autorización.
- OpenRouter asigna automáticamente distintos modelos gratuitos cuando están disponibles; los límites y compatibilidad dependen del servicio y cambian.
- Cuotas adicionales **por instalación** para proteger el gasto: OpenRouter 35, Gemini 20, Groq 50 intentos por día UTC. Los intentos fallidos consumen cuota local.
- Máximo **5 solicitudes por minuto por IP**, 10 mensajes y 3 imágenes por análisis. Timeout de 18 segundos por proveedor. No existe garantía de servicio continuo: se cambia de proveedor si el anterior falla y finalmente a reglas locales.
- Las respuestas satisfactorias se guardan como sugerencias en SQLite usando un hash de la selección para evitar solicitudes duplicadas. Los registros de intentos solo incluyen proveedor, fecha, resultado y si contenían imágenes.
- El consumo de tokens no es completamente ilimitado, ni está garantizado que los proveedores mantengan sus cuotas gratuitas.

**Importante:** los servicios de IA gratuitos pueden utilizar los datos recibidos para mejorar sus productos. Obtén consentimiento antes de procesar información de clientes. La opción de enviar imágenes está desactivada por defecto. Se omiten números, direcciones evidentes y correos detectados en texto antes de enviarlo; **las fotografías no se anonimizan automáticamente**. Deben revisarse antes de enviarse a un tercero. No se envían al proveedor los nombres ni teléfonos de clientes almacenados en la base de datos.

## Respuestas e integridad

- El modelo responde con JSON; sus campos se validan con Zod. Las sugerencias no pueden referirse a IDs ajenos a los mensajes seleccionados.
- Si Gemini o OpenRouter no pueden leer una fotografía o ninguna IA responde, se generan propuestas muy básicas usando reglas de texto. Se indican con confianza baja.
- Si ninguna regla identifica productos, el administrador escribe la descripción manualmente.
- No se identifica marca, tamaño o precio basándose en suposiciones. El análisis nunca cambia el estado de un pedido ni envía WhatsApp.
- El administrador puede dividir un mensaje con varios productos; la conversión admite varias líneas relacionadas con el mismo mensaje y lo marca convertido una sola vez.
- Cuando no hay conexión a IA, los mensajes y fotos almacenados pueden seguir convirtiéndose manualmente como en la Fase 3.

## Pruebas

```bash
npm install
npm run db:migrate
npm run typecheck
npm run test
npm run build
```

Las pruebas de Fase 4 usan un proveedor simulado, **sin claves reales ni llamadas externas**, para verificar el fallback OpenRouter → Gemini, propuestas de múltiples artículos, visión, caché, reglas, permisos y conversiones con fuentes repetidas. **No demuestran que las APIs gratuitas funcionen en tu cuenta ni que las cuotas externas permanezcan disponibles**.

## Privacidad y despliegue

El repositorio todavía es **público**; mantenlo privado antes de utilizar datos reales. El proyecto necesita HTTPS, respaldo, almacenamiento persistente y un proceso Node continuo para el QR. Protege claves en `.env`. No subas capturas de clientes ni credenciales a GitHub. Define consentimiento, retención y purgado antes de uso comercial.

## Dependencias

Los PR siguen encadenados: Fase 0 (#1) → Fase 1 (#2) → Fase 2 (#3) → Fase 3 (#4) → Fase 4 (#5). Fusionarlos en ese orden y actualizar la base de cada PR a `main` antes de integrarlo.
