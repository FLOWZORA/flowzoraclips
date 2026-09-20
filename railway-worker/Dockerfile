FROM node:22-slim

# Install Python, pip, ffmpeg, and system deps for yt-dlp
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp WITH the [default] extra.
# This is load-bearing: the plain `yt-dlp` PyPI package does NOT bundle
# yt-dlp-ejs, the JS challenge solver YouTube has required since 2025.11.12.
# Without it every YouTube download fails the n-signature challenge — i.e.
# exactly the bot-detection this worker exists to defeat.
RUN pip3 install --break-system-packages -U "yt-dlp[default]"

# Verify installs. The ejs import check fails the BUILD rather than letting a
# broken image deploy and fail silently at request time.
RUN yt-dlp --version \
    && python3 -c "import yt_dlp_ejs; print('yt-dlp-ejs OK')" \
    && node --version \
    && ffmpeg -version | head -1

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./

# Railway sets PORT automatically
ENV PORT=3001
EXPOSE 3001

CMD ["node", "server.js"]
