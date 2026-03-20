#Requires -Version 5.1
<#
.SYNOPSIS
    Marathon 3D Printer Fleet Manager — Windows Installer
.DESCRIPTION
    One-line install:  irm https://raw.githubusercontent.com/Hellsparks/Marathon-overview/main/install.ps1 | iex
    Or run locally:    .\install.ps1

    Installs Node.js, Python, CadQuery, clones/updates the repo, builds the frontend,
    and creates a startup shortcut. Offers two install locations:
      1) Current directory (portable / dev use)
      2) C:\Github\Marathon (permanent install)
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Colors ──────────────────────────────────────────────────────────────────
function Write-Step  { param([string]$msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "   OK: $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "   WARN: $msg" -ForegroundColor Yellow }
function Write-Fail  { param([string]$msg) Write-Host "   FAIL: $msg" -ForegroundColor Red }

# ── Banner ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "  ║       Marathon Installer for Windows      ║" -ForegroundColor Magenta
Write-Host "  ║       3D Printer Fleet Manager            ║" -ForegroundColor Magenta
Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# ── Choose install location ─────────────────────────────────────────────────
Write-Host "  Where would you like to install Marathon?" -ForegroundColor White
Write-Host ""
Write-Host "  [1] Current directory:  $PWD" -ForegroundColor Yellow
Write-Host "  [2] C:\Github\Marathon" -ForegroundColor Yellow
Write-Host ""

do {
    $choice = Read-Host "  Enter 1 or 2"
} while ($choice -ne '1' -and $choice -ne '2')

if ($choice -eq '1') {
    $InstallDir = Join-Path $PWD 'Marathon'
} else {
    $InstallDir = 'C:\Github\Marathon'
}

Write-Host ""
Write-Host "  Installing to: $InstallDir" -ForegroundColor Green
Write-Host ""

# ── Helper: check if a command exists ───────────────────────────────────────
function Test-Command { param([string]$cmd) return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# ── Helper: refresh PATH in current session ─────────────────────────────────
function Update-Path {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path    = "$machinePath;$userPath"
}

# ── 1. Node.js ──────────────────────────────────────────────────────────────
Write-Step "Checking Node.js..."

if (Test-Command 'node') {
    $nodeVer = (node --version) -replace '^v', ''
    $nodeMajor = [int]($nodeVer.Split('.')[0])
    if ($nodeMajor -ge 22) {
        Write-Ok "Node.js v$nodeVer found"
    } else {
        Write-Warn "Node.js v$nodeVer found but v22+ required"
        $installNode = $true
    }
} else {
    Write-Warn "Node.js not found"
    $installNode = $true
}

if ($installNode) {
    Write-Step "Installing Node.js via winget..."
    if (Test-Command 'winget') {
        winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
        Update-Path
        if (Test-Command 'node') {
            Write-Ok "Node.js $(node --version) installed"
        } else {
            Write-Fail "Node.js install succeeded but 'node' not in PATH. Please restart your terminal and re-run this script."
            exit 1
        }
    } else {
        Write-Fail "winget not available. Please install Node.js 22+ manually from https://nodejs.org"
        exit 1
    }
}

# ── 2. Python ───────────────────────────────────────────────────────────────
Write-Step "Checking Python 3..."

$pythonCmd = $null
foreach ($cmd in @('python', 'python3', 'py')) {
    if (Test-Command $cmd) {
        try {
            $pyVer = & $cmd --version 2>&1
            if ($pyVer -match 'Python 3') {
                $pythonCmd = $cmd
                break
            }
        } catch {}
    }
}

if ($pythonCmd) {
    Write-Ok "$($pythonCmd) — $(& $pythonCmd --version 2>&1)"
} else {
    Write-Step "Installing Python via winget..."
    if (Test-Command 'winget') {
        winget install --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements --silent
        Update-Path
        foreach ($cmd in @('python', 'python3', 'py')) {
            if (Test-Command $cmd) {
                try {
                    $pyVer = & $cmd --version 2>&1
                    if ($pyVer -match 'Python 3') { $pythonCmd = $cmd; break }
                } catch {}
            }
        }
        if ($pythonCmd) {
            Write-Ok "Python installed: $(& $pythonCmd --version 2>&1)"
        } else {
            Write-Warn "Python installed but not in PATH. Swatch generation will be unavailable. Restart terminal to fix."
        }
    } else {
        Write-Warn "winget not available. Skipping Python install — swatch generation will be unavailable."
    }
}

# ── 3. CadQuery (for swatch STL generation) ────────────────────────────────
if ($pythonCmd) {
    Write-Step "Checking CadQuery..."
    $hasCQ = $false
    try {
        & $pythonCmd -c "import cadquery" 2>&1 | Out-Null
        $hasCQ = $true
    } catch {}

    if ($hasCQ) {
        Write-Ok "CadQuery already installed"
    } else {
        Write-Step "Installing CadQuery (this may take a minute)..."
        try {
            & $pythonCmd -m pip install --quiet cadquery 2>&1 | Out-Null
            Write-Ok "CadQuery installed"
        } catch {
            Write-Warn "CadQuery install failed — swatch STL generation will be unavailable"
        }
    }
}

# ── 4. Git ──────────────────────────────────────────────────────────────────
Write-Step "Checking Git..."
if (Test-Command 'git') {
    Write-Ok "Git $(git --version)"
} else {
    Write-Step "Installing Git via winget..."
    if (Test-Command 'winget') {
        winget install --id Git.Git --accept-source-agreements --accept-package-agreements --silent
        Update-Path
        if (Test-Command 'git') {
            Write-Ok "Git installed"
        } else {
            Write-Fail "Git installed but not in PATH. Restart your terminal and re-run."
            exit 1
        }
    } else {
        Write-Fail "Git not found and winget not available. Install Git from https://git-scm.com"
        exit 1
    }
}

# ── 5. Clone or update Marathon ─────────────────────────────────────────────
Write-Step "Setting up Marathon repository..."

$repoUrl = 'https://github.com/Hellsparks/Marathon-overview.git'

if (Test-Path (Join-Path $InstallDir '.git')) {
    Write-Ok "Existing install found — pulling latest..."
    Push-Location $InstallDir
    git pull --ff-only 2>&1 | Out-Null
    Pop-Location
    Write-Ok "Repository updated"
} else {
    # Ensure parent directory exists
    $parentDir = Split-Path $InstallDir -Parent
    if (-not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }
    Write-Host "   Cloning repository (this may take a moment)..." -ForegroundColor Gray
    git clone $repoUrl $InstallDir 2>&1 | Out-Null
    Write-Ok "Repository cloned to $InstallDir"
}

# ── 6. Install npm dependencies ─────────────────────────────────────────────
Write-Step "Installing npm dependencies..."
Push-Location $InstallDir

npm install --silent 2>&1 | Out-Null
Write-Ok "Root dependencies"

Push-Location backend
npm install --silent 2>&1 | Out-Null
Pop-Location
Write-Ok "Backend dependencies"

Push-Location frontend
npm install --silent 2>&1 | Out-Null
Pop-Location
Write-Ok "Frontend dependencies"

# ── 7. Build frontend ──────────────────────────────────────────────────────
Write-Step "Building frontend..."
Push-Location frontend
npm run build 2>&1 | Out-Null
Pop-Location
Write-Ok "Frontend built"

Pop-Location  # Back from $InstallDir

# ── 8. Create start script ─────────────────────────────────────────────────
Write-Step "Creating start script..."

$startScript = Join-Path $InstallDir 'start-marathon.bat'
@"
@echo off
title Marathon - 3D Printer Fleet Manager
cd /d "$InstallDir"
echo.
echo   Starting Marathon on http://localhost:3000
echo   Press Ctrl+C to stop.
echo.
node backend\src\index.js
pause
"@ | Set-Content -Path $startScript -Encoding ASCII

Write-Ok "Created $startScript"

# ── 9. Create desktop shortcut ──────────────────────────────────────────────
Write-Step "Creating desktop shortcut..."

try {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $shortcutPath = Join-Path $desktop 'Marathon.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $startScript
    $shortcut.WorkingDirectory = $InstallDir
    $shortcut.Description = 'Marathon - 3D Printer Fleet Manager'
    $shortcut.Save()
    Write-Ok "Desktop shortcut created"
} catch {
    Write-Warn "Could not create desktop shortcut: $_"
}

# ── Done ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║         Marathon installed!                ║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Install location: $InstallDir" -ForegroundColor White
Write-Host ""
Write-Host "  To start Marathon:" -ForegroundColor White
Write-Host "    Double-click the 'Marathon' shortcut on your desktop" -ForegroundColor Gray
Write-Host "    Or run:  $startScript" -ForegroundColor Gray
Write-Host ""
Write-Host "  Then open http://localhost:3000 in your browser." -ForegroundColor Cyan
Write-Host ""

# Ask if user wants to start now
$startNow = Read-Host "  Start Marathon now? (Y/n)"
if ($startNow -ne 'n' -and $startNow -ne 'N') {
    Write-Host ""
    Write-Host "  Starting Marathon..." -ForegroundColor Cyan
    Start-Process "http://localhost:3000"
    Push-Location $InstallDir
    node backend\src\index.js
    Pop-Location
}
