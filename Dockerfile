# Multi-stage production Dockerfile for hax-media-downloader
FROM node:22-alpine AS builder

WORKDIR /app

# Install build essentials
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV TEMP_DIR=/app/temp
ENV YTDLP_PATH=/usr/local/bin/yt-dlp

# Install runtime dependencies: ffmpeg, python3, curl for yt-dlp
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    curl \
    ca-certificates

# Install latest official yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Create non-root user and group
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create temp storage directory with ownership
RUN mkdir -p /app/temp && chown -R appuser:appgroup /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled build artifacts
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/index.html ./index.html
COPY --from=builder --chown=appuser:appgroup /app/scripts ./scripts
COPY --from=builder --chown=appuser:appgroup /app/cron ./cron

# Switch to non-root execution
USER appuser

EXPOSE 3000

# Health check against /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["npm", "start"]
