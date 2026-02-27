// Optional API key validation for the OctoPrint-compatible endpoint.
// If OCTOPRINT_API_KEY env var is not set, all requests are allowed through.
function apiKeyAuth(req, res, next) {
  const required = process.env.OCTOPRINT_API_KEY;
  if (!required) return next();

  const provided = req.headers['x-api-key'];
  if (provided === required) return next();

  res.status(403).json({ error: 'Invalid or missing X-Api-Key' });
}

module.exports = apiKeyAuth;
