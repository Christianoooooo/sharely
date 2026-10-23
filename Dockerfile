# ---- Stage 1: Build React client ----
FROM node:24-alpine AS builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: Production server ----
FROM node:24-alpine AS production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev
# The npm bundled with the base image lags behind and ships vulnerable dependencies;
# it stays in the image for `npm run migrate:*`.
RUN npm install -g npm@12 && npm cache clean --force

# Picks up Alpine security fixes released after the base image was built.
RUN apk upgrade --no-cache && apk add --no-cache ffmpeg ghostscript

COPY app.js ./
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY DOCUMENTATION.md ./
COPY docs/*.md ./docs/
COPY --from=builder /app/client/dist ./client/dist/

RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
  && mkdir -p uploads control thumbjobs \
  && chown appuser:appgroup uploads control thumbjobs

USER appuser

EXPOSE 3000
CMD ["node", "app.js"]
