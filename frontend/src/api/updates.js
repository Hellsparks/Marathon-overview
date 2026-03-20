export async function checkForUpdate() {
  const res = await fetch('/api/updates/check');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function applyUpdate(tag) {
  const res = await fetch('/api/updates/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function pullAndRestart() {
  const res = await fetch('/api/updates/pull-restart', { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getApplyStatus() {
  const res = await fetch('/api/updates/apply-status');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getUpdateChannel() {
  const res = await fetch('/api/updates/channel');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function setUpdateChannel(channel) {
  const res = await fetch('/api/updates/channel', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getReleases() {
  const res = await fetch('/api/updates/releases');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getDevCommits() {
  const res = await fetch('/api/updates/dev-commits');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
