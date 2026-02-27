const STATE_LABELS = {
  printing: 'Printing',
  paused:   'Paused',
  standby:  'Idle',
  error:    'Error',
  offline:  'Offline',
  complete: 'Complete',
};

export default function StatusBadge({ state }) {
  const label = STATE_LABELS[state] || state;
  return <span className={`status-badge status-badge--${state}`}>{label}</span>;
}
