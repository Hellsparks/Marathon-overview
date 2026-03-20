const express = require('express');
const https = require('https');
const { execSync, exec } = require('child_process');
const { getDb } = require('../db');

const router = express.Router();

const REPO = 'Hellsparks/Marathon-overview';
const GHCR_IMAGE = 'ghcr.io/hellsparks/marathon-overview';
const DEV_BRANCH = 'dev';

// Caches
let releaseCache = null;
let releaseCacheTime = 0;
let releasesListCache = null;
let releasesListCacheTime = 0;
let devCommitsCache = null;
let devCommitsCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Dev branch watchdog
let devWatchdogTimer = null;
const DEV_WATCHDOG_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let devNewCommits = null; // { ahead, latestSha, latestMsg, latestDate }

// In-memory update log for status polling
let applyLog = [];
let applyRunning = false;

function getUpdateChannel() {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'update_channel'").get();
    return row?.value || 'release';
  } catch { return 'release'; }
}

function getCurrentVersion() {
  return process.env.APP_VERSION || require('../../../package.json').version;
}

function getCurrentGitInfo() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: process.cwd() }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd: process.cwd() }).trim();
    const date = execSync('git log -1 --format=%ci', { encoding: 'utf8', cwd: process.cwd() }).trim();
    return { sha, branch, date };
  } catch { return { sha: 'unknown', branch: 'unknown', date: null }; }
}

function semverParse(v) {
  const m = String(v).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function semverGt(a, b) {
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch > b.patch;
}

function ghGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path,
      headers: { 'User-Agent': 'Marathon-Overview-App' },
    };
    https.get(opts, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// --- Release channel helpers ---

async function fetchLatestRelease() {
  return ghGet(`/repos/${REPO}/releases/latest`);
}

async function fetchAllReleases() {
  return ghGet(`/repos/${REPO}/releases?per_page=20`);
}

// --- Dev channel helpers ---

async function fetchDevCommits() {
  return ghGet(`/repos/${REPO}/commits?sha=${DEV_BRANCH}&per_page=15`);
}

async function checkDevAhead() {
  try {
    const gitInfo = getCurrentGitInfo();
    const localSha = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: process.cwd() }).trim();

    // Fetch remote without pulling
    execSync('git fetch origin ' + DEV_BRANCH, { encoding: 'utf8', cwd: process.cwd(), timeout: 15000 });

    // Count commits ahead
    const ahead = execSync(`git rev-list HEAD..origin/${DEV_BRANCH} --count`, { encoding: 'utf8', cwd: process.cwd() }).trim();
    const aheadCount = parseInt(ahead, 10) || 0;

    if (aheadCount > 0) {
      const latestLine = execSync(`git log origin/${DEV_BRANCH} -1 --format=%H|||%s|||%ci`, { encoding: 'utf8', cwd: process.cwd() }).trim();
      const [latestSha, latestMsg, latestDate] = latestLine.split('|||');
      return { ahead: aheadCount, latestSha: latestSha?.slice(0, 7), latestMsg, latestDate, localSha: localSha.slice(0, 7) };
    }
    return { ahead: 0, localSha: localSha.slice(0, 7) };
  } catch (e) {
    return { ahead: 0, error: e.message };
  }
}

// --- Dev watchdog ---

function startDevWatchdog() {
  stopDevWatchdog();
  console.log('[Updates] Dev branch watchdog started');
  devWatchdogTimer = setInterval(async () => {
    try {
      devNewCommits = await checkDevAhead();
      if (devNewCommits.ahead > 0) {
        console.log(`[Updates] Dev watchdog: ${devNewCommits.ahead} new commit(s) on ${DEV_BRANCH}`);
      }
    } catch { /* silent */ }
  }, DEV_WATCHDOG_INTERVAL_MS);
  // Immediate first check
  checkDevAhead().then(r => { devNewCommits = r; }).catch(() => {});
}

