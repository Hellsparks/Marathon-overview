const request = require('supertest');
const { resetDb, getDb } = require('../helpers/db');
const app = require('../../app');

beforeEach(() => resetDb());

function seedPrinter(name = 'Printer1') {
  const db = getDb();
  return db.prepare(
    "INSERT INTO printers (name, host, port, firmware_type) VALUES (?, 'p.local', 7125, 'moonraker')"
  ).run(name).lastInsertRowid;
}

function seedTask(name = 'Oil rods') {
  const db = getDb();
  return db.prepare('INSERT INTO maintenance_tasks (name) VALUES (?)').run(name).lastInsertRowid;
}

// Actual response shape: { tasks: [], printers: [], intervals: {}, history: {} }

describe('GET /api/maintenance', () => {
  it('returns expected shape', async () => {
    const res = await request(app).get('/api/maintenance');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(Array.isArray(res.body.printers)).toBe(true);
    expect(typeof res.body.intervals).toBe('object');
    expect(typeof res.body.history).toBe('object');
  });

  it('includes created printers', async () => {
    const pid = seedPrinter('Test Printer');
    const res = await request(app).get('/api/maintenance');
    expect(res.status).toBe(200);
    const printer = res.body.printers.find(p => p.id === pid);
    expect(printer).toBeDefined();
    expect(printer.name).toBe('Test Printer');
  });

  it('includes created tasks', async () => {
    const tid = seedTask('Grease rods');
    const res = await request(app).get('/api/maintenance');
    expect(res.status).toBe(200);
    const task = res.body.tasks.find(t => t.id === tid);
    expect(task).toBeDefined();
    expect(task.name).toBe('Grease rods');
  });
});

describe('POST /api/maintenance/tasks', () => {
  it('creates a maintenance task', async () => {
    const res = await request(app)
      .post('/api/maintenance/tasks')
      .send({ name: 'Grease lead screws' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Grease lead screws');
  });

  it('rejects empty name', async () => {
    const res = await request(app)
      .post('/api/maintenance/tasks')
      .send({ name: '' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/maintenance/done/:taskId/:printerId', () => {
  it('returns 404 for unknown task/printer', async () => {
    const res = await request(app).post('/api/maintenance/done/999/999');
    expect(res.status).toBe(404);
  });

  it('logs a task as done', async () => {
    const pid = seedPrinter();
    const tid = seedTask();

    const res = await request(app).post(`/api/maintenance/done/${tid}/${pid}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
