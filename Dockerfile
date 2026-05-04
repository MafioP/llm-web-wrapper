FROM node:22-slim

# Install Chromium dependencies
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  libnspr4 \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpango-1.0-0 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxext6 \
  libxfixes3 \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Tell Puppeteer to use the system Chromium instead of downloading its own

EXPOSE 3000

CMD ["node", "src/server.js"]
