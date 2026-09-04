# Multi-stage production Dockerfile for hax-media-downloader
# Provides Node.js 22, Deno 2.x, FFmpeg, Python 3, and official yt-dlp binary

# --- Build Stage ---
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Production Runner Stage ---
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV TEMP_DIR=/app/temp
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV YTDLP_JS_RUNTIME=auto
ENV YTDLP_REMOTE_COMPONENTS=ejs:github

# Install production system dependencies: FFmpeg, Python 3, curl, ca-certificates, unzip
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    ca-certificates \
    unzip \
  && rm -rf /var/lib/apt/lists/*

# Install official Deno 2.x binary (recommended JS runtime for yt-dlp challenge solving)
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh && \
    deno --version

# Install official yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    /usr/local/bin/yt-dlp --version

# Prepare application directory and isolated temp storage directory with non-root node ownership
RUN mkdir -p /app/temp && \
    chown -R node:node /app

# Install production npm dependencies
COPY --chown=node:node package*.json ./
RUN npm ci --only=production

# Copy compiled build artifacts and necessary operational scripts
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/index.html ./index.html
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/cron ./cron

# Ensure scripts have execution permissions
RUN chmod +x /app/scripts/*.sh /app/cron/*.sh 2>/dev/null || true

# Switch to standard non-root user
USER node

EXPOSE 3000

# Health check using the healthcheck script
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD /app/scripts/healthcheck.sh || exit 1

CMD ["npm", "start"]
