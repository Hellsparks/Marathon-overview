const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const router = express.Router();

const SCRIPT_PATH = path.join(__dirname, '../services/swatch_generator.py');

// Resolve python binary: env override → python3 → python (Windows fallback)
const PYTHON_CANDIDATES = process.env.PYTHON_BIN
    ? [process.env.PYTHON_BIN]
    // 'py' = Windows Python Launcher (bypasses Store alias stubs)
    : ['python3', 'python', 'py'];

function spawnPython(args, onSuccess, onFailure) {
    const candidates = [...PYTHON_CANDIDATES];
    function tryNext() {
        const bin = candidates.shift();
        if (!bin) return onFailure(new Error('Python not found. Install Python 3 with CadQuery or set PYTHON_BIN.'));
        const proc = spawn(bin, args);
        const stderr = [];
        let settled = false;
        proc.stderr.on('data', d => stderr.push(d.toString()));
        proc.on('error', err => {
            if (settled) return;
            if (err.code === 'ENOENT') return tryNext(); // try next candidate
            settled = true;
            onFailure(err);
        });
        proc.on('close', code => {
            if (settled) return;
            settled = true;
            if (code !== 0) {
                // 9009 = Windows Store alias stub (fake python, not real install) — try next
                if (code === 9009) { settled = false; return tryNext(); }
                return onFailure(new Error(`exit ${code}: ${stderr.join('')}`));
            }
            onSuccess();
        });
    }
    tryNext();
}

// POST /api/extras/swatch
// Body: { line1, line2, filename }
// Returns: binary STL
router.post('/swatch', async (req, res) => {
    const { line1 = '', line2 = '', filename = 'swatch.stl' } = req.body;

    // If a swatch microservice is running, delegate to it
    const serviceUrl = process.env.SWATCH_SERVICE_URL;
    if (serviceUrl) {
        try {
            const upstream = await fetch(`${serviceUrl}/swatch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ line1: String(line1), line2: String(line2) }),
            });
            if (!upstream.ok) {
                const msg = await upstream.text();
                console.error('[extras/swatch]', msg);
                return res.status(500).json({ error: msg });
            }
            const buf = Buffer.from(await upstream.arrayBuffer());
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send(buf);
        } catch (err) {
            console.error('[extras/swatch]', err.message);
            return res.status(500).json({ error: err.message });
        }
    }

    // Fallback: spawn local Python
    const tmpOut = path.join(os.tmpdir(), `marathon_swatch_${Date.now()}_${Math.random().toString(36).slice(2)}.stl`);
    const arg = JSON.stringify({ line1: String(line1), line2: String(line2) });

    spawnPython(
        [SCRIPT_PATH, arg, tmpOut],
        () => {
            try {
                const stl = fs.readFileSync(tmpOut);
                res.setHeader('Content-Type', 'application/octet-stream');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.send(stl);
            } catch {
                res.status(500).json({ error: 'Failed to read generated STL' });
            } finally {
                try { fs.unlinkSync(tmpOut); } catch {}
            }
        },
        err => {
            console.error('[extras/swatch]', err.message);
            res.status(500).json({ error: err.message });
        }
    );
});

// POST /api/extras/report-bug
// Body: { type, title, description, logs }
router.post('/report-bug', async (req, res) => {
    const { type, title, description, logs } = req.body;
    const db = getDb();

    const tokenRow = db.prepare("SELECT value FROM settings WHERE key = 'github_token'").get();
    const enabledRow = db.prepare("SELECT value FROM settings WHERE key = 'direct_reports_enabled'").get();

    if (!tokenRow?.value || enabledRow?.value !== 'true') {
        return res.status(403).json({ error: 'Direct bug reporting is not enabled or configured in Settings.' });
    }

    const labels = [];
    if (type === 'bug') labels.push('bug');
    if (type === 'feature') labels.push('Feature request');
    if (type === 'docs') labels.push('documentation');

    let body = description;
    if (logs) {
        body += '\n\n### Console Logs\n```text\n' + logs + '\n```';
    }

    try {
        const response = await fetch('https://api.github.com/repos/Hellsparks/marathon-overview/issues', {
            method: 'POST',
            headers: {
                'Authorization': `token ${tokenRow.value}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'Marathon-Fleet-Manager'
            },
            body: JSON.stringify({
                title,
                body,
                labels
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'GitHub API error');
        }

        res.json({ ok: true, url: data.html_url });
    } catch (err) {
        console.error('[extras/report-bug]', err.message);
        res.status(500).json({ error: `Failed to create issue: ${err.message}` });
    }
});

module.exports = router;
