/**
 * MCP Server management routes
 * Spawns/stops the Marathon MCP server (mcp-server/src/index.js) as a
 * background HTTP process so Claude Desktop or any MCP client can reach it.
 *
 * GET  /api/mcp/status  — { running, pid, port, marathonUrl, endpoint }
 * POST /api/mcp/start   — body: { port?, marathonUrl? } → start or no-op
 * POST /api/mcp/stop    — kill the process
 */

const router  = require('express').Router();
const { spawn } = require('child_process');
const path    = require('path');
const fs      = require('fs');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const DATA_DIR   = process.env.DB_PATH
    ? path.dirname(process.env.DB_PATH)
    : path.join(__dirname, '../../data');

const PID_FILE   = path.join(DATA_DIR, 'mcp.pid');
const PORT_FILE  = path.join(DATA_DIR, 'mcp.port');
const URL_FILE   = path.join(DATA_DIR, 'mcp.url');
const LOG_FILE   = path.join(DATA_DIR, 'mcp.log');
const MCP_ENTRY  = path.join(__dirname, '../../../mcp-server/src/index.js');
const NODE_BIN   = process.execPath; // same node binary that runs the backend

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readPid()  { try { return parseInt(fs.readFileSync(PID_FILE,  'utf8').trim()) || null; } catch { return null; } }
function readPort() { try { return parseInt(fs.readFileSync(PORT_FILE, 'utf8').trim()) || 3001; } catch { return 3001; } }
function readUrl()  { try { return fs.readFileSync(URL_FILE, 'utf8').trim() || 'http://localhost:3000'; } catch { return 'http://localhost:3000'; } }

function pidAlive(pid) {
    if (!pid) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
}

function mcpInstalled() {
    return fs.existsSync(MCP_ENTRY);
}

function currentStatus() {
    const pid  = readPid();
    const port = readPort();
    const marathonUrl = readUrl();
    const running = pidAlive(pid);
    return {
        installed: mcpInstalled(),
        running,
        pid: running ? pid : null,
        port,
        marathonUrl,
        endpoint: `http://localhost:${port}/mcp`,
    };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/mcp/status
router.get('/status', (_req, res) => {
    res.json(currentStatus());
});

// POST /api/mcp/start
router.post('/start', (req, res) => {
    if (!mcpInstalled()) {
        return res.status(400).json({ error: 'MCP server not found at ' + MCP_ENTRY });
    }

    const existingPid = readPid();
    if (pidAlive(existingPid)) {
        return res.json({ ok: true, message: 'Already running', ...currentStatus() });
    }

    const port       = parseInt(req.body?.port) || readPort() || 3001;
    const marathonUrl = req.body?.marathonUrl || readUrl() || 'http://localhost:3000';

    if (port < 1025 || port > 65535) {
        return res.status(400).json({ error: 'port must be between 1025 and 65535' });
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });
    const logFd = fs.openSync(LOG_FILE, 'a');

    const child = spawn(NODE_BIN, [MCP_ENTRY], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: {
            ...process.env,
            MCP_TRANSPORT: 'http',
            MCP_PORT: String(port),
            MARATHON_URL: marathonUrl,
        },
    });
    child.unref();
    fs.closeSync(logFd);

    if (!child.pid) {
        return res.status(500).json({ error: 'Failed to spawn MCP server process' });
    }

    fs.writeFileSync(PID_FILE,  String(child.pid));
    fs.writeFileSync(PORT_FILE, String(port));
    fs.writeFileSync(URL_FILE,  marathonUrl);

    res.json({ ok: true, message: 'Started', ...currentStatus() });
});

// POST /api/mcp/stop
router.post('/stop', (_req, res) => {
    const pid = readPid();
    if (!pidAlive(pid)) {
        try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
        return res.json({ ok: true, message: 'Not running' });
    }
    try {
        process.kill(pid, 'SIGTERM');
        try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
        res.json({ ok: true, message: 'Stopped' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
