# Decisiones técnicas — Fase 0

- **Una aplicación web y una API:** React/Vite y Fastify en un único repositorio npm workspaces.
- **SQLite con migraciones SQL versionadas:** costo bajo, fácil copia de seguridad y evolución a PostgreSQL si fuese necesario.
- **Roles en el servidor:** el backend comprueba JWT y rol, no depende de ocultar botones.
- **Usuarios iniciales:** contraseñas elegidas por quien instala, almacenadas con bcrypt; no hay cuentas públicas predeterminadas.
- **WhatsApp:** módulo futuro, idealmente por QR usando Baileys con evaluación de riesgo porque es una integración no oficial.
- **IA gratuita:** módulo futuro y opcional, con reglas primero, modelos de texto/visión compatibles, límites estrictos y revisión manual.
- **Archivos:** disco local persistente; los datos del cliente y los tokens no se versionan.
- **Despliegue:** se necesita proceso Node activo y persistencia para SQLite y adjuntos. Vercel por sí solo no es adecuado para la sesión QR persistente.
- **Autenticación inicial:** token de acceso con caducidad de ocho horas en sessionStorage para el prototipo; antes de producción evaluar cookies HttpOnly, TLS, rotación/revocación y MFA para administradores.
- **Privacidad:** el repositorio está público; recomendamos hacerlo privado ANTES de guardar datos reales. Nunca incluir credenciales, fotos ni números reales en GitHub.
