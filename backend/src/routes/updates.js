const express = require('express');
const https = require('https');
const { execSync, exec } = require('child_process');

const router = express.Router();

const REPO = 'Hellsparks/Marathon-overview';
const GHCR_IMAGE = 'ghcr.io/hellsparks/marathon-overview';

// 5-minute cache for GitHub API responses
let releaseCache = null;
let releaseCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// In-memory update log for status polling
let applyLog = [];
let applyRunning = false;

function getCurrentVersion() {
  return process.env.APP_VERSION || require('../../../package.json').version;
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

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path: `/repos/${REPO}/releases/latest`,
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

// GET /api/updates/check
router.get('/check', async (req, res) => {
  try {
    const current = getCurrentVersion();
    const now = Date.now();

    if (!releaseCache || now - releaseCacheTime > CACHE_TTL_MS) {
      releaseCache = await fetchLatestRelease();
      releaseCacheTime = now;
    }

    const release = releaseCache;
    if (!release || !release.tag_name) {
      return res.json({ available: false, current });
    }

    const latest = release.tag_name.replace(/^v/, '');
    const parsedCurrent = semverParse(current);
    const parsedLatest = semverParse(latest);

    if (!parsedCurrent || !parsedLatest || !semverGt(parsedLatest, parsedCurrent)) {
      return res.json({ available: false, current, latest });
    }

    res.json({
      available: true,
      current,
      latest,
      compatible: parsedCurrent.major === parsedLatest.major,
      releaseUrl: release.html_url,
      releaseNotes: release.body || '',
      publishedAt: release.published_at,
    });
  } catch (err) {
    // Silent fail — don't break the app if GitHub is unreachable
    res.json({ available: false, current: getCurrentVersion(), error: err.message });
  }
});

// POST /api/updates/apply
router.post('/apply', (req, res) => {
  if (applyRunning) {
    return res.status(409).json({ error: 'Update already in progress' });
  }

  applyRunning = true;
  applyLog = ['Starting update...'];
  res.json({ started: true });

  const deployMode = process.env.MARATHON_DEPLOY_MODE;

  if (deployMode === 'docker') {
    applyDockerUpdate();
  } else {
    applyDirectUpdate();
  }
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

  // Use Docker socket to pull the new image then restart the container
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
      // Split headers from body
      const idx = response.indexOf('\r\n\r\n');
      const responseBody = idx >= 0 ? response.slice(idx + 4) : response;
      cb(null, responseBody);
    });
    client.on('error', cb);
  }

  // Pull image via Docker socket (POST /images/create?fromImage=...&tag=latest)
  const pullPath = `/images/create?fromImage=${encodeURIComponent(GHCR_IMAGE)}&tag=latest`;
  dockerRequest('POST', pullPath, null, (err, body) => {
    if (err) {
      logLine(`Pull failed: ${err.message}`);
      applyRunning = false;
      return;
    }
    logLine('Image pulled. Restarting container...');

    // Restart container
    dockerRequest('POST', `/containers/${containerName}/restart`, null, (err2) => {
      if (err2) {
        logLine(`Restart failed: ${err2.message}`);
        applyRunning = false;
        return;
      }
      logLine('Container restart signal sent. Update complete.');
      // Container will restart itself — applyRunning stays true as the process is replaced
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

    logLine('Installing backend dependencies...');
    exec('npm ci --omit=dev', { cwd: require('path').join(__dirname, '../../') }, (err2, out2) => {
      if (err2) {
        logLine(`npm ci failed: ${err2.message}`);
        applyRunning = false;
        return;
      }
      logLine('Dependencies installed. Building frontend...');

      exec('npm run build', { cwd: require('path').join(__dirname, '../../../frontend') }, (err3, out3) => {
        if (err3) {
          logLine(`Frontend build failed: ${err3.message}`);
          applyRunning = false;
          return;
        }
        logLine('Build complete. Restarting server (exit 42)...');
        setTimeout(() => process.exit(42), 500);
      });
    });
  });
}

module.exports = router;
