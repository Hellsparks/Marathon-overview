#!/usr/bin/env bash
# Marathon 3D Printer Fleet Manager — Linux/macOS Installer
#
# One-line install:
#   curl -fsSL https://raw.githubusercontent.com/Hellsparks/Marathon-overview/main/install.sh | bash
#
# Or run locally:
#   chmod +x install.sh && ./install.sh

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────
CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'
MAGENTA='\033[0;35m'; GRAY='\033[0;90m'; BOLD='\033[1m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}>> $1${NC}"; }
ok()    { echo -e "   ${GREEN}OK: $1${NC}"; }
warn()  { echo -e "   ${YELLOW}WARN: $1${NC}"; }
fail()  { echo -e "   ${RED}FAIL: $1${NC}"; }

# ── Banner ──────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${MAGENTA}╔══════════════════════════════════════════╗${NC}"
echo -e "  ${MAGENTA}║       Marathon Installer for Linux        ║${NC}"
echo -e "  ${MAGENTA}║       3D Printer Fleet Manager            ║${NC}"
echo -e "  ${MAGENTA}╚══════════════════════════════════════════╝${NC}"
echo ""

INSTALL_DIR="$HOME/marathon"

# ── Detect package manager ──────────────────────────────────────────────────
PKG=""
if command -v apt-get &>/dev/null; then PKG="apt"
elif command -v dnf &>/dev/null;     then PKG="dnf"
elif command -v pacman &>/dev/null;   then PKG="pacman"
elif command -v brew &>/dev/null;     then PKG="brew"
fi

install_pkg() {
    local pkg="$1"
    step "Installing $pkg..."
    case "$PKG" in
        apt)    sudo apt-get install -y "$pkg" ;;
        dnf)    sudo dnf install -y "$pkg" ;;
        pacman) sudo pacman -S --noconfirm "$pkg" ;;
        brew)   brew install "$pkg" ;;
        *)      fail "No supported package manager found. Install $pkg manually."; return 1 ;;
    esac
}

# ── 1. Git ──────────────────────────────────────────────────────────────────
step "Checking Git..."
if command -v git &>/dev/null; then
    ok "$(git --version)"
else
    install_pkg git
    ok "Git installed"
fi

# ── 2. Node.js ─────────────────────────────────────────────────────────────
step "Checking Node.js..."
NEED_NODE=false

if command -v node &>/dev/null; then
    NODE_VER=$(node --version | sed 's/^v//')
    NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 22 ]; then
        ok "Node.js v$NODE_VER"
    else
        warn "Node.js v$NODE_VER found but v22+ required"
        NEED_NODE=true
    fi
else
    warn "Node.js not found"
    NEED_NODE=true
fi

if [ "$NEED_NODE" = true ]; then
    step "Installing Node.js 22..."
    if [ "$PKG" = "brew" ]; then
        brew install node@22
        ok "Node.js installed via Homebrew"
    elif [ "$PKG" = "apt" ] || [ "$PKG" = "dnf" ]; then
        # NodeSource setup
        if [ "$PKG" = "apt" ]; then
            curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
            sudo apt-get install -y nodejs
        else
            curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
            sudo dnf install -y nodejs
        fi
        ok "Node.js $(node --version) installed via NodeSource"
    elif [ "$PKG" = "pacman" ]; then
        sudo pacman -S --noconfirm nodejs npm
        ok "Node.js installed via pacman"
    else
        fail "Cannot auto-install Node.js. Install v22+ from https://nodejs.org"
        exit 1
    fi
fi

# ── 3. Python 3 ────────────────────────────────────────────────────────────
step "Checking Python 3..."
PYTHON_CMD=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        if "$cmd" --version 2>&1 | grep -q "Python 3"; then
            PYTHON_CMD="$cmd"
            break
        fi
    fi
done

if [ -n "$PYTHON_CMD" ]; then
    ok "$($PYTHON_CMD --version 2>&1)"
