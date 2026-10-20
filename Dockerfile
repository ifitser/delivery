# Entorno local de pruebas, no despliegue público sin proxy TLS y seguridad de producción.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install --no-audit --no-fund
COPY apps/ ./apps/
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production DELIVERY_SERVE_WEB=true API_HOST=0.0.0.0 API_PORT=3001
WORKDIR /app
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/migrations ./apps/api/migrations
COPY --from=builder /app/apps/web/dist ./apps/web/dist
RUN mkdir -p /app/data /app/backups /app/apps/api/storage/uploads \
 && chown -R node:node /app/data /app/backups /app/apps/api/storage
USER node
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
