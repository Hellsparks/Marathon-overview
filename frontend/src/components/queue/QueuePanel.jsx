import QueueItem from './QueueItem';
import { removeFromQueue, startQueue } from '../../api/queue';

export default function QueuePanel({ printerId, queue, onRefresh }) {
  const jobs = queue?.queued_jobs ?? [];
  const queueState = queue?.queue_state ?? 'unknown';

  async function handleRemove(jobId) {
    try {
      await removeFromQueue(printerId, jobId);
      onRefresh?.();
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleStart() {
    try {
      await startQueue(printerId);
      onRefresh?.();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className="queue-panel">
      <div className="queue-header">
        <div className="queue-state-info">
          Queue status: <strong>{queueState}</strong>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleStart}
          disabled={!jobs.length || queueState === 'loading'}
        >
          Start Queue
        </button>
      </div>

      {jobs.length === 0 ? (
        <p className="empty-state">Queue is empty. Send files from the Files page.</p>
      ) : (
        <div className="queue-list">
          {jobs.map(job => (
            <QueueItem key={job.job_id} job={job} onRemove={handleRemove} />
          ))}
        </div>
      )}
    </div>
  );
}
