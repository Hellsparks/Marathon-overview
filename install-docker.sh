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
echo -e "  ${MAGENTA}║    Marathon Docker Installer for Linux    ║${NC}"
echo -e "  ${MAGENTA}║       3D Printer Fleet Manager            ║${NC}"
echo -e "  ${MAGENTA}╚══════════════════════════════════════════╝${NC}"
echo ""

INSTALL_DIR="$HOME/marathon"

# ── 1. Docker ───────────────────────────────────────────────────────────────
step "Checking Docker..."
if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
    ok "$(docker --version)"
    ok "$(docker compose version)"
else
    step "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo usermod -aG docker "$USER"
    ok "Docker installed and started"
    warn "You may need to log out and back in for group permissions, or run: newgrp docker"
fi

# Ensure daemon is running
if ! docker info &>/dev/null 2>&1; then
    step "Starting Docker daemon..."
    sudo systemctl start docker
    ok "Docker daemon started"
fi

# ── 2. Clone repo ───────────────────────────────────────────────────────────
step "Setting up Marathon..."
REPO_URL="https://github.com/Hellsparks/Marathon-overview.git"

if [ -d "$INSTALL_DIR/.git" ]; then
    ok "Existing install found — pulling latest..."
    git -C "$INSTALL_DIR" pull --ff-only
else
    git clone "$REPO_URL" "$INSTALL_DIR"
    ok "Cloned to $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── 3. Build and start ──────────────────────────────────────────────────────
step "Building and starting Marathon (this takes a few minutes)..."
docker compose up -d --build
ok "Marathon is running"

echo ""
echo -e "  ${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}║         Marathon is running!               ║${NC}"
echo -e "  ${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Install location: ${BOLD}$INSTALL_DIR${NC}"
echo -e "  Open ${CYAN}http://localhost${NC} in your browser"
echo ""
echo -e "  To stop:   ${GRAY}cd $INSTALL_DIR && docker compose down${NC}"
echo -e "  To update: go to ${CYAN}Settings → Updates${NC} inside Marathon"
echo ""
