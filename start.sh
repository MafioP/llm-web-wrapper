#!/bin/bash
# start.sh — starts the llm-web-wrapper service
# Run as root on the LXC: bash start.sh

set -e

DISPLAY_NUM=99
DISPLAY=":${DISPLAY_NUM}"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${CYAN}→ $1${NC}"; }
success() { echo -e "${GREEN}✔ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $1${NC}"; }
error()   { echo -e "${RED}✘ $1${NC}"; exit 1; }

echo -e "${CYAN}"
echo "╔════════════════════════════════════════╗"
echo "║     llm-web-wrapper — start.sh         ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

# ─── 1. Check Xvfb ───────────────────────────────────────────────────────────
if systemctl is-active --quiet xvfb; then
  success "Xvfb already running"
else
  info "Starting Xvfb..."
  systemctl start xvfb
  sleep 1
  systemctl is-active --quiet xvfb && success "Xvfb started" || error "Failed to start Xvfb — run deploy.sh first"
fi

# ─── 2. Check x11vnc ─────────────────────────────────────────────────────────
if systemctl is-active --quiet x11vnc; then
  success "x11vnc already running"
else
  info "Starting x11vnc..."
  systemctl start x11vnc
  sleep 1
  systemctl is-active --quiet x11vnc && success "x11vnc started" || warn "x11vnc failed to start — VNC won't be available"
fi

# ─── 3. Clear Singleton locks ────────────────────────────────────────────────
info "Clearing stale Singleton locks..."
rm -f "${APP_DIR}"/profiles/*/Singleton*
success "Locks cleared"

# ─── 4. Start Docker service ─────────────────────────────────────────────────
cd "${APP_DIR}"

if [ "$(docker compose ps -q)" ]; then
  info "Container already running — restarting..."
  docker compose restart
else
  info "Starting Docker service..."
  docker compose up -d
fi

# ─── 5. Wait for API to be ready ─────────────────────────────────────────────
info "Waiting for API to be ready..."
for i in $(seq 1 15); do
  if curl -sf http://localhost:${PORT:-3000}/health > /dev/null 2>&1; then
    success "API is up"
    break
  fi
  if [ $i -eq 15 ]; then
    error "API did not start in time — check logs: docker compose logs -f"
  fi
  sleep 2
done

# ─── 6. Summary ──────────────────────────────────────────────────────────────
IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗"
echo -e "║         Service is running! 🚀         ║"
echo -e "╠════════════════════════════════════════╣"
echo -e "║  API  → http://${IP}:${PORT:-3000}      "
echo -e "║  VNC  → ${IP}:5900                "
echo -e "╚════════════════════════════════════════╝${NC}"
echo ""
info "Logs:    docker compose logs -f"
info "Stop:    docker compose down"
info "Restart: bash start.sh"
