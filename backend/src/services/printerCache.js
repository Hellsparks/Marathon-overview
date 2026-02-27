// In-memory store of the latest Moonraker status per printer ID.
// Simple Map — entries replaced every poll cycle (~3s) by poller.js.
const cache = new Map();

module.exports = {
  set(printerId, status) {
    cache.set(String(printerId), status);
  },
  get(printerId) {
    return cache.get(String(printerId)) || { _online: false };
  },
  getAll() {
    return Object.fromEntries(cache);
  },
};
