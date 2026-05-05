#!/bin/bash
# deploy.sh — sets up Xvfb, x11vnc and launches the Docker service
# Run as root on the LXC: bash deploy.sh

set -e

DISPLAY_NUM=99
DISPLAY=":${DISPLAY_NUM}"
RESOLUTION="1280x900x24"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${CYAN}→ $1${NC}"; }
success() { echo -e "${GREEN}✔ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $1${NC}"; }
error()   { echo -e "${RED}✘ $1${NC}"; exit 1; }

echo -e "${CYAN}"
echo "╔════════════════════════════════════════╗"
echo "║     llm-web-wrapper — deploy.sh        ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

# ─── 1. Dependencies ─────────────────────────────────────────────────────────
info "Installing dependencies..."
apt-get update -qq
apt-get install -y -qq \
  xvfb \
  x11vnc \
  chromium \
  docker.io \
  docker-compose-plugin \
  curl
success "Dependencies installed"

# ─── 2. Xvfb systemd service ─────────────────────────────────────────────────
info "Setting up Xvfb systemd service..."
cat > /etc/systemd/system/xvfb.service << EOF
[Unit]
Description=Virtual Display (Xvfb)
After=network.target

[Service]
ExecStart=/usr/bin/Xvfb ${DISPLAY} -screen 0 ${RESOLUTION}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable xvfb
systemctl restart xvfb
success "Xvfb running on display ${DISPLAY}"

# ─── 3. x11vnc systemd service ───────────────────────────────────────────────
info "Setting up x11vnc systemd service..."

# Ask for VNC password
echo ""
read -p "Set a VNC password? (leave blank for no password): " VNC_PASS

if [ -n "$VNC_PASS" ]; then
  mkdir -p /root/.vnc
  x11vnc -storepasswd "$VNC_PASS" /root/.vnc/passwd
  VNC_AUTH="-rfbauth /root/.vnc/passwd"
else
  warn "No VNC password set — anyone on the network can connect"
  VNC_AUTH="-nopw"
fi

cat > /etc/systemd/system/x11vnc.service << EOF
[Unit]
Description=VNC Server (x11vnc)
After=xvfb.service
Requires=xvfb.service

[Service]
ExecStart=/usr/bin/x11vnc -display ${DISPLAY} ${VNC_AUTH} -listen 0.0.0.0 -xkb -forever
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable x11vnc
systemctl restart x11vnc
success "x11vnc running on port 5900"

# ─── 4. Profile directories ───────────────────────────────────────────────────
info "Creating profile directories..."
mkdir -p "${APP_DIR}/profiles/chatgpt"
mkdir -p "${APP_DIR}/profiles/claude"
mkdir -p "${APP_DIR}/profiles/gemini"
success "Profile directories ready"

# ─── 5. .env ─────────────────────────────────────────────────────────────────
if [ ! -f "${APP_DIR}/.env" ]; then
  info "Creating .env..."
  cat > "${APP_DIR}/.env" << EOF
PORT=3000
HEADLESS=false
EOF
  success ".env created"
else
  warn ".env already exists — skipping"
fi

# ─── 6. Clear Singleton locks ────────────────────────────────────────────────
info "Clearing any stale Singleton locks..."
rm -f "${APP_DIR}"/profiles/*/Singleton*
success "Locks cleared"

# ─── 7. Build and start Docker ───────────────────────────────────────────────
info "Building and starting Docker service..."
cd "${APP_DIR}"
docker compose down 2>/dev/null || true
docker compose build --no-cache
docker compose up -d
success "Docker service started"

# ─── 8. Summary ──────────────────────────────────────────────────────────────
IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗"
echo -e "║           Deployment complete!         ║"
echo -e "╠════════════════════════════════════════╣"
echo -e "║  API   → http://${IP}:3000      "
echo -e "║  VNC   → ${IP}:5900             "
echo -e "║                                        ║"
echo -e "║  First time? Connect via VNC and       ║"
echo -e "║  log in to each bot in Chromium:       ║"
echo -e "║                                        ║"
echo -e "║  DISPLAY=:99 chromium --no-sandbox &   ║"
echo -e "║                                        ║"
echo -e "║  Then copy profiles:                   ║"
echo -e "║  cp -r ~/.config/chromium/Default      ║"
echo -e "║         ./profiles/chatgpt             ║"
echo -e "╚════════════════════════════════════════╝${NC}"
echo ""
info "Logs: docker compose logs -f"
info "Stop: docker compose down"
info "Restart: docker compose restart"
