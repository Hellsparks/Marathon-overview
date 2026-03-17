// API key validation for the OctoPrint-compatible endpoint.
// Checks per-printer slicer_api_key first, then falls back to global OCTOPRINT_API_KEY.
// Attaches req.targetPrinter if a per-printer key matches.
const { getDb } = require('../db');

function apiKeyAuth(req, res, next) {
  const provided = req.headers['x-api-key'];

  // Try per-printer key first
  if (provided) {
    const db = getDb();
    const printer = db.prepare(
      "SELECT * FROM printers WHERE slicer_api_key = ? AND enabled = 1"
    ).get(provided);
    if (printer) {
      req.targetPrinter = printer;
      return next();
    }
  }

  // Fall back to global key
  const required = process.env.OCTOPRINT_API_KEY;
  if (!required) return next();
  if (provided === required) return next();

  res.status(403).json({ error: 'Invalid or missing X-Api-Key' });
}

module.exports = apiKeyAuth;
