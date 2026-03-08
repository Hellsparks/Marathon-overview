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
        proc.stderr.on('data', d => stderr.push(d.toString()));
        proc.on('error', err => {
            if (err.code === 'ENOENT') return tryNext(); // try next candidate
            onFailure(err);
        });
        proc.on('close', code => {
            if (code !== 0) {
                // 9009 = Windows Store alias stub (fake python, not real install) — try next
                if (code === 9009) return tryNext();
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
router.post('/swatch', (req, res) => {
    const { line1 = '', line2 = '', filename = 'swatch.stl' } = req.body;

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

module.exports = router;
