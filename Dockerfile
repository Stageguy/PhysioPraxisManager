# PhysioPraxisManager – Praxisdienst (Statusseite), läuft hinter einem eigenen Tailscale-Knoten
FROM node:24-alpine

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3300 \
    TZ=Europe/Berlin

RUN apk add --no-cache tzdata

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY config ./config

RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node

HEALTHCHECK --interval=2m --timeout=10s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:3300/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "src/cli/serve.ts"]
