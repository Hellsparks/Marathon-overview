const app = require('./app');
const { getDb } = require('./db');
const { startPolling, stopPolling } = require('./services/poller');

const PORT = process.env.PORT || 3000;

// Initialize DB (runs migrations synchronously)
getDb();

const server = app.listen(PORT, () => {
  console.log(`[Marathon] Backend running on port ${PORT}`);
  startPolling();
});

process.on('SIGTERM', () => {
  console.log('[Marathon] Shutting down...');
  stopPolling();
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  stopPolling();
  server.close(() => process.exit(0));
});