function stopDevWatchdog() {
  if (devWatchdogTimer) {
    clearInterval(devWatchdogTimer);
    devWatchdogTimer = null;
  }
  devNewCommits = null;
}

// Start watchdog if channel is dev
if (getUpdateChannel() === 'dev') startDevWatchdog();

// GET /api/updates/channel
router.get('/channel', (req, res) => {
  res.json({ channel: getUpdateChannel() });
});

// PUT /api/updates/channel
router.put('/channel', (req, res) => {
  const { channel } = req.body;
  if (!['release', 'dev'].includes(channel)) {
    return res.status(400).json({ error: 'channel must be "release" or "dev"' });
  }
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('update_channel', ?)").run(channel);

  if (channel === 'dev') {
    startDevWatchdog();
  } else {
    stopDevWatchdog();
  }

  res.json({ channel });
});

// GET /api/updates/check — works for both channels
router.get('/check', async (req, res) => {
  try {
    const channel = getUpdateChannel();
    const current = getCurrentVersion();
    const gitInfo = getCurrentGitInfo();

    if (channel === 'dev') {
      // Dev channel: check for new commits on dev branch
      const devStatus = devNewCommits || await checkDevAhead();
      devNewCommits = devStatus;

      return res.json({
        channel: 'dev',
        available: devStatus.ahead > 0,
        current,
        gitInfo,
        devStatus,
      });
    }

    // Release channel: existing logic
    const now = Date.now();
    if (!releaseCache || now - releaseCacheTime > CACHE_TTL_MS) {
      releaseCache = await fetchLatestRelease();
      releaseCacheTime = now;
    }

    const release = releaseCache;
    if (!release || !release.tag_name) {
      return res.json({ channel: 'release', available: false, current, gitInfo });
    }

    const latest = release.tag_name.replace(/^v/, '');
    const parsedCurrent = semverParse(current);
    const parsedLatest = semverParse(latest);

    if (!parsedCurrent || !parsedLatest || !semverGt(parsedLatest, parsedCurrent)) {
      return res.json({ channel: 'release', available: false, current, latest, gitInfo });
    }

    res.json({
      channel: 'release',
      available: true,
      current,
      latest,
      compatible: parsedCurrent.major === parsedLatest.major,
      releaseUrl: release.html_url,
      releaseNotes: release.body || '',
      publishedAt: release.published_at,
      gitInfo,
    });
  } catch (err) {
    res.json({ available: false, current: getCurrentVersion(), error: err.message });
  }
});

