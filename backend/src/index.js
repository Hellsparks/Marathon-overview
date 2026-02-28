const app = require('./app');
const { getDb } = require('./db');
const { startPolling, stopPolling } = require('./services/poller');
const statsRouter = require('./routes/stats'); // Added this line

const PORT = process.env.PORT || 3000;

// Initialize DB (runs migrations synchronously)
getDb();

// Add routes to the app
app.use('/api/stats', statsRouter); // Added this line

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
