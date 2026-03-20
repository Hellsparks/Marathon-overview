/**
 * Test DB helper.
 * Sets DB_PATH to :memory: so every test run gets a clean in-memory database.
 * Call resetDb() in beforeEach to wipe state between tests.
 */

process.env.DB_PATH = ':memory:';

const { closeDb, getDb } = require('../../db');

function resetDb() {
  closeDb();
  // Opening a new :memory: db gives a completely fresh schema
  getDb();
}

module.exports = { resetDb, getDb };
