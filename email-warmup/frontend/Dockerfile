# ====================================
# Frontend Dockerfile
# Multi-stage build for Next.js
# ====================================

FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_NAME

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER appuser

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
