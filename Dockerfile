# ---- Stage 1: Build React client ----
FROM node:20-alpine AS builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: Production server ----
FROM node:20-alpine AS production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

RUN apk add --no-cache ffmpeg ghostscript

COPY app.js ./
COPY src/ ./src/
COPY --from=builder /app/client/dist ./client/dist/

RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
  && mkdir -p uploads \
  && chown appuser:appgroup uploads

USER appuser

EXPOSE 3000
CMD ["node", "app.js"]