// GET /api/updates/releases — list all releases for picker
router.get('/releases', async (req, res) => {
  try {
    const now = Date.now();
    if (!releasesListCache || now - releasesListCacheTime > CACHE_TTL_MS) {
      releasesListCache = await fetchAllReleases();
      releasesListCacheTime = now;
    }
    const releases = (releasesListCache || []).map(r => ({
      tag: r.tag_name,
      name: r.name || r.tag_name,
      published: r.published_at,
      prerelease: r.prerelease,
      url: r.html_url,
      notes: r.body || '',
    }));
    res.json({ releases, current: getCurrentVersion() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/updates/dev-commits — recent commits on dev branch
router.get('/dev-commits', async (req, res) => {
  try {
    const now = Date.now();
    if (!devCommitsCache || now - devCommitsCacheTime > CACHE_TTL_MS) {
      devCommitsCache = await fetchDevCommits();
      devCommitsCacheTime = now;
    }
    const gitInfo = getCurrentGitInfo();
    const commits = (devCommitsCache || []).map(c => ({
      sha: c.sha?.slice(0, 7),
      fullSha: c.sha,
      message: c.commit?.message?.split('\n')[0] || '',
      date: c.commit?.author?.date || c.commit?.committer?.date,
      author: c.commit?.author?.name || c.author?.login || '',
    }));
    res.json({ commits, gitInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/updates/apply
router.post('/apply', (req, res) => {
  if (applyRunning) {
    return res.status(409).json({ error: 'Update already in progress' });
  }

  const { tag } = req.body; // optional: specific release tag to checkout

  applyRunning = true;
  applyLog = ['Starting update...'];
  res.json({ started: true });

  const deployMode = process.env.MARATHON_DEPLOY_MODE;
  const channel = getUpdateChannel();

  if (deployMode === 'docker') {
    applyDockerUpdate();
  } else if (channel === 'dev') {
    applyDevUpdate();
  } else if (tag) {
    applyReleaseTagUpdate(tag);
  } else {
    applyDirectUpdate();
  }
});

// POST /api/updates/pull-restart — simple git pull + restart for dev channel
router.post('/pull-restart', (req, res) => {
  if (applyRunning) {
    return res.status(409).json({ error: 'Update already in progress' });
  }

  applyRunning = true;
  applyLog = ['Pulling latest changes...'];
  res.json({ started: true });

  applyDevUpdate();
});

// GET /api/updates/apply-status
router.get('/apply-status', (req, res) => {
  res.json({ running: applyRunning, log: applyLog });
});

function logLine(line) {
  applyLog.push(line);
  console.log('[update]', line);
}

function applyDockerUpdate() {
  const containerName = process.env.MARATHON_CONTAINER_NAME || 'marathon-backend';
  const socketPath = '/var/run/docker.sock';
  const net = require('net');

  logLine(`Pulling latest image from ${GHCR_IMAGE}:latest ...`);

  function dockerRequest(method, path, body, cb) {
    const client = net.createConnection({ path: socketPath });
    let response = '';
    let bodyStr = body ? JSON.stringify(body) : '';
    let req = `${method} ${path} HTTP/1.1\r\nHost: localhost\r\n`;
    if (bodyStr) req += `Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(bodyStr)}\r\n`;
    req += '\r\n';
    if (bodyStr) req += bodyStr;
    client.write(req);
    client.on('data', d => { response += d.toString(); });
    client.on('end', () => {
      const idx = response.indexOf('\r\n\r\n');
      const responseBody = idx >= 0 ? response.slice(idx + 4) : response;
      cb(null, responseBody);
    });
    client.on('error', cb);
  }

  const pullPath = `/images/create?fromImage=${encodeURIComponent(GHCR_IMAGE)}&tag=latest`;
  dockerRequest('POST', pullPath, null, (err, body) => {
    if (err) {
      logLine(`Pull failed: ${err.message}`);
      applyRunning = false;
      return;
    }
    logLine('Image pulled. Restarting container...');
    dockerRequest('POST', `/containers/${containerName}/restart`, null, (err2) => {
      if (err2) {
        logLine(`Restart failed: ${err2.message}`);
        applyRunning = false;
        return;
      }
      logLine('Container restart signal sent. Update complete.');
    });
  });
}

function applyDirectUpdate() {
  logLine('Running git pull...');
  exec('git pull', { cwd: process.cwd() }, (err, stdout, stderr) => {
    if (err) {
      logLine(`git pull failed: ${err.message}`);
      applyRunning = false;
      return;
    }
    logLine(stdout.trim() || 'git pull OK');
    installAndRestart();
  });
}

function applyDevUpdate() {
  logLine(`Fetching origin/${DEV_BRANCH}...`);
  exec(`git fetch origin ${DEV_BRANCH}`, { cwd: process.cwd(), timeout: 30000 }, (err) => {
    if (err) {
      logLine(`Fetch failed: ${err.message}`);
      applyRunning = false;
      return;
    }
    logLine(`Checking out ${DEV_BRANCH} and pulling...`);
    exec(`git checkout ${DEV_BRANCH} && git pull origin ${DEV_BRANCH}`, { cwd: process.cwd(), timeout: 30000 }, (err2, stdout2) => {
      if (err2) {
        logLine(`Pull failed: ${err2.message}`);
        applyRunning = false;
        return;
      }
      logLine(stdout2.trim() || 'Pull OK');
      installAndRestart();
    });
  });
}

function applyReleaseTagUpdate(tag) {
  logLine(`Fetching tags from origin...`);
  exec('git fetch --tags origin', { cwd: process.cwd(), timeout: 30000 }, (err) => {
    if (err) {
      logLine(`Fetch failed: ${err.message}`);
      applyRunning = false;
      return;
    }
    logLine(`Checking out tag ${tag}...`);
    exec(`git checkout ${tag}`, { cwd: process.cwd(), timeout: 15000 }, (err2, stdout2) => {
      if (err2) {
        logLine(`Checkout failed: ${err2.message}`);
        applyRunning = false;
        return;
      }
      logLine(stdout2.trim() || `Checked out ${tag}`);
      installAndRestart();
    });
  });
}

function installAndRestart() {
  const path = require('path');
  const backendDir = path.join(__dirname, '../../');
  const frontendDir = path.join(__dirname, '../../../frontend');

  logLine('Installing backend dependencies...');
  exec('npm ci --omit=dev', { cwd: backendDir, timeout: 120000 }, (err2, out2) => {
    if (err2) {
      logLine(`npm ci failed: ${err2.message}`);
      applyRunning = false;
      return;
    }
    logLine('Dependencies installed. Building frontend...');
    exec('npm run build', { cwd: frontendDir, timeout: 120000 }, (err3, out3) => {
      if (err3) {
        logLine(`Frontend build failed: ${err3.message}`);
        applyRunning = false;
        return;
      }
      logLine('Build complete. Restarting...');
      selfRestart(backendDir);
    });
  });
}

function selfRestart(backendDir) {
  const path = require('path');
  const { spawn } = require('child_process');
  const fs = require('fs');

  // pm2
  if (process.env.PM2_HOME || process.env.pm_id) {
    logLine('Restarting via pm2...');
    exec('pm2 restart ' + (process.env.pm_id || 'marathon'), { timeout: 10000 }, () => {});
    return;
  }

  // systemd (Restart=always or on-failure will bring it back)
  if (process.env.INVOCATION_ID) {
    logLine('Restarting via systemd...');
    setTimeout(() => process.exit(0), 500);
    return;
  }

  // Touch index.js to trigger nodemon restart (works if nodemon is watching).
  // If not under nodemon, this is harmless and we fall through to spawn.
  const entryPoint = path.join(backendDir, 'src/index.js');
  try {
    const now = new Date();
    fs.utimesSync(entryPoint, now, now);
    // If nodemon is watching, it will detect the mtime change and restart.
    // Give it a moment — if we're still alive after 3s, nodemon didn't restart us,
    // so fall through to the spawn approach.
    logLine('Triggered file change for auto-restart watcher...');
    setTimeout(() => {
      // Still alive — no watcher. Spawn replacement.
      logLine('No watcher detected, spawning replacement process...');
      spawnReplacement(backendDir, entryPoint);
    }, 3000);
    return;
  } catch {
    // utimes failed, fall through
  }

  spawnReplacement(backendDir, entryPoint);
}

function spawnReplacement(backendDir, entryPoint) {
  const { spawn } = require('child_process');
  const fs = require('fs');
  const isWin = process.platform === 'win32';

  // Write a tiny restart script that waits for port release then starts node
  const restartScript = require('path').join(backendDir, '.restart-tmp.' + (isWin ? 'cmd' : 'sh'));
  if (isWin) {
    fs.writeFileSync(restartScript,
      `@echo off\r\nping -n 3 127.0.0.1 >nul\r\nnode "${entryPoint}"\r\ndel "%~f0"\r\n`);
    const child = spawn('cmd', ['/c', restartScript], {
      cwd: backendDir, detached: true, stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();
  } else {
    fs.writeFileSync(restartScript,
      `#!/bin/sh\nsleep 2\nnode "${entryPoint}"\nrm -f "${restartScript}"\n`);
    fs.chmodSync(restartScript, '755');
    const child = spawn('/bin/sh', [restartScript], {
      cwd: backendDir, detached: true, stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();
  }

  setTimeout(() => process.exit(0), 500);
}

module.exports = router;
