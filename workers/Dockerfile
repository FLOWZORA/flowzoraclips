# ==============================================================================
# FLOWZORA Clips — Railway FFmpeg Worker Dockerfile
# ==============================================================================
FROM node:22-alpine

# Install FFmpeg, Python3, yt-dlp, Fontconfig, and Noto fonts (including full Devanagari ligatures)
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    yt-dlp \
    fontconfig \
    freetype \
    ttf-dejavu \
    font-noto \
    font-noto-extra \
    curl

# Refresh font cache
RUN fc-cache -f -v

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy worker application code
COPY ffmpeg-worker.mjs ./

# Set environment defaults
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "ffmpeg-worker.mjs"]
