ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS client-build
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
ARG VITE_MAPBOX_PUBLIC_TOKEN
ENV VITE_MAPBOX_PUBLIC_TOKEN=${VITE_MAPBOX_PUBLIC_TOKEN}
RUN npm run build

FROM ${NODE_IMAGE} AS server-build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /build/server
COPY server/package*.json ./
COPY server/prisma/ ./prisma/
RUN npm ci --omit=dev
COPY server/scripts/ ./scripts/
RUN node scripts/prepare-postgres.js

FROM ${NODE_IMAGE} AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3001 TMPDIR=/app/tmp
WORKDIR /app/server
RUN mkdir -p /app/tmp /app/server/sessions && chown node:node /app/tmp /app/server/sessions && chmod 700 /app/tmp /app/server/sessions
VOLUME ["/app/tmp"]
COPY --from=server-build --chown=node:node /build/server/node_modules ./node_modules
COPY --from=server-build --chown=node:node /build/server/generated ./generated
COPY --chown=node:node server/src ./src
COPY --chown=node:node server/scripts ./scripts
COPY --chown=node:node server/prisma ./prisma
COPY --chown=node:node server/package.json ./package.json
COPY --from=client-build --chown=node:node /build/client/dist /app/client/dist
USER node
EXPOSE 3001
CMD ["node", "src/index.js"]
