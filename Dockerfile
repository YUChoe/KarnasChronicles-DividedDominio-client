# Multi-stage build for WebSocket Gateway

# Stage 1: Build server
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy server source
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY tsconfig.server.json ./
COPY tsconfig.json ./

# Build server
RUN npm run build:server

# Stage 2: Production image
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./

# Remove "type": "module" from package.json for CommonJS server
RUN sed -i '/"type": "module"/d' package.json

RUN npm ci --only=production && npm cache clean --force

# Copy built server
COPY --from=builder /app/dist/server ./dist/server

# Create logs directory
RUN mkdir -p logs

# Expose WebSocket port
EXPOSE 3000

# Start server
CMD ["node", "dist/server/server/start.js"]
