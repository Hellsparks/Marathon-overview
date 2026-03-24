#!/usr/bin/env node
/**
 * Swatch service launcher.
 * Usage: node swatch-service/start.js <docker|local>
 *
 *   docker  — pulls & runs ghcr.io/hellsparks/marathon-overview-swatch:latest
 *   local   — uv run --python 3.12 --with cadquery server.py
 *             (first run downloads cadquery ~5 min; subsequent starts are instant)
 */

const { spawn, execSync } = require('child_process');
const net  = require('net');
const path = require('path');

const MODE   = process.argv[2];
const PORT   = parseInt(process.env.PORT || '7321', 10);
const IMAGE  = 'ghcr.io/hellsparks/marathon-overview-swatch:latest';
const HERE   = __dirname;
const SERVER = path.join(HERE, 'server.py');
const IS_WIN = process.platform === 'win32';

function log(msg) { process.stdout.write(`[swatch] ${msg}\n`); }

if (MODE !== 'docker' && MODE !== 'local') {
    log('');
    log('Usage:  node swatch-service/start.js <docker|local>');
    log('');
    log('  docker — runs the pre-built GHCR image (requires Docker)');
    log('  local  — runs via uv + Python 3.12 (requires uv)');
    log('           install uv: https://docs.astral.sh/uv/getting-started/installation/');
    log('           Windows:    winget install astral-sh.uv');
    log('           Mac/Linux:  curl -LsSf https://astral.sh/uv/install.sh | sh');
    log('');
    log('Or use the npm shortcuts:');
    log('  npm run swatch:docker');
    log('  npm run swatch:local');
    log('');
    process.exit(1);
}

function portInUse() {
    return new Promise(resolve => {
        const s = net.createServer();
        s.once('error', () => resolve(true));
        s.once('listening', () => { s.close(); resolve(false); });
        s.listen(PORT, '127.0.0.1');
    });
}

function hasCmd(cmd) {
    try { execSync(IS_WIN ? `where ${cmd}` : `which ${cmd}`, { stdio: 'ignore' }); return true; }
    catch { return false; }
}

function startDocker() {
    if (!hasCmd('docker')) {
        log('ERROR: docker not found. Install Docker Desktop: https://docs.docker.com/get-docker/');
        process.exit(1);
    }
    log(`Pulling & starting via Docker on port ${PORT}…`);
    try { execSync('docker rm -f marathon-swatch-dev', { stdio: 'ignore' }); } catch {}
    spawn('docker', ['run', '--rm', '--name', 'marathon-swatch-dev',
        '-p', `${PORT}:${PORT}`, IMAGE,
    ], { stdio: 'inherit' })
    .on('error', err => { log(`Docker error: ${err.message}`); process.exit(1); });
}

function startLocal() {
    if (!hasCmd('uv')) {
        log('ERROR: uv not found.');
        log('  Windows:    winget install astral-sh.uv');
        log('  Mac/Linux:  curl -LsSf https://astral.sh/uv/install.sh | sh');
        process.exit(1);
    }
    log(`Starting via uv (Python 3.12 + cadquery) on port ${PORT}…`);
    log('First run downloads cadquery — may take a few minutes.');
    spawn('uv', ['run', '--python', '3.12', '--with', 'cadquery', SERVER], {
        cwd: HERE,
        stdio: 'inherit',
        env: { ...process.env, PORT: String(PORT) },
    })
    .on('error', err => { log(`uv error: ${err.message}`); process.exit(1); });
}

(async () => {
    if (await portInUse()) {
        log(`Port ${PORT} already in use — assuming swatch service is running.`);
        return;
    }
    if (MODE === 'docker') startDocker();
    else startLocal();
})();
