export async function checkForUpdate() {
  const res = await fetch('/api/updates/check');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function applyUpdate() {
  const res = await fetch('/api/updates/apply', { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getApplyStatus() {
  const res = await fetch('/api/updates/apply-status');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
