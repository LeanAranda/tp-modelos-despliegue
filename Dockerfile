# Imagen del turnero para el modelo "contenedores".
#
# Decisiones deliberadas, para explicar en el informe:
#   - Construcción en dos etapas: la imagen final no lleva las herramientas de compilación.
#   - Usuario sin privilegios: un contenedor que corre como root es un hallazgo de seguridad.
#   - Versión de la imagen base fijada: "latest" hace que la construcción no sea reproducible.
#   - dumb-init como PID 1: sin esto, la señal SIGTERM no llega al proceso de Node
#     y el contenedor tarda diez segundos en morir.

FROM node:22.14-alpine AS dependencias
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22.14-alpine AS final
RUN apk add --no-cache dumb-init=1.2.5-r3 || apk add --no-cache dumb-init
ENV NODE_ENV=production
WORKDIR /app

COPY --from=dependencias /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY schema ./schema

# El usuario "node" ya viene en la imagen oficial. No hace falta crear uno.
USER node

EXPOSE 3000
ENV PORT=3000 HOST=0.0.0.0 SERVICE_MODEL=contenedores

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/adapters/http/servidor.js"]
