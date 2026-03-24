#!/usr/bin/env bash
# Marathon 3D Printer Fleet Manager — Docker Installer
#
# One-line install:
#   curl -fsSL https://raw.githubusercontent.com/Hellsparks/Marathon-overview/main/install-docker.sh | bash

set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'
MAGENTA='\033[0;35m'; GRAY='\033[0;90m'; BOLD='\033[1m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}>> $1${NC}"; }
ok()    { echo -e "   ${GREEN}OK: $1${NC}"; }
warn()  { echo -e "   ${YELLOW}WARN: $1${NC}"; }
fail()  { echo -e "   ${RED}FAIL: $1${NC}"; exit 1; }

echo ""
echo -e "  ${MAGENTA}╔══════════════════════════════════════════╗${NC}"
echo -e "  ${MAGENTA}║    Marathon Docker Installer for Linux   ║${NC}"
echo -e "  ${MAGENTA}║       3D Printer Fleet Manager           ║${NC}"
echo -e "  ${MAGENTA}╚══════════════════════════════════════════╝${NC}"
echo ""

INSTALL_DIR="$HOME/marathon"

# ── 1. Docker ───────────────────────────────────────────────────────────────
step "Checking Docker..."
if ! command -v docker &>/dev/null; then
    step "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    ok "Docker installed"
fi

# Start daemon — try systemctl, fall back to service
start_docker() {
    if command -v systemctl &>/dev/null && systemctl is-system-running --quiet 2>/dev/null; then
        sudo systemctl enable docker 2>/dev/null || true
        sudo systemctl start docker 2>/dev/null || true
    elif command -v service &>/dev/null; then
        sudo service docker start 2>/dev/null || true
    fi
}

if ! sudo docker info &>/dev/null 2>&1; then
    step "Starting Docker daemon..."
    start_docker
    # Wait up to 30s for the socket to appear
    for i in $(seq 1 30); do
        sudo docker info &>/dev/null 2>&1 && break
        sleep 1
    done
    sudo docker info &>/dev/null 2>&1 || fail "Docker daemon did not start. Try: sudo systemctl start docker"
    ok "Docker daemon running"
else
    ok "$(docker --version)"
fi

# ── 2. Clone repo ───────────────────────────────────────────────────────────
step "Setting up Marathon..."
REPO_URL="https://github.com/Hellsparks/Marathon-overview.git"

if [ -d "$INSTALL_DIR/.git" ]; then
    ok "Existing install found — pulling latest..."
    git -C "$INSTALL_DIR" pull --ff-only
else
    # Remove leftover directory from a previous failed install
    [ -d "$INSTALL_DIR" ] && rm -rf "$INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
    ok "Cloned to $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── 3. Build and start ──────────────────────────────────────────────────────
step "Building and starting Marathon (this takes a few minutes on first run)..."
sudo docker compose up -d --build
ok "Marathon is running"

echo ""
echo -e "  ${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}║         Marathon is running!               ║${NC}"
echo -e "  ${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Install location: ${BOLD}$INSTALL_DIR${NC}"
echo -e "  Open ${CYAN}http://localhost${NC} in your browser"
echo ""
echo -e "  To stop:   ${GRAY}cd $INSTALL_DIR && sudo docker compose down${NC}"
echo -e "  To update: go to ${CYAN}Settings → Updates${NC} inside Marathon"
echo ""
