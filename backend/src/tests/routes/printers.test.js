const request = require('supertest');
const { resetDb, getDb } = require('../helpers/db');
const app = require('../../app');

beforeEach(() => resetDb());

describe('GET /api/printers', () => {
  it('returns empty array when no printers exist', async () => {
    const res = await request(app).get('/api/printers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns printers ordered by name', async () => {
    const db = getDb();
    db.prepare("INSERT INTO printers (name, host, port, firmware_type) VALUES ('Zeta', 'z.local', 7125, 'moonraker')").run();
    db.prepare("INSERT INTO printers (name, host, port, firmware_type) VALUES ('Alpha', 'a.local', 7125, 'moonraker')").run();

    const res = await request(app).get('/api/printers');
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('Alpha');
    expect(res.body[1].name).toBe('Zeta');
  });

  it('normalizes filament_types from JSON string to array', async () => {
    const db = getDb();
    db.prepare("INSERT INTO printers (name, host, port, firmware_type, filament_types) VALUES ('P1', 'p.local', 7125, 'moonraker', '[\"PLA\",\"PETG\"]')").run();

    const res = await request(app).get('/api/printers');
    expect(res.body[0].filament_types).toEqual(['PLA', 'PETG']);
  });
});

describe('POST /api/printers', () => {
  it('requires name and host', async () => {
    const res = await request(app).post('/api/printers').send({ name: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('creates a printer with defaults', async () => {
    const res = await request(app)
      .post('/api/printers')
      .send({ name: 'My Printer', host: '192.168.1.10' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('My Printer');
    expect(res.body.firmware_type).toBe('moonraker');
    expect(res.body.port).toBe(7125);
    expect(res.body.filament_types).toEqual([]);
  });

  it('sets correct default port for octoprint', async () => {
    const res = await request(app)
      .post('/api/printers')
      .send({ name: 'Octo', host: '192.168.1.11', firmware_type: 'octoprint' });

    expect(res.status).toBe(201);
    expect(res.body.port).toBe(80);
  });

  it('sets correct default port for bambu', async () => {
    const res = await request(app)
      .post('/api/printers')
      .send({ name: 'Bambu', host: '192.168.1.12', firmware_type: 'bambu' });

    expect(res.status).toBe(201);
    expect(res.body.port).toBe(8883);
  });
});

describe('PUT /api/printers/:id', () => {
  it('returns 404 for unknown printer', async () => {
    const res = await request(app).put('/api/printers/99999').send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  it('updates only provided fields', async () => {
    const create = await request(app)
      .post('/api/printers')
      .send({ name: 'Original', host: '10.0.0.1' });

    const id = create.body.id;

    const update = await request(app)
      .put(`/api/printers/${id}`)
      .send({ name: 'Updated' });

    expect(update.status).toBe(200);
    expect(update.body.name).toBe('Updated');
    expect(update.body.host).toBe('10.0.0.1'); // unchanged
  });
});

describe('DELETE /api/printers/:id', () => {
  it('returns 404 for unknown printer', async () => {
    const res = await request(app).delete('/api/printers/99999');
    expect(res.status).toBe(404);
  });

  it('deletes an existing printer', async () => {
    const create = await request(app)
      .post('/api/printers')
      .send({ name: 'ToDelete', host: '10.0.0.2' });

    const id = create.body.id;
    const del = await request(app).delete(`/api/printers/${id}`);
    expect(del.status).toBe(200);

    const list = await request(app).get('/api/printers');
    expect(list.body.find(p => p.id === id)).toBeUndefined();
  });
});
