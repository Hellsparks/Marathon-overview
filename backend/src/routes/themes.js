const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');

const execAsync = util.promisify(exec);

const DATA_DIR = path.join(__dirname, '../../data');
const THEMES_DIR = path.join(DATA_DIR, 'themes');
const THEMES_LIST = path.join(DATA_DIR, 'themes.txt');

if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR, { recursive: true });
if (!fs.existsSync(THEMES_LIST)) fs.writeFileSync(THEMES_LIST, '');

function readThemeUrls() {
    return fs.readFileSync(THEMES_LIST, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
}

function saveThemeUrls(urls) {
    const unique = [...new Set(urls)];
    fs.writeFileSync(THEMES_LIST, unique.join('\n') + (unique.length ? '\n' : ''));
}

function parseRepoName(url) {
    const clean = url.trim().replace(/\/$/, '').replace(/\.git$/, '');
    const parts = clean.split('/');
    return parts[parts.length - 1] || null;
}

// Strip anything after the repo root: /tree/..., /blob/..., /commit/..., etc.
function cleanGitHubUrl(url) {
    let clean = url.trim().replace(/\/$/, '').replace(/\.git$/, '');
    const m = clean.match(/^(https?:\/\/github\.com\/[^/]+\/[^/]+)/i);
    if (m) return m[1];
    return clean;
}

function findCssPath(repoPath, repoName) {
    const candidates = [
        { rel: 'custom.css',       abs: path.join(repoPath, 'custom.css') },
        { rel: '.theme/custom.css', abs: path.join(repoPath, '.theme', 'custom.css') },
    ];
    for (const c of candidates) {
        if (fs.existsSync(c.abs)) return `/themes/${repoName}/${c.rel}`;
    }
    return null;
}

function findPreviewImages(repoPath, repoName) {
    const imgs = [];
    const exts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

    function scanDir(dir, urlBase) {
        if (!fs.existsSync(dir)) return;
        for (const f of fs.readdirSync(dir)) {
            if (exts.some(e => f.toLowerCase().endsWith(e))) {
                imgs.push(`${urlBase}/${f}`);
            }
        }
    }

    scanDir(repoPath, `/themes/${repoName}`);
    scanDir(path.join(repoPath, '.theme'), `/themes/${repoName}/.theme`);
    return imgs.slice(0, 3);
}

function getThemeInfo(url) {
    const name = parseRepoName(url);
    if (!name) return null;
    const repoPath = path.join(THEMES_DIR, name);
    const installed = fs.existsSync(repoPath);
    return {
        name,
        url,
        installed,
        cssPath: installed ? findCssPath(repoPath, name) : null,
        previews: installed ? findPreviewImages(repoPath, name) : [],
    };
}

// GET /api/themes — list all themes from themes.txt with install status
router.get('/', (req, res) => {
    const urls = readThemeUrls();
    const themes = urls.map(getThemeInfo).filter(Boolean);
    res.json(themes);
});

// POST /api/themes — add one or more URLs (newline-separated), git clone each
router.post('/', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    // Support multiple URLs (newline or comma separated)
    const newUrls = url.split(/[\n,]+/).map(u => u.trim()).filter(Boolean);
    if (!newUrls.length) return res.status(400).json({ error: 'No valid URLs provided' });

    const existing = readThemeUrls();
    const results = [];

    for (const rawUrl of newUrls) {
        const cleanUrl = cleanGitHubUrl(rawUrl);
        const repoName = parseRepoName(cleanUrl);

        if (!repoName) {
            results.push({ url: rawUrl, error: 'Invalid URL format' });
            continue;
        }

        const repoPath = path.join(THEMES_DIR, repoName);
        let action = 'installed';

        try {
            if (fs.existsSync(repoPath)) {
                await execAsync('git pull', { cwd: repoPath });
                action = 'updated';
            } else {
                await execAsync(`git clone ${cleanUrl}.git ${repoName}`, { cwd: THEMES_DIR });
            }

            if (!existing.includes(cleanUrl)) {
                existing.push(cleanUrl);
            }

            const info = getThemeInfo(cleanUrl);
            if (!info?.cssPath) {
                results.push({ url: rawUrl, repoName, action, error: 'custom.css not found — is this a Mainsail theme repo?' });
            } else {
                results.push({ ...info, action });
            }
        } catch (err) {
            results.push({ url: rawUrl, repoName, error: err.message });
        }
    }

    saveThemeUrls(existing);
    res.json({ results });
});

// DELETE /api/themes/:name — remove theme from list and delete its directory
router.delete('/:name', (req, res) => {
    const { name } = req.params;
    const repoPath = path.join(THEMES_DIR, name);

    const urls = readThemeUrls().filter(u => parseRepoName(u) !== name);
    saveThemeUrls(urls);

    if (fs.existsSync(repoPath)) {
        fs.rmSync(repoPath, { recursive: true, force: true });
    }

    res.json({ success: true });
});

module.exports = router;
