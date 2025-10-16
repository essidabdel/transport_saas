# syntax=docker/dockerfile:1

# ---- Base image ----
FROM node:20-alpine AS base
WORKDIR /app

# Install production dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Runtime image ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app

# Copy node_modules from base for lean final image
COPY --from=base /app/node_modules ./node_modules

# Copy application source
COPY src ./src

# Expose service port
EXPOSE 4000

# Optional container healthcheck (ECS can also rely on ALB health checks)
RUN apk add --no-cache curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -sf http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "src/index.js"]


