FROM node:24.22.3-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends socat tzdata \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/web
RUN chown node:node /app/web
USER node
COPY --chown=node:node web/package.json web/package-lock.json web/.npmrc ./
RUN npm ci
COPY --chown=node:node web/ ./
RUN node -e "new (require('better-sqlite3'))(':memory:').close(); require('sharp')" \
    && npm run build
ENV NODE_ENV=production
EXPOSE 8080
CMD ["sh", "-c", "socat TCP-LISTEN:8080,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:3000 & exec node --import tsx scripts/start-acceptance-server.ts"]
