# ====================================
# Backend Dockerfile
# Multi-stage build for production
# ====================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner

WORKDIR /app

# Security: run as non-root
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/logs && chown -R appuser:appgroup /app

USER appuser

EXPOSE 4000

CMD ["node", "dist/server.js"]
