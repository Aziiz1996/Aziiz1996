FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm test && npm run test:accounts

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3001 LEADER_BIND_HOST=0.0.0.0 LEADER_DATA_DIR=/var/data/leader
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/src ./src
RUN mkdir -p /var/data/leader /app/.madar && chown -R node:node /var/data/leader /app/.madar && chmod 700 /app/.madar
USER node
EXPOSE 3001
CMD ["node", "--experimental-strip-types", "server/index.mjs"]
