Add a new API route group to Marathon.

## Steps

1. **Create the router file:** `backend/src/routes/<feature>.js`
   ```js
   const express = require('express');
   const { getDb } = require('../db');
   const router = express.Router();

   // GET /api/<feature>
   router.get('/', (req, res) => {
     // ...
     res.json({ ... });
   });

   module.exports = router;
   ```

2. **Mount in app.js:**
   ```js
   const featureRouter = require('./routes/<feature>');
   // ...
   app.use('/api/<feature>', featureRouter);
   ```
   Add the require near the top with other requires, and the `app.use` in the route mounting section.

3. **Add a frontend API wrapper:** `frontend/src/api/<feature>.js`
   ```js
   const API = import.meta.env.VITE_API_URL || '';

   export async function getFeature() {
     const res = await fetch(`${API}/api/<feature>`);
     if (!res.ok) throw new Error(await res.text());
     return res.json();
   }
   ```

4. **Write a backend test:** `backend/src/tests/routes/<feature>.test.js`
   Use the in-memory DB pattern from existing tests (e.g. `printers.test.js`):
   ```js
   const request = require('supertest');
   const app = require('../../app');

   // Tests use ':memory:' DB — no real data touched
   beforeAll(() => { /* DB setup if needed */ });

   describe('GET /api/<feature>', () => {
     it('returns 200', async () => {
       const res = await request(app).get('/api/<feature>');
       expect(res.status).toBe(200);
     });
   });
   ```

5. **Update AGENTS.md** — add the new routes to the API Routes table.

6. **Run tests:** `/run-tests`
