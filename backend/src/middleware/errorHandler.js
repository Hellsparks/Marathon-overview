function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  console.error(`[Error] ${req.method} ${req.path}:`, err.message);
  res.status(status).json({ error: err.message || 'Internal server error' });
}

module.exports = errorHandler;
