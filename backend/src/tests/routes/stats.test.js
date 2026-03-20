const request = require('supertest');
const { resetDb } = require('../helpers/db');
const app = require('../../app');

beforeEach(() => resetDb());

describe('GET /api/stats/fleet', () => {
  it('returns fleet stats with zero counts on empty db', async () => {
    const res = await request(app).get('/api/stats/fleet');
    expect(res.status).toBe(200);
    expect(typeof res.body.total_jobs).toBe('number');
    expect(typeof res.body.total_duration_s).toBe('number');
    expect(typeof res.body.total_filament_mm).toBe('number');
  });
});

describe('GET /api/stats/history', () => {
  it('returns paginated job history', async () => {
    const res = await request(app).get('/api/stats/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.jobs)).toBe(true);
    expect(res.body.limit).toBe(50);
    expect(typeof res.body.total).toBe('number');
  });

  it('caps limit at 200', async () => {
    const res = await request(app).get('/api/stats/history?limit=9999');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBeLessThanOrEqual(200);
  });

  it('handles limit=0 without error', async () => {
    const res = await request(app).get('/api/stats/history?limit=0');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/stats/utilization', () => {
  it('returns utilization data', async () => {
    const res = await request(app).get('/api/stats/utilization');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.printerTotals)).toBe(true);
    expect(Array.isArray(res.body.topFiles)).toBe(true);
  });
});
