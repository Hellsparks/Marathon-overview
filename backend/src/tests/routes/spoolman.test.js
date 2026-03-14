const request = require('supertest');
const { resetDb } = require('../helpers/db');
const app = require('../../app');

beforeEach(() => resetDb());

describe('GET /api/spoolman/storage-location', () => {
    it('returns the default value seeded by migration', async () => {
        const res = await request(app).get('/api/spoolman/storage-location');
        expect(res.status).toBe(200);
        expect(res.body.storage_location).toBe('Storage');
    });
});

describe('PUT /api/spoolman/storage-location', () => {
    it('updates the storage location name', async () => {
        const res = await request(app)
            .put('/api/spoolman/storage-location')
            .send({ storage_location: 'Shelf A' });
        expect(res.status).toBe(200);
        expect(res.body.storage_location).toBe('Shelf A');
        expect(res.body.ok).toBe(true);
    });

    it('persists the updated value on subsequent GET', async () => {
        await request(app)
            .put('/api/spoolman/storage-location')
            .send({ storage_location: 'Warehouse' });
        const res = await request(app).get('/api/spoolman/storage-location');
        expect(res.status).toBe(200);
        expect(res.body.storage_location).toBe('Warehouse');
    });

    it('trims whitespace from the value', async () => {
        await request(app)
            .put('/api/spoolman/storage-location')
            .send({ storage_location: '  Shelf B  ' });
        const res = await request(app).get('/api/spoolman/storage-location');
        expect(res.body.storage_location).toBe('Shelf B');
    });

    it('rejects an empty string', async () => {
        const res = await request(app)
            .put('/api/spoolman/storage-location')
            .send({ storage_location: '' });
        expect(res.status).toBe(400);
    });

    it('rejects a whitespace-only string', async () => {
        const res = await request(app)
            .put('/api/spoolman/storage-location')
            .send({ storage_location: '   ' });
        expect(res.status).toBe(400);
    });

    it('rejects a missing field', async () => {
        const res = await request(app)
            .put('/api/spoolman/storage-location')
            .send({});
        expect(res.status).toBe(400);
    });

    it('can be updated multiple times', async () => {
        await request(app).put('/api/spoolman/storage-location').send({ storage_location: 'First' });
        await request(app).put('/api/spoolman/storage-location').send({ storage_location: 'Second' });
        const res = await request(app).get('/api/spoolman/storage-location');
        expect(res.body.storage_location).toBe('Second');
    });
});

describe('PATCH /api/spoolman/spools/:id', () => {
    it('returns 400 when Spoolman URL is not configured', async () => {
        // In test DB Spoolman URL is empty — proxy endpoints return 400
        const res = await request(app)
            .patch('/api/spoolman/spools/1')
            .send({ location: null });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/spoolman url not configured/i);
    });
});