else
    case "$PKG" in
        apt)    install_pkg python3 && install_pkg python3-pip ;;
        dnf)    install_pkg python3 && install_pkg python3-pip ;;
        pacman) install_pkg python ;;
        brew)   install_pkg python ;;
    esac
    for cmd in python3 python; do
        if command -v "$cmd" &>/dev/null && "$cmd" --version 2>&1 | grep -q "Python 3"; then
            PYTHON_CMD="$cmd"
            break
        fi
    done
    if [ -n "$PYTHON_CMD" ]; then
        ok "Python installed: $($PYTHON_CMD --version 2>&1)"
    else
        warn "Python 3 not available — swatch STL generation will be disabled"
    fi
fi

# ── 4. CadQuery ────────────────────────────────────────────────────────────
if [ -n "$PYTHON_CMD" ]; then
    step "Checking CadQuery..."
    if "$PYTHON_CMD" -c "import cadquery" 2>/dev/null; then
        ok "CadQuery already installed"
    else
        step "Installing CadQuery (may take a minute)..."
        if "$PYTHON_CMD" -m pip install --quiet cadquery 2>/dev/null; then
            ok "CadQuery installed"
        else
            warn "CadQuery install failed — swatch STL generation will be unavailable"
        fi
    fi
fi

# ── 5. Liberation fonts (optional, for swatch text) ────────────────────────
if [ "$PKG" = "apt" ]; then
    if ! dpkg -l fonts-liberation &>/dev/null 2>&1; then
        step "Installing liberation fonts..."
        sudo apt-get install -y fonts-liberation >/dev/null 2>&1 && ok "Fonts installed" || warn "Font install skipped"
    fi
fi

# ── 6. Clone or update repo ────────────────────────────────────────────────
step "Setting up Marathon repository..."
REPO_URL="https://github.com/Hellsparks/Marathon-overview.git"

if [ -d "$INSTALL_DIR/.git" ]; then
    ok "Existing install found — pulling latest..."
    cd "$INSTALL_DIR"
    git pull --ff-only
    ok "Repository updated"
else
    echo -e "   ${GRAY}Cloning repository...${NC}"
    git clone "$REPO_URL" "$INSTALL_DIR"
    ok "Cloned to $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── 7. Install npm dependencies ────────────────────────────────────────────
step "Installing npm dependencies..."
npm install --silent 2>&1 | tail -1
ok "Root"
(cd backend && npm install --silent 2>&1 | tail -1)
ok "Backend"
(cd frontend && npm install --silent 2>&1 | tail -1)
ok "Frontend"

# ── 8. Build frontend ──────────────────────────────────────────────────────
step "Building frontend..."
(cd frontend && npm run build 2>&1 | tail -1)
ok "Frontend built"

# ── 9. Create systemd service ──────────────────────────────────────────────
step "Setting up systemd service..."

SERVICE_FILE="/etc/systemd/system/marathon.service"
if [ -w /etc/systemd/system ] || command -v sudo &>/dev/null; then
    SERVICE_CONTENT="[Unit]
Description=Marathon 3D Printer Fleet Manager
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) backend/src/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target"

    echo "$SERVICE_CONTENT" | sudo tee "$SERVICE_FILE" >/dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable marathon.service
    ok "Systemd service created and enabled"
else
    warn "Cannot create systemd service (no sudo). Start manually with: node backend/src/index.js"
fi

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}║         Marathon installed!                ║${NC}"
echo -e "  ${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Install location: ${BOLD}$INSTALL_DIR${NC}"
echo ""
echo -e "  To start Marathon:"
echo -e "    ${GRAY}sudo systemctl start marathon${NC}"
echo -e "    ${GRAY}# or manually: cd $INSTALL_DIR && ./marathon.sh${NC}"
echo ""
echo -e "  Then open ${CYAN}http://localhost:3000${NC} in your browser."
echo ""

# Ask to start now
read -rp "  Start Marathon now? (Y/n) " START_NOW
if [ "${START_NOW,,}" != "n" ]; then
    echo ""
    echo -e "  ${CYAN}Starting Marathon...${NC}"
    if [ -f "$SERVICE_FILE" ]; then
        sudo systemctl start marathon
        echo -e "  ${GREEN}Marathon is running. Open http://localhost:3000${NC}"
    else
        cd "$INSTALL_DIR"
        node backend/src/index.js
    fi
fi
