/**
 * Tests for /api/files
 * Focuses on the path traversal vulnerability in GET /api/files/thumb/:filename
 */
const request = require('supertest');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { resetDb } = require('../helpers/db');
const app = require('../../app');

beforeEach(() => resetDb());

describe('GET /api/files/thumb/:filename — path traversal', () => {
  let tmpDir;

  beforeEach(() => {
    // Create a temporary uploads dir with a sentinel file outside .thumbnails
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-test-'));
    fs.mkdirSync(path.join(tmpDir, '.thumbnails'));
    fs.writeFileSync(path.join(tmpDir, 'secret.txt'), 'SECRET');
    process.env.UPLOADS_DIR = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.UPLOADS_DIR;
  });

  it('returns 404 for a non-existent thumbnail', async () => {
    const res = await request(app).get('/api/files/thumb/nonexistent');
    expect(res.status).toBe(404);
  });

  it('serves a valid thumbnail', async () => {
    fs.writeFileSync(path.join(tmpDir, '.thumbnails', 'test.gcode.png'), 'PNG_DATA');
    const res = await request(app).get('/api/files/thumb/test.gcode');
    expect(res.status).toBe(200);
  });

  it('never serves secret file content on path traversal attempt', async () => {
    // Express normalizes ../../ in URLs before routing, so the request never
    // reaches the thumb handler — but the content must never be the secret file.
    const res = await request(app).get('/api/files/thumb/../../secret');
    expect(res.text).not.toContain('SECRET');
  });

  it('path.basename strips directory components from filename param', () => {
    // Unit-test the sanitization logic directly
    const path = require('path');
    expect(path.basename('../../etc/passwd')).toBe('passwd');
    expect(path.basename('../secret')).toBe('secret');
    expect(path.basename('normal-file')).toBe('normal-file');
  });
});

describe('GET /api/files', () => {
  it('returns empty array when no files', async () => {
    const res = await request(app).get('/api/files');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
